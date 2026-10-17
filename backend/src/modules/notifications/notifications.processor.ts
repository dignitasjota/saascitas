import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from './mailer.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { formatPrice } from './notifications.utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export type NotificationJobData =
  | { type: 'booking_confirmation'; appointmentId: string }
  | { type: 'booking_reminder'; appointmentId: string };

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>) {
    this.logger.debug(`Processing job ${job.name} (${job.id})`);

    try {
      switch (job.data.type) {
        case 'booking_confirmation':
          await this.sendConfirmation(job.data.appointmentId);
          break;
        case 'booking_reminder':
          await this.sendReminder(job.data.appointmentId);
          break;
        default:
          this.logger.warn(`Unknown job type: ${(job.data as any).type}`);
      }
    } catch (err) {
      this.logger.error(`Job ${job.name} (${job.id}) failed: ${err}`, err instanceof Error ? err.stack : undefined);
      throw err; // Re-throw so BullMQ can retry
    }
  }

  private async sendConfirmation(appointmentId: string) {
    const appt = await this.loadAppointment(appointmentId);
    if (!appt) return;

    const email = appt.customer.email;
    if (!email) {
      this.logger.debug(`Appointment ${appointmentId}: no customer email, skipping`);
      return;
    }

    // Get cancel token
    const cancelToken = await this.prisma.bookingToken.findFirst({
      where: { appointmentId, action: 'cancel', usedAt: null },
    });

    const confirmToken = await this.prisma.bookingToken.findFirst({
      where: { appointmentId, action: 'confirm', usedAt: null },
    });

    const frontendUrl = this.frontendUrl();

    await this.mailer.sendMail({
      to: email,
      subject: `Cita confirmada — ${appt.tenant.name}`,
      template: 'booking-confirmation',
      context: {
        businessName: appt.tenant.name,
        businessPhone: appt.tenant.phone ?? '',
        customerName: `${appt.customer.firstName} ${appt.customer.lastName}`,
        serviceName: appt.service?.name ?? '',
        employeeName: `${appt.employee.firstName} ${appt.employee.lastName}`,
        date: format(appt.startsAt, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }),
        time: format(appt.startsAt, 'HH:mm', { locale: es }),
        duration: appt.durationMinutes,
        price: appt.priceCents ? formatPrice(appt.priceCents) : null,
        confirmUrl: confirmToken
          ? `${frontendUrl}/cita/confirmar/${confirmToken.token}`
          : null,
        cancelUrl: cancelToken
          ? `${frontendUrl}/cita/cancelar/${cancelToken.token}`
          : null,
      },
    });

    // Mark notification as sent in DB
    const subject = `Cita confirmada — ${appt.tenant.name}`;
    await this.recordNotification(appointmentId, 'booking_confirmation', email, subject);
    this.logger.log(`Confirmation email sent to ${email} for appointment ${appointmentId}`);
  }

  private async sendReminder(appointmentId: string) {
    const appt = await this.loadAppointment(appointmentId);
    if (!appt) return;

    // Don't send reminder for cancelled/completed appointments
    if (['cancelled', 'completed', 'no_show'].includes(appt.status)) {
      this.logger.debug(`Appointment ${appointmentId} is ${appt.status}, skipping reminder`);
      return;
    }

    // Don't send a "your appointment is tomorrow" reminder for an appointment
    // that has already passed (e.g. it was moved earlier after the job was
    // queued for the original time).
    if (appt.startsAt.getTime() < Date.now()) {
      this.logger.debug(`Appointment ${appointmentId} already passed, skipping reminder`);
      return;
    }

    const email = appt.customer.email;
    if (!email) {
      this.logger.debug(`Appointment ${appointmentId}: no customer email, skipping reminder`);
      return;
    }

    const cancelToken = await this.prisma.bookingToken.findFirst({
      where: { appointmentId, action: 'cancel', usedAt: null },
    });

    const frontendUrl = this.frontendUrl();

    await this.mailer.sendMail({
      to: email,
      subject: `Recordatorio: tu cita es mañana — ${appt.tenant.name}`,
      template: 'booking-reminder',
      context: {
        businessName: appt.tenant.name,
        businessPhone: appt.tenant.phone ?? '',
        customerName: `${appt.customer.firstName} ${appt.customer.lastName}`,
        serviceName: appt.service?.name ?? '',
        employeeName: `${appt.employee.firstName} ${appt.employee.lastName}`,
        date: format(appt.startsAt, "EEEE d 'de' MMMM", { locale: es }),
        time: format(appt.startsAt, 'HH:mm', { locale: es }),
        duration: appt.durationMinutes,
        price: appt.priceCents ? formatPrice(appt.priceCents) : null,
        cancelUrl: cancelToken
          ? `${frontendUrl}/cita/cancelar/${cancelToken.token}`
          : null,
      },
    });

    const reminderSubject = `Recordatorio: tu cita es mañana — ${appt.tenant.name}`;
    await this.recordNotification(appointmentId, 'booking_reminder', email, reminderSubject);
    this.logger.log(`Reminder email sent to ${email} for appointment ${appointmentId}`);
  }

  /**
   * Email links open frontend pages (/cita/...), which POST to the API. The
   * API actions are POST-only, so linking straight to them would 404.
   */
  private frontendUrl(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private async loadAppointment(appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        tenant: { select: { name: true, phone: true } },
        customer: { select: { firstName: true, lastName: true, email: true } },
        employee: { select: { firstName: true, lastName: true } },
        service: { select: { name: true } },
      },
    });

    if (!appt) {
      this.logger.warn(`Appointment ${appointmentId} not found`);
    }
    return appt;
  }

  private async recordNotification(
    appointmentId: string,
    notificationType: string,
    recipient: string,
    subject: string,
  ) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { tenantId: true, customerId: true },
    });
    if (!appt) return;

    await this.prisma.notification.create({
      data: {
        tenantId: appt.tenantId,
        customerId: appt.customerId ?? undefined,
        appointmentId,
        type: 'email',
        template: notificationType,
        recipient,
        subject,
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }
}

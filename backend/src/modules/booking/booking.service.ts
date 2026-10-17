import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../appointments/availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  isOverlapConstraintViolation,
  isUniqueViolation,
} from '../../common/utils/prisma-errors';
import { zonedWallTimeToUtc } from '../../common/utils/timezone';
import { CreateBookingDto } from './dto/booking.dto';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Public info about the business (for the booking page header).
   */
  async getBusinessInfo(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        city: true,
        logoUrl: true,
        timezone: true,
        bookingSettings: true,
        planStatus: true,
        trialEndsAt: true,
      },
    });

    if (!tenant) throw new NotFoundException('Business not found');

    // Tenant must be active or trialing
    if (!['active', 'trialing'].includes(tenant.planStatus)) {
      throw new GoneException('Online booking is not available for this business');
    }

    return tenant;
  }

  /**
   * Public services list for the booking page.
   */
  async getPublicServices(slug: string) {
    const tenant = await this.getBusinessInfo(slug);

    return this.prisma.service.findMany({
      where: {
        tenantId: tenant.id,
        isPublic: true,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
        color: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Public employees list (for employee selection step).
   */
  async getPublicEmployees(slug: string, serviceId?: string) {
    const tenant = await this.getBusinessInfo(slug);

    const where: any = {
      tenantId: tenant.id,
      isActive: true,
      deletedAt: null,
    };

    // If a serviceId is given, filter only employees that offer that service
    if (serviceId) {
      where.employeeServices = { some: { serviceId } };
    }

    return this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        color: true,
        specialties: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }

  /**
   * Get available slots for a given employee + date + service.
   */
  async getAvailableSlots(
    slug: string,
    employeeId: string,
    date: string,
    serviceId: string,
  ) {
    const tenant = await this.getBusinessInfo(slug);
    const settings = tenant.bookingSettings as any;

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: tenant.id, isPublic: true, deletedAt: null },
    });

    if (!service) throw new NotFoundException('Service not found');

    const slots = await this.availabilityService.getAvailableSlots(
      tenant.id,
      employeeId,
      date,
      service.durationMinutes,
    );

    // Only offer slots the client can actually book: available, and within the
    // min/max advance window (so the last booking step doesn't reject them).
    const now = Date.now();
    const minAdvanceMs = (settings?.minAdvanceHours ?? 2) * 60 * 60 * 1000;
    const maxAdvanceMs = (settings?.maxAdvanceDays ?? 30) * 24 * 60 * 60 * 1000;

    return slots
      .filter((s) => s.available)
      .filter((s) => {
        const at = zonedWallTimeToUtc(date, s.start, tenant.timezone).getTime();
        return at - now >= minAdvanceMs && at - now <= maxAdvanceMs;
      })
      .map((s) => s.start);
  }

  /**
   * Create a booking from the public page.
   */
  async createBooking(slug: string, dto: CreateBookingDto) {
    const tenant = await this.getBusinessInfo(slug);
    const settings = tenant.bookingSettings as any;

    // Validate service
    const service = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        tenantId: tenant.id,
        isPublic: true,
        isActive: true,
        deletedAt: null,
      },
    });
    if (!service) throw new BadRequestException('Service not found');

    // Validate employee
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!employee) throw new BadRequestException('Employee not found');

    // Validate the employee actually offers this service
    const offersService = await this.prisma.employeeService.findFirst({
      where: {
        tenantId: tenant.id,
        employeeId: dto.employeeId,
        serviceId: dto.serviceId,
      },
    });
    if (!offersService) {
      throw new BadRequestException(
        'The selected professional does not offer this service',
      );
    }

    // Build datetime: dto.slot ("HH:MM") is wall-clock time in the tenant's
    // timezone, converted here to the UTC instant we store.
    const startsAt = zonedWallTimeToUtc(dto.date, dto.slot, tenant.timezone);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60 * 1000);

    // Validate minimum advance time
    const minAdvanceMs = (settings?.minAdvanceHours ?? 2) * 60 * 60 * 1000;
    if (startsAt.getTime() - Date.now() < minAdvanceMs) {
      throw new BadRequestException(
        `Bookings must be made at least ${settings?.minAdvanceHours ?? 2} hours in advance`,
      );
    }

    // Validate maximum advance window
    const maxAdvanceDays = settings?.maxAdvanceDays ?? 30;
    const maxAdvanceMs = maxAdvanceDays * 24 * 60 * 60 * 1000;
    if (startsAt.getTime() - Date.now() > maxAdvanceMs) {
      throw new BadRequestException(
        `Bookings cannot be made more than ${maxAdvanceDays} days in advance`,
      );
    }

    // Validate the slot against real availability (working hours, schedule
    // exceptions, buffer and existing appointments) — not just raw overlap.
    // This rejects direct POSTs with off-grid or out-of-hours slots.
    const daySlots = await this.availabilityService.getAvailableSlots(
      tenant.id,
      dto.employeeId,
      dto.date,
      service.durationMinutes,
    );
    const slotOk = daySlots.some((s) => s.start === dto.slot && s.available);
    if (!slotOk) {
      throw new ConflictException(
        'This time slot is not available. Please choose another.',
      );
    }

    // Find or create customer by phone within this tenant. The partial unique
    // index on (tenant_id, phone) closes the race: if a concurrent booking
    // created the same customer between our find and create, the create hits
    // P2002 and we re-fetch the winner instead of inserting a duplicate.
    let customer = await this.prisma.customer.findFirst({
      where: { tenantId: tenant.id, phone: dto.phone, deletedAt: null },
    });

    if (!customer) {
      try {
        customer = await this.prisma.customer.create({
          data: {
            tenantId: tenant.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            email: dto.email,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          customer = await this.prisma.customer.findFirst({
            where: { tenantId: tenant.id, phone: dto.phone, deletedAt: null },
          });
        }
        if (!customer) throw err;
      }
    }

    // Create appointment in a transaction
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({
          data: {
            tenantId: tenant.id,
            employeeId: dto.employeeId,
            customerId: customer!.id,
            serviceId: dto.serviceId,
            startsAt,
            endsAt,
            durationMinutes: service.durationMinutes,
            priceCents: service.priceCents,
            customerNotes: dto.notes,
            source: 'booking_page',
            status: settings?.autoConfirm ? 'confirmed' : 'pending',
          },
        });

        // Create confirmation token (valid 48h)
        const confirmToken = randomBytes(32).toString('hex');
        const cancelToken = randomBytes(32).toString('hex');

        await tx.bookingToken.create({
          data: {
            tenantId: tenant.id,
            appointmentId: appointment.id,
            token: confirmToken,
            action: 'confirm',
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        });

        await tx.bookingToken.create({
          data: {
            tenantId: tenant.id,
            appointmentId: appointment.id,
            token: cancelToken,
            action: 'cancel',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        // Update customer stats. An existing customer's email is only filled
        // in when missing — never overwritten from an anonymous public form,
        // or anyone knowing a phone number could redirect that customer's
        // booking emails to themselves.
        await tx.customer.update({
          where: { id: customer!.id },
          data: {
            totalAppointments: { increment: 1 },
            lastAppointmentAt: startsAt,
            ...(!customer!.email && dto.email && { email: dto.email }),
          },
        });

        return { appointment, confirmToken, cancelToken };
      });
    } catch (err) {
      // Race safety net: the slot was taken by a concurrent booking between
      // the isSlotAvailable check above and this insert. The DB exclusion
      // constraint rejects the overlap; surface it as a clean 409.
      if (isOverlapConstraintViolation(err)) {
        throw new ConflictException(
          'This time slot is no longer available. Please choose another.',
        );
      }
      throw err;
    }

    // Queue notifications (fire-and-forget — don't block the response)
    void this.notificationsService
      .queueBookingConfirmation(result.appointment.id)
      .catch((err) => this.logger.error('Failed to queue confirmation email', err));

    void this.notificationsService
      .queueBookingReminder(result.appointment.id, startsAt)
      .catch((err) => this.logger.error('Failed to queue reminder email', err));

    return {
      appointmentId: result.appointment.id,
      status: result.appointment.status,
      startsAt: result.appointment.startsAt,
      endsAt: result.appointment.endsAt,
      service: { name: service.name, durationMinutes: service.durationMinutes, priceCents: service.priceCents },
      employee: { firstName: employee.firstName, lastName: employee.lastName },
      // Echo what the visitor typed, never the stored customer record: the
      // customer is matched by phone, so returning it would reveal the real
      // name behind any phone number to an anonymous caller.
      customer: { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
      cancelToken: result.cancelToken,
    };
  }

  /**
   * Confirm a booking via token link (from email).
   */
  async confirmBooking(token: string) {
    const record = await this.prisma.bookingToken.findFirst({
      where: { token, action: 'confirm', usedAt: null },
      include: { appointment: true },
    });

    if (!record) throw new NotFoundException('Invalid or expired confirmation link');
    if (record.expiresAt < new Date()) throw new GoneException('This confirmation link has expired');

    // Do not resurrect a terminal appointment: a valid confirm token must not
    // flip a cancelled/completed/no-show booking back to confirmed.
    const appt = record.appointment;
    if (['cancelled', 'completed', 'no_show'].includes(appt.status)) {
      throw new BadRequestException(`Appointment is already ${appt.status}`);
    }

    // Claim the token and move the appointment atomically and conditionally,
    // so a concurrent cancellation can't be overwritten by this confirm.
    await this.prisma.$transaction(async (tx) => {
      const token = await tx.bookingToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (token.count === 0) {
        throw new NotFoundException('Invalid or expired confirmation link');
      }
      const appt = await tx.appointment.updateMany({
        where: { id: record.appointmentId, status: 'pending' },
        data: { status: 'confirmed' },
      });
      if (appt.count === 0) {
        // Already confirmed (e.g. autoConfirm) is fine; anything else changed
        // under us and must not be resurrected.
        const current = await tx.appointment.findUnique({
          where: { id: record.appointmentId },
          select: { status: true },
        });
        if (current?.status !== 'confirmed' && current?.status !== 'in_progress') {
          throw new BadRequestException(`Appointment is already ${current?.status}`);
        }
      }
    });

    return { message: 'Appointment confirmed successfully' };
  }

  /**
   * Cancel a booking via token link (from email).
   */
  async cancelBooking(token: string, reason?: string) {
    const record = await this.prisma.bookingToken.findFirst({
      where: { token, action: 'cancel', usedAt: null },
      include: { appointment: true },
    });

    if (!record) throw new NotFoundException('Invalid or expired cancellation link');
    if (record.expiresAt < new Date()) throw new GoneException('This cancellation link has expired');

    // A customer may only cancel an upcoming appointment that hasn't been
    // dealt with yet: not one in progress, completed, or marked as a no-show
    // (which would erase the no-show from the business's records).
    const appt = record.appointment;
    if (appt.status !== 'pending' && appt.status !== 'confirmed') {
      throw new BadRequestException(`Appointment is already ${appt.status}`);
    }
    if (appt.startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('This appointment has already started');
    }

    await this.prisma.$transaction(async (tx) => {
      const token = await tx.bookingToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (token.count === 0) {
        throw new NotFoundException('Invalid or expired cancellation link');
      }
      // Compare-and-set on the status we checked, so a concurrent
      // cancellation from the dashboard can't decrement the stats twice.
      const cancelled = await tx.appointment.updateMany({
        where: { id: record.appointmentId, status: appt.status },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason ?? 'Cancelled by customer',
        },
      });
      if (cancelled.count === 0) {
        throw new BadRequestException('Appointment status changed meanwhile');
      }
      // Undo the +1 added to the customer at booking time.
      await tx.customer.update({
        where: { id: appt.customerId },
        data: { totalAppointments: { decrement: 1 } },
      });
    });

    // Remove queued reminder if not yet sent
    void this.notificationsService
      .cancelReminder(record.appointmentId)
      .catch(() => null);

    return { message: 'Appointment cancelled successfully' };
  }
}

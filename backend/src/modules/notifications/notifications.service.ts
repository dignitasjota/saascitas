import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationJobData } from './notifications.processor';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<NotificationJobData>,
  ) {}

  /**
   * Queue a booking confirmation email (sent immediately).
   */
  async queueBookingConfirmation(appointmentId: string) {
    await this.queue.add(
      'booking_confirmation',
      { type: 'booking_confirmation', appointmentId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
    this.logger.debug(`Queued confirmation for appointment ${appointmentId}`);
  }

  /**
   * Queue a reminder email to be sent 24h before the appointment.
   * If the appointment is less than 25h away, skip.
   */
  async queueBookingReminder(appointmentId: string, startsAt: Date) {
    const now = Date.now();
    const apptMs = startsAt.getTime();
    const reminderMs = apptMs - 24 * 60 * 60 * 1000; // 24h before
    const delay = reminderMs - now;

    if (delay < 60_000) {
      // Less than 1 minute until reminder time — too late, skip
      this.logger.debug(
        `Appointment ${appointmentId} is too soon for a reminder (delay=${delay}ms)`,
      );
      return;
    }

    await this.queue.add(
      'booking_reminder',
      { type: 'booking_reminder', appointmentId },
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
        jobId: `reminder-${appointmentId}`, // deduplicate
      },
    );

    const reminderDate = new Date(reminderMs).toISOString();
    this.logger.debug(
      `Queued reminder for appointment ${appointmentId} at ${reminderDate}`,
    );
  }

  /**
   * Cancel a queued reminder (e.g. when appointment is cancelled).
   */
  async cancelReminder(appointmentId: string) {
    const jobId = `reminder-${appointmentId}`;
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.debug(`Cancelled reminder job for appointment ${appointmentId}`);
    }
  }

  /**
   * Reschedule the reminder after an appointment is moved. The delayed job is
   * keyed by appointmentId, so we must remove the stale one before queueing a
   * new one at the new time.
   */
  async rescheduleReminder(appointmentId: string, newStartsAt: Date) {
    await this.cancelReminder(appointmentId);
    await this.queueBookingReminder(appointmentId, newStartsAt);
  }
}

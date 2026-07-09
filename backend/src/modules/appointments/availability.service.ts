import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import {
  zonedWallTimeToUtc,
  civilDayOfWeek,
  startOfDayUtc,
  endOfDayUtc,
} from '../../common/utils/timezone';

const DEFAULT_TZ = 'Europe/Madrid';

export interface TimeSlot {
  start: string; // "09:00"
  end: string;   // "10:00"
  available: boolean;
}

const DAY_MAP: Record<number, DayOfWeek> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get available time slots for an employee on a specific date.
   */
  async getAvailableSlots(
    tenantId: string,
    employeeId: string,
    date: string,
    durationMinutes: number,
  ): Promise<TimeSlot[]> {
    // Business timezone: slots and day-of-week are wall-clock in the tenant's
    // zone, not the server's. `date` is a civil date (YYYY-MM-DD).
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const tz = tenant?.timezone ?? DEFAULT_TZ;

    const dayOfWeek = DAY_MAP[civilDayOfWeek(date)];

    // 1. Check for schedule exceptions on this date
    const exception = await this.prisma.scheduleException.findFirst({
      where: {
        employeeId,
        tenantId,
        date: new Date(`${date}T00:00:00.000Z`), // @db.Date is stored at UTC midnight
      },
    });

    // Day off
    if (exception && !exception.isAvailable) {
      return [];
    }

    // 2. Get working hours for this day
    let workingPeriods: { start: string; end: string }[];

    if (exception && exception.isAvailable && exception.startTime && exception.endTime) {
      // Special hours for this date
      workingPeriods = [{ start: exception.startTime, end: exception.endTime }];
    } else {
      // Regular working hours
      const hours = await this.prisma.workingHour.findMany({
        where: {
          employeeId,
          tenantId,
          dayOfWeek,
          isActive: true,
        },
        orderBy: { startTime: 'asc' },
      });

      if (hours.length === 0) return [];

      workingPeriods = hours.map((h) => ({ start: h.startTime, end: h.endTime }));
    }

    // 3. Get existing appointments that START on this civil day (tenant tz)
    const dayStart = startOfDayUtc(date, tz);
    const dayEnd = endOfDayUtc(date, tz);

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        employeeId,
        tenantId,
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['cancelled', 'no_show'] },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });

    // 4. Generate slots and mark availability
    const slots: TimeSlot[] = [];

    for (const period of workingPeriods) {
      const periodSlots = this.generateSlots(
        period.start,
        period.end,
        durationMinutes,
      );

      for (const slot of periodSlots) {
        const slotStart = zonedWallTimeToUtc(date, slot.start, tz);
        const slotEnd = zonedWallTimeToUtc(date, slot.end, tz);

        const hasConflict = existingAppointments.some((appt) => {
          return slotStart < appt.endsAt && slotEnd > appt.startsAt;
        });

        slots.push({
          start: slot.start,
          end: slot.end,
          available: !hasConflict,
        });
      }
    }

    return slots;
  }

  /**
   * Check if a specific time slot is available for an employee.
   */
  async isSlotAvailable(
    tenantId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: string,
  ): Promise<boolean> {
    const where: any = {
      employeeId,
      tenantId,
      status: { notIn: ['cancelled', 'no_show'] },
      // Overlapping: existing.start < new.end AND existing.end > new.start
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    };

    if (excludeAppointmentId) {
      where.id = { not: excludeAppointmentId };
    }

    const conflict = await this.prisma.appointment.findFirst({ where });

    return !conflict;
  }

  /**
   * Generate time slots within a period.
   * Example: generateSlots("09:00", "14:00", 60) →
   *   [{start:"09:00",end:"10:00"}, {start:"10:00",end:"11:00"}, ...]
   */
  private generateSlots(
    periodStart: string,
    periodEnd: string,
    durationMinutes: number,
  ): { start: string; end: string }[] {
    const slots: { start: string; end: string }[] = [];

    let currentMinutes = this.timeToMinutes(periodStart);
    const endMinutes = this.timeToMinutes(periodEnd);

    while (currentMinutes + durationMinutes <= endMinutes) {
      slots.push({
        start: this.minutesToTime(currentMinutes),
        end: this.minutesToTime(currentMinutes + durationMinutes),
      });
      currentMinutes += durationMinutes;
    }

    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}

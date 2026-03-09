import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

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
    const targetDate = new Date(date);
    const dayOfWeek = DAY_MAP[targetDate.getDay()];

    // 1. Check for schedule exceptions on this date
    const exception = await this.prisma.scheduleException.findFirst({
      where: {
        employeeId,
        tenantId,
        date: targetDate,
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

    // 3. Get existing appointments for this date
    const dayStart = new Date(date + 'T00:00:00');
    const dayEnd = new Date(date + 'T23:59:59');

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        employeeId,
        tenantId,
        startsAt: { gte: dayStart },
        endsAt: { lte: dayEnd },
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
        const slotStart = new Date(`${date}T${slot.start}:00`);
        const slotEnd = new Date(`${date}T${slot.end}:00`);

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

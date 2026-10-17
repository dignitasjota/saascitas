import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_MAX_MONTHLY_APPOINTMENTS, PlanKey } from '../constants/plans';
import { addCivilMonths, formatDateInTz, startOfDayUtc } from './timezone';

const DEFAULT_TZ = 'Europe/Madrid';

export interface MonthlyAppointmentUsage {
  month: string; // "YYYY-MM" in the tenant timezone
  used: number;
  limit: number | null;
}

/**
 * Appointments the tenant has in the calendar month (tenant timezone) that
 * contains `at`, against its plan's monthly limit. Cancelled ones don't count.
 */
export async function getMonthlyAppointmentUsage(
  prisma: PrismaService,
  tenantId: string,
  at: Date = new Date(),
  excludeAppointmentId?: string,
): Promise<MonthlyAppointmentUsage> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, timezone: true },
  });
  const tz = tenant?.timezone ?? DEFAULT_TZ;
  const month = formatDateInTz(at, tz).slice(0, 7);
  const limit = PLAN_MAX_MONTHLY_APPOINTMENTS[(tenant?.plan ?? 'basic') as PlanKey] ?? null;

  const used = await prisma.appointment.count({
    where: {
      tenantId,
      status: { not: 'cancelled' },
      startsAt: {
        gte: startOfDayUtc(`${month}-01`, tz),
        lt: startOfDayUtc(`${addCivilMonths(month, 1)}-01`, tz),
      },
      ...(excludeAppointmentId && { id: { not: excludeAppointmentId } }),
    },
  });

  return { month, used, limit };
}

/**
 * Throw if adding one appointment in the month of `startsAt` would exceed the
 * plan's monthly limit. A soft limit: two simultaneous bookings at 99/100 can
 * both pass, which is acceptable for a plan quota.
 */
export async function assertMonthlyAppointmentQuota(
  prisma: PrismaService,
  tenantId: string,
  startsAt: Date,
  excludeAppointmentId?: string,
): Promise<void> {
  const { used, limit } = await getMonthlyAppointmentUsage(
    prisma,
    tenantId,
    startsAt,
    excludeAppointmentId,
  );
  if (limit !== null && used >= limit) {
    throw new ForbiddenException(
      `Has alcanzado el límite de ${limit} citas al mes de tu plan. Mejora tu plan para añadir más.`,
    );
  }
}

import { ForbiddenException } from '@nestjs/common';
import { assertMonthlyAppointmentQuota, getMonthlyAppointmentUsage } from './plan-limits';

function prismaWith(plan: string, used: number) {
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue({ plan, timezone: 'Europe/Madrid' }) },
    appointment: { count: jest.fn().mockResolvedValue(used) },
  } as any;
}

describe('plan limits: monthly appointments', () => {
  it('counts non-cancelled appointments in the tenant-timezone month', async () => {
    const prisma = prismaWith('basic', 42);
    // 23:30 UTC on Oct 31 is already November 1st in Madrid.
    const usage = await getMonthlyAppointmentUsage(prisma, 't1', new Date('2026-10-31T23:30:00Z'));

    expect(usage).toEqual({ month: '2026-11', used: 42, limit: 100 });
    const where = prisma.appointment.count.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'cancelled' });
    expect(where.startsAt.gte.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(where.startsAt.lt.toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('blocks the 101st appointment of the month on Basic', async () => {
    await expect(
      assertMonthlyAppointmentQuota(prismaWith('basic', 100), 't1', new Date()),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      assertMonthlyAppointmentQuota(prismaWith('basic', 99), 't1', new Date()),
    ).resolves.toBeUndefined();
  });

  it('does not limit paid plans', async () => {
    const prisma = prismaWith('professional', 5000);
    await expect(assertMonthlyAppointmentQuota(prisma, 't1', new Date())).resolves.toBeUndefined();
    expect((await getMonthlyAppointmentUsage(prisma, 't1')).limit).toBeNull();
  });

  it('excludes the appointment being moved from the count', async () => {
    const prisma = prismaWith('basic', 0);
    await assertMonthlyAppointmentQuota(prisma, 't1', new Date(), 'appt-1');
    expect(prisma.appointment.count.mock.calls[0][0].where.id).toEqual({ not: 'appt-1' });
  });
});

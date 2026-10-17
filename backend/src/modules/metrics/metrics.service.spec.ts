import { MetricsService } from './metrics.service';

function setup(rows: any[] = []) {
  const prisma: any = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Madrid' }) },
    appointment: { findMany: jest.fn().mockResolvedValue(rows), groupBy: jest.fn().mockResolvedValue([]) },
    customer: { count: jest.fn().mockResolvedValue(0) },
  };
  return { prisma, service: new MetricsService(prisma) };
}

describe('MetricsService (tenant timezone)', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-10-17 10:00 in Madrid (UTC+2)
    jest.setSystemTime(new Date('2026-10-17T08:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('buckets revenue by the business civil day, not UTC', async () => {
    // 22:30 UTC on the 16th is 00:30 on the 17th in Madrid.
    const { service, prisma } = setup([
      { startsAt: new Date('2026-10-16T22:30:00.000Z'), priceCents: 5000 },
    ]);

    const chart = await service.getRevenueChart('t1', 3);

    expect(chart.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(chart.find((d) => d.date === '2026-10-17')!.revenue).toBe(5000);
    expect(chart.find((d) => d.date === '2026-10-16')!.revenue).toBe(0);

    // Range = [Madrid midnight of the 15th, Madrid midnight of the 18th)
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.startsAt.gte.toISOString()).toBe('2026-10-14T22:00:00.000Z');
    expect(where.startsAt.lt.toISOString()).toBe('2026-10-17T22:00:00.000Z');
  });

  it('uses tenant-timezone calendar months with half-open ranges', async () => {
    const { service, prisma } = setup();

    const months = await service.getMonthlyBreakdown('t1');

    expect(months.map((m) => m.month)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    const lastWhere = prisma.appointment.groupBy.mock.calls[5][0].where;
    expect(lastWhere.startsAt.gte.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    // November 1st in Madrid is already winter time (UTC+1).
    expect(lastWhere.startsAt.lt.toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });
});

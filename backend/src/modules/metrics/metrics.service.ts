import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, subDays, format } from 'date-fns';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dashboard overview: KPIs for the last 30 days vs previous 30 days.
   */
  async getOverview(tenantId: string) {
    const now = new Date();
    const periodStart = subDays(now, 30);
    const prevPeriodStart = subDays(now, 60);
    const prevPeriodEnd = subDays(now, 30);

    const [currentPeriod, prevPeriod, upcoming, topServices, recentActivity] =
      await Promise.all([
        this.getPeriodStats(tenantId, periodStart, now),
        this.getPeriodStats(tenantId, prevPeriodStart, prevPeriodEnd),
        this.getUpcomingCount(tenantId, now),
        this.getTopServices(tenantId, periodStart, now),
        this.getRecentActivity(tenantId),
      ]);

    const revenueDiff = currentPeriod.revenueCents - prevPeriod.revenueCents;
    const apptDiff = currentPeriod.completed - prevPeriod.completed;
    const customersDiff = currentPeriod.newCustomers - prevPeriod.newCustomers;

    return {
      kpis: {
        revenue: {
          current: currentPeriod.revenueCents,
          previous: prevPeriod.revenueCents,
          change: prevPeriod.revenueCents > 0
            ? Math.round((revenueDiff / prevPeriod.revenueCents) * 100)
            : null,
        },
        appointments: {
          completed: currentPeriod.completed,
          cancelled: currentPeriod.cancelled,
          pending: currentPeriod.pending,
          upcoming,
          change: prevPeriod.completed > 0
            ? Math.round((apptDiff / prevPeriod.completed) * 100)
            : null,
        },
        customers: {
          new: currentPeriod.newCustomers,
          change: prevPeriod.newCustomers > 0
            ? Math.round((customersDiff / prevPeriod.newCustomers) * 100)
            : null,
        },
        completionRate: currentPeriod.total > 0
          ? Math.round((currentPeriod.completed / currentPeriod.total) * 100)
          : 0,
      },
      topServices,
      recentActivity,
    };
  }

  /**
   * Revenue chart: daily revenue for the last N days.
   */
  async getRevenueChart(tenantId: string, days = 30) {
    const now = new Date();
    const from = subDays(now, days - 1);

    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: 'completed',
        startsAt: { gte: startOfDay(from), lte: endOfDay(now) },
        priceCents: { not: null },
      },
      select: { startsAt: true, priceCents: true },
      orderBy: { startsAt: 'asc' },
    });

    // Build a map of date → revenue
    const revenueByDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = subDays(now, days - 1 - i);
      revenueByDay.set(format(d, 'yyyy-MM-dd'), 0);
    }

    for (const row of rows) {
      const key = format(row.startsAt, 'yyyy-MM-dd');
      if (revenueByDay.has(key)) {
        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + (row.priceCents ?? 0));
      }
    }

    return Array.from(revenueByDay.entries()).map(([date, cents]) => ({
      date,
      revenue: cents,
    }));
  }

  /**
   * Appointments chart: daily counts by status for the last N days.
   */
  async getAppointmentsChart(tenantId: string, days = 30) {
    const now = new Date();
    const from = subDays(now, days - 1);

    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startsAt: { gte: startOfDay(from), lte: endOfDay(now) },
        status: { notIn: ['cancelled', 'no_show'] },
      },
      select: { startsAt: true, status: true },
      orderBy: { startsAt: 'asc' },
    });

    const byDay = new Map<string, { completed: number; confirmed: number; pending: number }>();
    for (let i = 0; i < days; i++) {
      const d = subDays(now, days - 1 - i);
      byDay.set(format(d, 'yyyy-MM-dd'), { completed: 0, confirmed: 0, pending: 0 });
    }

    for (const row of rows) {
      const key = format(row.startsAt, 'yyyy-MM-dd');
      if (!byDay.has(key)) continue;
      const entry = byDay.get(key)!;
      if (row.status === 'completed') entry.completed++;
      else if (row.status === 'confirmed') entry.confirmed++;
      else if (row.status === 'pending') entry.pending++;
    }

    return Array.from(byDay.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  }

  /**
   * Monthly breakdown for the last 6 months.
   */
  async getMonthlyBreakdown(tenantId: string) {
    const now = new Date();

    const months = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const monthDate = subMonths(now, 5 - i);
        const from = startOfMonth(monthDate);
        const to = endOfMonth(monthDate);
        return this.getMonthStats(tenantId, from, to, format(monthDate, 'yyyy-MM'));
      }),
    );

    return months;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async getPeriodStats(tenantId: string, from: Date, to: Date) {
    // Half-open range [from, to): the boundary instant (subDays(now, 30) is both
    // the current period's start and the previous period's end) must not be
    // counted in both periods.
    const [appointments, customers] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { tenantId, startsAt: { gte: from, lt: to } },
        _count: { _all: true },
        _sum: { priceCents: true },
      }),
      this.prisma.customer.count({
        where: { tenantId, createdAt: { gte: from, lt: to }, deletedAt: null },
      }),
    ]);

    let completed = 0, cancelled = 0, pending = 0, total = 0;
    let revenueCents = 0;

    for (const row of appointments) {
      total += row._count._all;
      if (row.status === 'completed') {
        completed = row._count._all;
        revenueCents = row._sum.priceCents ?? 0;
      }
      if (row.status === 'cancelled' || row.status === 'no_show') {
        cancelled += row._count._all;
      }
      if (row.status === 'pending' || row.status === 'confirmed') {
        pending += row._count._all;
      }
    }

    return { completed, cancelled, pending, total, revenueCents, newCustomers: customers };
  }

  private async getUpcomingCount(tenantId: string, from: Date) {
    return this.prisma.appointment.count({
      where: {
        tenantId,
        status: { in: ['pending', 'confirmed'] },
        startsAt: { gte: from },
      },
    });
  }

  private async getTopServices(tenantId: string, from: Date, to: Date) {
    const rows = await this.prisma.appointment.groupBy({
      by: ['serviceId'],
      where: {
        tenantId,
        status: 'completed',
        startsAt: { gte: from, lte: to },
        serviceId: { not: null },
      },
      _count: { _all: true },
      _sum: { priceCents: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: 5,
    });

    if (rows.length === 0) return [];

    const serviceIds = rows.map((r) => r.serviceId).filter(Boolean) as string[];
    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, color: true },
    });

    const serviceMap = new Map(services.map((s) => [s.id, s]));

    return rows
      .map((r) => ({
        serviceId: r.serviceId!,
        name: serviceMap.get(r.serviceId!)?.name ?? 'Desconocido',
        color: serviceMap.get(r.serviceId!)?.color ?? '#6b7280',
        count: r._count._all,
        revenueCents: r._sum.priceCents ?? 0,
      }))
      .filter((r) => r.name !== 'Desconocido');
  }

  private async getRecentActivity(tenantId: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: { in: ['completed', 'cancelled', 'confirmed', 'pending'] },
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        priceCents: true,
        customer: { select: { firstName: true, lastName: true } },
        service: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return appointments.map((a) => ({
      id: a.id,
      status: a.status,
      startsAt: a.startsAt,
      priceCents: a.priceCents,
      customerName: `${a.customer?.firstName ?? ''} ${a.customer?.lastName ?? ''}`.trim(),
      serviceName: a.service?.name ?? '',
    }));
  }

  private async getMonthStats(tenantId: string, from: Date, to: Date, month: string) {
    const [appointments, newCustomers] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { tenantId, startsAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { priceCents: true },
      }),
      this.prisma.customer.count({
        where: { tenantId, createdAt: { gte: from, lte: to }, deletedAt: null },
      }),
    ]);

    let completed = 0, total = 0, revenueCents = 0;
    for (const row of appointments) {
      total += row._count._all;
      if (row.status === 'completed') {
        completed = row._count._all;
        revenueCents = row._sum.priceCents ?? 0;
      }
    }

    return { month, completed, total, revenueCents, newCustomers };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTenantPlanDto } from './dto/update-tenant-plan.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Platform-wide statistics.
   */
  async getStats() {
    const [
      totalTenants,
      activeTenants,
      trialingTenants,
      totalUsers,
      totalAppointments,
      planCounts,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { planStatus: 'active' } }),
      this.prisma.tenant.count({ where: { planStatus: 'trialing' } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.appointment.count(),
      this.prisma.tenant.groupBy({
        by: ['plan'],
        _count: { _all: true },
      }),
    ]);

    // Estimated MRR (cents)
    const planPrices: Record<string, number> = {
      basic: 1900,
      professional: 4900,
      business: 9900,
    };

    const activePlanCounts = await this.prisma.tenant.groupBy({
      by: ['plan'],
      where: { planStatus: 'active' },
      _count: { _all: true },
    });

    const mrrCents = activePlanCounts.reduce((sum, g) => {
      return sum + (planPrices[g.plan] ?? 0) * g._count._all;
    }, 0);

    return {
      totalTenants,
      activeTenants,
      trialingTenants,
      totalUsers,
      totalAppointments,
      mrrCents,
      planCounts: planCounts.map((g) => ({ plan: g.plan, count: g._count._all })),
    };
  }

  /**
   * List all tenants with basic stats.
   */
  async listTenants(options: {
    search?: string;
    plan?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }) {
    const where: any = {};

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { email: { contains: options.search, mode: 'insensitive' } },
        { slug: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    if (options.plan) where.plan = options.plan;
    if (options.status) where.planStatus = options.status;

    const limit = options.limit || 20;

    const tenants = await this.prisma.tenant.findMany({
      where,
      take: limit + 1,
      ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { users: true, appointments: true, customers: true },
        },
      },
    });

    const hasMore = tenants.length > limit;
    const data = hasMore ? tenants.slice(0, limit) : tenants;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  /**
   * Get a single tenant with full detail.
   */
  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, appointments: true, customers: true, employees: true },
        },
        users: {
          where: { deletedAt: null, role: 'owner' },
          select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /**
   * Update a tenant's plan or status.
   */
  async updateTenant(id: string, dto: UpdateTenantPlanDto) {
    await this.getTenant(id); // ensure exists

    const updateData: any = {};
    if (dto.plan) updateData.plan = dto.plan;
    if (dto.planStatus) updateData.planStatus = dto.planStatus;

    // Adjust maxEmployees based on plan
    const planLimits: Record<string, number> = {
      basic: 1,
      professional: 5,
      business: 999,
    };
    if (dto.plan && planLimits[dto.plan] !== undefined) {
      updateData.maxEmployees = planLimits[dto.plan];
    }

    return this.prisma.tenant.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        plan: true,
        planStatus: true,
        maxEmployees: true,
      },
    });
  }

  /**
   * Soft-suspend a tenant (set planStatus = cancelled).
   */
  async suspendTenant(id: string) {
    await this.getTenant(id);

    return this.prisma.tenant.update({
      where: { id },
      data: { planStatus: 'cancelled' },
      select: { id: true, name: true, planStatus: true },
    });
  }
}

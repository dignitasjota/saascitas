import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        province: true,
        postalCode: true,
        taxId: true,
        logoUrl: true,
        timezone: true,
        locale: true,
        plan: true,
        planStatus: true,
        trialEndsAt: true,
        bookingSettings: true,
        maxEmployees: true,
        createdAt: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    const updateData: any = { ...dto };

    // bookingSettings is a JSON field — merge only defined fields
    if (dto.bookingSettings) {
      const current = await this.prisma.tenant.findUnique({
        where: { id },
        select: { bookingSettings: true },
      });
      const existing = (current?.bookingSettings as Record<string, unknown>) ?? {};
      // Strip undefined values so we don't overwrite existing keys with undefined
      const patch = Object.fromEntries(
        Object.entries(dto.bookingSettings).filter(([, v]) => v !== undefined),
      );
      updateData.bookingSettings = { ...existing, ...patch };
    }

    return this.prisma.tenant.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        province: true,
        postalCode: true,
        taxId: true,
        logoUrl: true,
        timezone: true,
        bookingSettings: true,
      },
    });
  }
}

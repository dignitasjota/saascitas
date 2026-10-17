import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/create-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.service.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    // A new service is offered by every active employee by default; otherwise
    // nobody could book it online until someone linked it by hand.
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          durationMinutes: dto.durationMinutes ?? 60,
          priceCents: dto.priceCents,
          color: dto.color,
          isPublic: dto.isPublic ?? true,
        },
      });

      const employees = await tx.employee.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (employees.length > 0) {
        await tx.employeeService.createMany({
          data: employees.map((e) => ({
            tenantId,
            employeeId: e.id,
            serviceId: service.id,
          })),
          skipDuplicates: true,
        });
      }

      return service;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    await this.findById(tenantId, id);

    return this.prisma.service.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    return this.prisma.service.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

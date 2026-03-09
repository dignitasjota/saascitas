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
    return this.prisma.service.create({
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

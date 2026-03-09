import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string, limit = 20, cursor?: string) {
    const where: any = { tenantId, deletedAt: null };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      take: limit + 1, // Fetch one extra to detect if there's a next page
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = customers.length > limit;
    const data = hasMore ? customers.slice(0, limit) : customers;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  async findById(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        appointments: {
          orderBy: { startsAt: 'desc' },
          take: 10,
          include: {
            employee: { select: { firstName: true, lastName: true } },
            service: { select: { name: true } },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        notes: dto.notes,
        tags: dto.tags || [],
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    await this.findById(tenantId, id);

    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async exportCsv(tenantId: string): Promise<string> {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const escape = (v: string | null | undefined) =>
      v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;

    const header = [
      'ID', 'Nombre', 'Apellidos', 'Email', 'Teléfono',
      'Dirección', 'Ciudad', 'Código postal',
      'Total citas', 'Última cita', 'Creado',
    ].join(',');

    const lines = rows.map((c) => [
      escape(c.id),
      escape(c.firstName),
      escape(c.lastName),
      escape(c.email),
      escape(c.phone),
      escape(c.address),
      escape(c.city),
      escape(c.postalCode),
      c.totalAppointments,
      c.lastAppointmentAt ? c.lastAppointmentAt.toISOString().split('T')[0] : '',
      c.createdAt.toISOString().split('T')[0],
    ].join(','));

    return [header, ...lines].join('\r\n');
  }
}

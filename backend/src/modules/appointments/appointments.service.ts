import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async findAll(
    tenantId: string,
    options: {
      from?: string;
      to?: string;
      employeeId?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const where: any = { tenantId };

    if (options.from || options.to) {
      where.startsAt = {};
      if (options.from) where.startsAt.gte = new Date(options.from);
      if (options.to) where.startsAt.lte = new Date(options.to);
    }

    if (options.employeeId) where.employeeId = options.employeeId;
    if (options.status) where.status = options.status;

    const limit = options.limit || 50;

    const appointments = await this.prisma.appointment.findMany({
      where,
      take: limit + 1,
      ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, color: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    const hasMore = appointments.length > limit;
    const data = hasMore ? appointments.slice(0, limit) : appointments;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  async findById(tenantId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, color: true, phone: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, address: true } },
        service: { select: { id: true, name: true, durationMinutes: true, priceCents: true, color: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async create(tenantId: string, dto: CreateAppointmentDto) {
    // Get service duration if not specified
    let durationMinutes = dto.durationMinutes;
    let priceCents = dto.priceCents;

    if (dto.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId, deletedAt: null },
      });

      if (!service) {
        throw new BadRequestException('Service not found');
      }

      if (!durationMinutes) durationMinutes = service.durationMinutes;
      if (priceCents === undefined) priceCents = service.priceCents ?? undefined;
    }

    if (!durationMinutes) {
      throw new BadRequestException(
        'Duration is required when no service is selected',
      );
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    // Check for conflicts
    const isAvailable = await this.availabilityService.isSlotAvailable(
      tenantId,
      dto.employeeId,
      startsAt,
      endsAt,
    );

    if (!isAvailable) {
      throw new ConflictException(
        'This time slot is not available. The employee already has an appointment.',
      );
    }

    // Verify employee exists
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId, deletedAt: null },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    // Verify customer exists
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId, deletedAt: null },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        customerId: dto.customerId,
        serviceId: dto.serviceId,
        startsAt,
        endsAt,
        durationMinutes,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        notes: dto.notes,
        customerNotes: dto.customerNotes,
        priceCents,
        source: 'manual',
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true } },
      },
    });

    // Update customer stats
    await this.prisma.customer.update({
      where: { id: dto.customerId },
      data: {
        totalAppointments: { increment: 1 },
        lastAppointmentAt: startsAt,
      },
    });

    return appointment;
  }

  async update(tenantId: string, id: string, dto: UpdateAppointmentDto) {
    const existing = await this.findById(tenantId, id);

    if (existing.status === 'cancelled' || existing.status === 'completed') {
      throw new BadRequestException(
        `Cannot update a ${existing.status} appointment`,
      );
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const durationMinutes = dto.durationMinutes || existing.durationMinutes;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    // If time changed, check for conflicts
    if (dto.startsAt || dto.durationMinutes) {
      const isAvailable = await this.availabilityService.isSlotAvailable(
        tenantId,
        existing.employeeId,
        startsAt,
        endsAt,
        id, // Exclude self
      );

      if (!isAvailable) {
        throw new ConflictException(
          'This time slot is not available. The employee already has an appointment.',
        );
      }
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.startsAt && { startsAt }),
        ...(dto.durationMinutes && { durationMinutes, endsAt }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.customerNotes !== undefined && { customerNotes: dto.customerNotes }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateStatusDto) {
    const existing = await this.findById(tenantId, id);

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled', 'no_show'],
      confirmed: ['in_progress', 'cancelled', 'no_show'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
      no_show: [],
    };

    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot change status from "${existing.status}" to "${dto.status}"`,
      );
    }

    const updateData: any = { status: dto.status };

    if (dto.status === 'cancelled') {
      updateData.cancelledAt = new Date();
      updateData.cancellationReason = dto.cancellationReason;
    }

    return this.prisma.appointment.update({
      where: { id },
      data: updateData,
    });
  }

  async getCalendar(
    tenantId: string,
    from: string,
    to: string,
    employeeId?: string,
  ) {
    const where: any = {
      tenantId,
      startsAt: { gte: new Date(from) },
      endsAt: { lte: new Date(to) },
      status: { notIn: ['cancelled'] },
    };

    if (employeeId) where.employeeId = employeeId;

    return this.prisma.appointment.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, color: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async getToday(tenantId: string, employeeId?: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    return this.getCalendar(
      tenantId,
      todayStart.toISOString(),
      todayEnd.toISOString(),
      employeeId,
    );
  }
}

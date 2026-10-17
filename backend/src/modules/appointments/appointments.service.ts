import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isOverlapConstraintViolation } from '../../common/utils/prisma-errors';
import {
  todayInTz,
  startOfDayUtc,
  endOfDayUtc,
  formatDateInTz,
  formatTimeInTz,
} from '../../common/utils/timezone';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/create-appointment.dto';

const SLOT_TAKEN_MESSAGE =
  'This time slot is not available. The employee already has an appointment.';
const DEFAULT_TZ = 'Europe/Madrid';
const VALID_STATUSES = Object.values(AppointmentStatus) as string[];

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly notifications: NotificationsService,
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
    if (options.status) {
      if (!VALID_STATUSES.includes(options.status)) {
        throw new BadRequestException(`Invalid status: ${options.status}`);
      }
      where.status = options.status;
    }

    const limit = Math.min(Math.max(options.limit || 50, 1), 100);

    const appointments = await this.prisma.appointment.findMany({
      where,
      take: limit + 1,
      ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, color: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true, color: true } },
      },
      // id tiebreaker so cursor pagination is stable when several appointments
      // share the same startsAt.
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
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
      throw new ConflictException(SLOT_TAKEN_MESSAGE);
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

    let appointment;
    try {
      appointment = await this.prisma.appointment.create({
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
    } catch (err) {
      // Race safety net: another appointment for the same slot was created
      // between the availability check and this insert.
      if (isOverlapConstraintViolation(err)) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
      throw err;
    }

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

    const timeChanged = Boolean(dto.startsAt || dto.durationMinutes);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const durationMinutes = dto.durationMinutes || existing.durationMinutes;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    // If time changed, check for conflicts
    if (timeChanged) {
      const isAvailable = await this.availabilityService.isSlotAvailable(
        tenantId,
        existing.employeeId,
        startsAt,
        endsAt,
        id, // Exclude self
      );

      if (!isAvailable) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
    }

    let updated;
    try {
      updated = await this.prisma.appointment.update({
        where: { id },
        data: {
          // Always persist the three time fields together so endsAt stays
          // consistent with startsAt/durationMinutes (moving startsAt alone
          // must recompute endsAt, not leave the old value).
          ...(timeChanged && { startsAt, durationMinutes, endsAt }),
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
    } catch (err) {
      if (isOverlapConstraintViolation(err)) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
      throw err;
    }

    // Move the reminder to the new time so it doesn't fire at the old date
    // (fire-and-forget — never block or fail the update on queue issues).
    if (timeChanged) {
      void this.notifications
        .rescheduleReminder(id, startsAt)
        .catch(() => undefined);
    }

    return updated;
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

    // Keep customer stats consistent with the status change, atomically:
    //  - cancelling undoes the +1 added at creation
    //  - completing adds the appointment price to the customer's total spent
    const updated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set on the status we validated: a concurrent change (e.g.
      // the customer cancelling from the email link at the same moment) must
      // not apply twice and double-count the customer stats.
      const claim = await tx.appointment.updateMany({
        where: { id, tenantId, status: existing.status },
        data: updateData,
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'The appointment status changed meanwhile. Reload and try again.',
        );
      }
      const appt = await tx.appointment.findUniqueOrThrow({ where: { id } });

      if (dto.status === 'cancelled') {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { totalAppointments: { decrement: 1 } },
        });
      } else if (dto.status === 'completed' && existing.priceCents) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { totalSpentCents: { increment: BigInt(existing.priceCents) } },
        });
      }

      return appt;
    });

    // Drop the queued reminder for a cancelled appointment (fire-and-forget).
    if (dto.status === 'cancelled') {
      void this.notifications.cancelReminder(id).catch(() => undefined);
    }

    return updated;
  }

  async getCalendar(
    tenantId: string,
    from: string,
    to: string,
    employeeId?: string,
  ) {
    // Overlap, not containment: an appointment that starts before `from` or
    // ends after `to` but still overlaps the window must appear (e.g. a
    // 23:30→00:30 booking, or one straddling the requested day view).
    const where: any = {
      tenantId,
      startsAt: { lt: new Date(to) },
      endsAt: { gt: new Date(from) },
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
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  async getToday(tenantId: string, employeeId?: string) {
    // "Today" is the tenant's civil day, not the server's.
    const tz = await this.getTenantTz(tenantId);
    const today = todayInTz(tz);

    return this.getCalendar(
      tenantId,
      startOfDayUtc(today, tz).toISOString(),
      endOfDayUtc(today, tz).toISOString(),
      employeeId,
    );
  }

  private async getTenantTz(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return tenant?.timezone ?? DEFAULT_TZ;
  }

  async exportCsv(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<string> {
    const tz = await this.getTenantTz(tenantId);

    const where: any = { tenantId };
    if (from || to) {
      where.startsAt = {};
      if (from) where.startsAt.gte = new Date(from);
      if (to) where.startsAt.lte = new Date(to);
    }

    const rows = await this.prisma.appointment.findMany({
      where,
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
        employee: { select: { firstName: true, lastName: true } },
        service:  { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    const escape = (v: string | null | undefined) =>
      v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;

    const header = [
      'ID', 'Fecha', 'Hora inicio', 'Hora fin',
      'Cliente', 'Email cliente', 'Teléfono cliente',
      'Servicio', 'Empleado', 'Estado',
      'Duración (min)', 'Precio (€)', 'Notas',
    ].join(',');

    const lines = rows.map((a) => [
      escape(a.id),
      escape(formatDateInTz(a.startsAt, tz)),
      escape(formatTimeInTz(a.startsAt, tz)),
      escape(formatTimeInTz(a.endsAt, tz)),
      escape(`${a.customer.firstName} ${a.customer.lastName}`),
      escape(a.customer.email),
      escape(a.customer.phone),
      escape(a.service?.name ?? ''),
      escape(`${a.employee.firstName} ${a.employee.lastName}`),
      escape(a.status),
      a.durationMinutes,
      a.priceCents != null ? (a.priceCents / 100).toFixed(2) : '',
      escape(a.notes),
    ].join(','));

    return [header, ...lines].join('\r\n');
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../common/prisma/prisma.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
const TENANT = 'tenant-1';
const now = new Date('2026-03-10T10:00:00.000Z');
const later = new Date('2026-03-10T11:00:00.000Z');

const makeAppointment = (overrides = {}) => ({
  id: 'appt-1',
  tenantId: TENANT,
  employeeId: 'emp-1',
  customerId: 'cust-1',
  serviceId: 'svc-1',
  startsAt: now,
  endsAt: later,
  durationMinutes: 60,
  status: 'pending',
  priceCents: 5000,
  source: 'manual',
  address: null,
  city: null,
  postalCode: null,
  notes: null,
  customerNotes: null,
  cancelledAt: null,
  cancellationReason: null,
  employee: { id: 'emp-1', firstName: 'Carlos', lastName: 'López', color: '#3b82f6' },
  customer: { id: 'cust-1', firstName: 'María', lastName: 'Pérez', phone: '600000000' },
  service: { id: 'svc-1', name: 'Instalación', color: '#10b981' },
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: any;
  let availability: jest.Mocked<AvailabilityService>;

  const mockPrisma: any = {
    appointment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    service: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    // Interactive transaction: run the callback with the mock itself as `tx`.
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockAvailability = {
    isSlotAvailable: jest.fn(),
    getAvailableSlots: jest.fn(),
  };

  const mockNotifications = {
    rescheduleReminder: jest.fn().mockResolvedValue(undefined),
    cancelReminder: jest.fn().mockResolvedValue(undefined),
    queueBookingReminder: jest.fn().mockResolvedValue(undefined),
    queueBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AvailabilityService, useValue: mockAvailability },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get(PrismaService);
    availability = module.get(AvailabilityService);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('returns appointments list with pagination', async () => {
      const appts = [makeAppointment(), makeAppointment({ id: 'appt-2' })];
      mockPrisma.appointment.findMany.mockResolvedValue(appts);

      const result = await service.findAll(TENANT, {});

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('detects hasMore when records exceed limit', async () => {
      // findAll uses limit+1 to detect next page; default limit = 50
      const appts = Array.from({ length: 51 }, (_, i) =>
        makeAppointment({ id: `appt-${i}` }),
      );
      mockPrisma.appointment.findMany.mockResolvedValue(appts);

      const result = await service.findAll(TENANT, {});

      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(50);
      expect(result.nextCursor).toBe('appt-49');
    });

    it('applies date range filter when from/to provided', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      await service.findAll(TENANT, { from: '2026-03-01', to: '2026-03-31' });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startsAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('applies employeeId filter when provided', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      await service.findAll(TENANT, { employeeId: 'emp-1' });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-1' }),
        }),
      );
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('returns the appointment when found', async () => {
      const appt = makeAppointment();
      mockPrisma.appointment.findFirst.mockResolvedValue(appt);

      const result = await service.findById(TENANT, 'appt-1');
      expect(result.id).toBe('appt-1');
    });

    it('throws NotFoundException when appointment does not exist', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.findById(TENANT, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────
  describe('create', () => {
    const dto = {
      employeeId: 'emp-1',
      customerId: 'cust-1',
      serviceId: 'svc-1',
      startsAt: now.toISOString(),
      durationMinutes: undefined as any,
      priceCents: undefined as any,
    };

    beforeEach(() => {
      mockPrisma.service.findFirst.mockResolvedValue({
        id: 'svc-1',
        durationMinutes: 60,
        priceCents: 5000,
      });
      mockAvailability.isSlotAvailable.mockResolvedValue(true);
      mockPrisma.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.appointment.create.mockResolvedValue(makeAppointment());
      mockPrisma.customer.update.mockResolvedValue({});
    });

    it('creates appointment using service duration and price', async () => {
      const result = await service.create(TENANT, dto);

      expect(result.id).toBe('appt-1');
      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            durationMinutes: 60,
            priceCents: 5000,
          }),
        }),
      );
    });

    it('throws BadRequestException when service not found', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when no duration and no service', async () => {
      await expect(
        service.create(TENANT, { ...dto, serviceId: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when slot is not available', async () => {
      mockAvailability.isSlotAvailable.mockResolvedValue(false);

      await expect(service.create(TENANT, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws BadRequestException when employee not found', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when customer not found', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('updates customer stats after creation', async () => {
      await service.create(TENANT, dto);

      expect(mockPrisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cust-1' },
          data: expect.objectContaining({
            totalAppointments: { increment: 1 },
          }),
        }),
      );
    });

    it('maps the DB overlap exclusion violation to ConflictException (race safety net)', async () => {
      mockPrisma.appointment.create.mockRejectedValue({
        code: '23P01',
        message:
          'conflicting key value violates exclusion constraint "appointments_no_overlap"',
      });

      await expect(service.create(TENANT, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── updateStatus ────────────────────────────────────────────────────────────
  describe('updateStatus', () => {
    it('allows valid status transition (pending → confirmed)', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending' }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValue(makeAppointment({ status: 'confirmed' }));

      const result = await service.updateStatus(TENANT, 'appt-1', {
        status: 'confirmed',
      });
      expect(result.status).toBe('confirmed');
    });

    it('rejects invalid status transition (pending → completed)', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending' }),
      );

      await expect(
        service.updateStatus(TENANT, 'appt-1', { status: 'completed' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any transition from completed', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'completed' }),
      );

      await expect(
        service.updateStatus(TENANT, 'appt-1', { status: 'cancelled' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets cancelledAt and cancellationReason when cancelling', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending' }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValue({});

      await service.updateStatus(TENANT, 'appt-1', {
        status: 'cancelled',
        cancellationReason: 'Cliente no vino',
      });

      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelledAt: expect.any(Date),
            cancellationReason: 'Cliente no vino',
          }),
        }),
      );
    });

    it('cancels the queued reminder when cancelling', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending' }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValue({});

      await service.updateStatus(TENANT, 'appt-1', { status: 'cancelled' });

      expect(mockNotifications.cancelReminder).toHaveBeenCalledWith('appt-1');
    });

    it('does not cancel the reminder for a non-cancel transition', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending' }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValue({});

      await service.updateStatus(TENANT, 'appt-1', { status: 'confirmed' });

      expect(mockNotifications.cancelReminder).not.toHaveBeenCalled();
    });

    it('decrements the customer appointment count when cancelling', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending', customerId: 'cust-1' }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValue({});

      await service.updateStatus(TENANT, 'appt-1', { status: 'cancelled' });

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { totalAppointments: { decrement: 1 } },
      });
    });

    it('adds the price to the customer total spent when completing', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'in_progress', customerId: 'cust-1', priceCents: 5000 }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValue({});

      await service.updateStatus(TENANT, 'appt-1', { status: 'completed' });

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { totalSpentCents: { increment: BigInt(5000) } },
      });
    });

    it('applies the change only if the status is still the one validated', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'pending', customerId: 'cust-1' }),
      );
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus(TENANT, 'appt-1', { status: 'cancelled' }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1', tenantId: TENANT, status: 'pending' },
        }),
      );
      // No double decrement when a concurrent cancellation won the race.
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('throws BadRequestException when appointment is cancelled', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(
        makeAppointment({ status: 'cancelled' }),
      );

      await expect(
        service.update(TENANT, 'appt-1', { startsAt: now.toISOString() }),
      ).rejects.toThrow(BadRequestException);
    });

    it('checks for conflicts when time changes', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(makeAppointment());
      mockAvailability.isSlotAvailable.mockResolvedValue(true);
      mockPrisma.appointment.update.mockResolvedValue(makeAppointment());

      await service.update(TENANT, 'appt-1', {
        startsAt: new Date('2026-03-10T14:00:00.000Z').toISOString(),
      });

      expect(mockAvailability.isSlotAvailable).toHaveBeenCalled();
    });

    it('throws ConflictException when new time slot is taken', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(makeAppointment());
      mockAvailability.isSlotAvailable.mockResolvedValue(false);

      await expect(
        service.update(TENANT, 'appt-1', {
          startsAt: new Date('2026-03-10T14:00:00.000Z').toISOString(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('recomputes endsAt when only startsAt changes (no duration provided)', async () => {
      // Base appointment: 10:00→11:00, duration 60. Moving startsAt to 14:00
      // without a new duration must persist endsAt = 15:00, not the stale 11:00.
      mockPrisma.appointment.findFirst.mockResolvedValue(makeAppointment());
      mockAvailability.isSlotAvailable.mockResolvedValue(true);
      mockPrisma.appointment.update.mockResolvedValue(makeAppointment());

      const newStart = new Date('2026-03-10T14:00:00.000Z');
      await service.update(TENANT, 'appt-1', {
        startsAt: newStart.toISOString(),
      });

      expect(mockPrisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startsAt: newStart,
            durationMinutes: 60,
            endsAt: new Date('2026-03-10T15:00:00.000Z'),
          }),
        }),
      );
    });

    it('maps the DB overlap exclusion violation to ConflictException (race safety net)', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(makeAppointment());
      mockAvailability.isSlotAvailable.mockResolvedValue(true);
      mockPrisma.appointment.update.mockRejectedValue({
        code: '23P01',
        message:
          'conflicting key value violates exclusion constraint "appointments_no_overlap"',
      });

      await expect(
        service.update(TENANT, 'appt-1', {
          startsAt: new Date('2026-03-10T14:00:00.000Z').toISOString(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('reschedules the reminder to the new time', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(makeAppointment());
      mockAvailability.isSlotAvailable.mockResolvedValue(true);
      mockPrisma.appointment.update.mockResolvedValue(makeAppointment());

      const newStart = new Date('2026-03-10T14:00:00.000Z');
      await service.update(TENANT, 'appt-1', { startsAt: newStart.toISOString() });

      expect(mockNotifications.rescheduleReminder).toHaveBeenCalledWith(
        'appt-1',
        newStart,
      );
    });

    it('does not touch the reminder when only non-time fields change', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(makeAppointment());
      mockPrisma.appointment.update.mockResolvedValue(makeAppointment());

      await service.update(TENANT, 'appt-1', { notes: 'nueva nota' });

      expect(mockNotifications.rescheduleReminder).not.toHaveBeenCalled();
    });
  });

  // ── getCalendar ─────────────────────────────────────────────────────────────
  describe('getCalendar', () => {
    it('excludes cancelled appointments', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      await service.getCalendar(TENANT, '2026-03-01', '2026-03-31');

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['cancelled'] },
          }),
        }),
      );
    });

    it('filters by employeeId when provided', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      await service.getCalendar(TENANT, '2026-03-01', '2026-03-31', 'emp-1');

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-1' }),
        }),
      );
    });
  });
});

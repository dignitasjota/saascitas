import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../appointments/availability.service';
import { NotificationsService } from '../notifications/notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = {
  id: 'tenant-1',
  name: 'Electricidad García',
  slug: 'electricidad-garcia',
  phone: '600000000',
  city: 'Madrid',
  logoUrl: null,
  timezone: 'Europe/Madrid',
  planStatus: 'trialing',
  trialEndsAt: new Date(Date.now() + 10 * 24 * 3600 * 1000),
  // maxAdvanceDays large so the far-future FUTURE_DATE fixture isn't filtered.
  bookingSettings: { minAdvanceHours: 0, maxAdvanceDays: 36600, autoConfirm: false },
};

const SERVICE = {
  id: 'svc-1',
  name: 'Revisión eléctrica',
  durationMinutes: 60,
  priceCents: 5000,
  isPublic: true,
  isActive: true,
};

const EMPLOYEE = {
  id: 'emp-1',
  firstName: 'Carlos',
  lastName: 'García',
  isActive: true,
};

const CUSTOMER_INPUT = {
  firstName: 'Ana',
  lastName: 'López',
  phone: '666111222',
  email: 'ana@example.com',
};

const FUTURE_DATE = '2099-06-10'; // far in the future to avoid advance-time issues
const SLOT = '10:00';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  tenant: { findFirst: jest.fn() },
  service: { findFirst: jest.fn() },
  employee: { findFirst: jest.fn(), findMany: jest.fn() },
  employeeService: { findFirst: jest.fn() },
  customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  appointment: { create: jest.fn(), update: jest.fn() },
  bookingToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

const mockAvailability = {
  getAvailableSlots: jest.fn(),
  isSlotAvailable: jest.fn(),
};

const mockNotifications = {
  queueBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  queueBookingReminder: jest.fn().mockResolvedValue(undefined),
  cancelReminder: jest.fn().mockResolvedValue(undefined),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('BookingService', () => {
  let service: BookingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AvailabilityService, useValue: mockAvailability },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);

    // Default happy-path mocks
    mockPrisma.tenant.findFirst.mockResolvedValue(TENANT);
    mockPrisma.service.findFirst.mockResolvedValue(SERVICE);
    mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
    mockPrisma.employeeService.findFirst.mockResolvedValue({
      employeeId: EMPLOYEE.id,
      serviceId: SERVICE.id,
      tenantId: TENANT.id,
    });
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue({ ...CUSTOMER_INPUT, id: 'cust-1' });
    mockAvailability.isSlotAvailable.mockResolvedValue(true);
    // The requested slot is available by default.
    mockAvailability.getAvailableSlots.mockResolvedValue([
      { start: SLOT, end: '11:00', available: true },
    ]);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getBusinessInfo ───────────────────────────────────────────────────────

  describe('getBusinessInfo', () => {
    it('throws NotFoundException for unknown slug', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(null);
      await expect(service.getBusinessInfo('unknown')).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException when tenant is cancelled', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({ ...TENANT, planStatus: 'cancelled' });
      await expect(service.getBusinessInfo(TENANT.slug)).rejects.toThrow(GoneException);
    });

    it('throws GoneException when tenant is past_due', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({ ...TENANT, planStatus: 'past_due' });
      await expect(service.getBusinessInfo(TENANT.slug)).rejects.toThrow(GoneException);
    });

    it('returns tenant for active status', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({ ...TENANT, planStatus: 'active' });
      const result = await service.getBusinessInfo(TENANT.slug);
      expect(result.id).toBe(TENANT.id);
    });

    it('returns tenant for trialing status', async () => {
      const result = await service.getBusinessInfo(TENANT.slug);
      expect(result.slug).toBe(TENANT.slug);
    });
  });

  // ─── getAvailableSlots ─────────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    it('throws NotFoundException when service not found', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);
      await expect(
        service.getAvailableSlots(TENANT.slug, EMPLOYEE.id, FUTURE_DATE, 'bad-svc'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns only available slot start times', async () => {
      mockAvailability.getAvailableSlots.mockResolvedValue([
        { start: '09:00', end: '10:00', available: true },
        { start: '10:00', end: '11:00', available: false },
        { start: '11:00', end: '12:00', available: true },
      ]);

      const result = await service.getAvailableSlots(
        TENANT.slug, EMPLOYEE.id, FUTURE_DATE, SERVICE.id,
      );

      expect(result).toEqual(['09:00', '11:00']);
    });

    it('passes correct duration to availability service', async () => {
      mockAvailability.getAvailableSlots.mockResolvedValue([]);
      await service.getAvailableSlots(TENANT.slug, EMPLOYEE.id, FUTURE_DATE, SERVICE.id);

      expect(mockAvailability.getAvailableSlots).toHaveBeenCalledWith(
        TENANT.id,
        EMPLOYEE.id,
        FUTURE_DATE,
        SERVICE.durationMinutes,
      );
    });
  });

  // ─── createBooking ─────────────────────────────────────────────────────────

  describe('createBooking', () => {
    const makeDto = (overrides = {}) => ({
      serviceId: SERVICE.id,
      employeeId: EMPLOYEE.id,
      date: FUTURE_DATE,
      slot: SLOT,
      ...CUSTOMER_INPUT,
      notes: '',
      ...overrides,
    });

    const mockTransaction = (appointmentId = 'appt-1') => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const result = await fn({
          appointment: {
            create: jest.fn().mockResolvedValue({
              id: appointmentId,
              status: 'pending',
              startsAt: new Date(`${FUTURE_DATE}T${SLOT}:00`),
              endsAt: new Date(`${FUTURE_DATE}T11:00:00`),
            }),
          },
          bookingToken: { create: jest.fn().mockResolvedValue({}) },
          customer: { update: jest.fn().mockResolvedValue({}) },
        });
        return result;
      });
    };

    it('throws BadRequestException when service not found', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);
      await expect(service.createBooking(TENANT.slug, makeDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when employee not found', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      await expect(service.createBooking(TENANT.slug, makeDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException when the slot is not in real availability', async () => {
      mockAvailability.getAvailableSlots.mockResolvedValue([
        { start: SLOT, end: '11:00', available: false },
      ]);
      await expect(service.createBooking(TENANT.slug, makeDto())).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException for an off-grid / out-of-hours slot', async () => {
      // Requested slot not present in the availability grid at all
      mockAvailability.getAvailableSlots.mockResolvedValue([
        { start: '09:00', end: '10:00', available: true },
      ]);
      await expect(
        service.createBooking(TENANT.slug, makeDto({ slot: '03:47' })),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when the employee does not offer the service', async () => {
      mockPrisma.employeeService.findFirst.mockResolvedValue(null);
      await expect(service.createBooking(TENANT.slug, makeDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when booking beyond maxAdvanceDays', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        ...TENANT,
        bookingSettings: { minAdvanceHours: 0, maxAdvanceDays: 30, autoConfirm: false },
      });
      // FUTURE_DATE (2099) is far beyond 30 days
      await expect(service.createBooking(TENANT.slug, makeDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when booking too close to slot time', async () => {
      const tenantWithAdvance = {
        ...TENANT,
        bookingSettings: { minAdvanceHours: 48, autoConfirm: false },
      };
      mockPrisma.tenant.findFirst.mockResolvedValue(tenantWithAdvance);

      // Use a date very soon (next hour)
      const soon = new Date(Date.now() + 30 * 60 * 1000);
      const soonDate = soon.toISOString().split('T')[0];
      const soonSlot = `${soon.getHours().toString().padStart(2,'0')}:00`;

      await expect(
        service.createBooking(TENANT.slug, makeDto({ date: soonDate, slot: soonSlot })),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates new customer when not found by phone', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);
      mockTransaction();

      await service.createBooking(TENANT.slug, makeDto());

      expect(mockPrisma.customer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT.id,
          phone: CUSTOMER_INPUT.phone,
          firstName: CUSTOMER_INPUT.firstName,
        }),
      });
    });

    it('reuses existing customer when found by phone', async () => {
      const existingCustomer = { ...CUSTOMER_INPUT, id: 'existing-cust' };
      mockPrisma.customer.findFirst.mockResolvedValue(existingCustomer);
      mockTransaction();

      await service.createBooking(TENANT.slug, makeDto());

      expect(mockPrisma.customer.create).not.toHaveBeenCalled();
    });

    it('queues confirmation and reminder notifications', async () => {
      mockTransaction('new-appt');

      await service.createBooking(TENANT.slug, makeDto());

      // Allow microtasks to settle
      await new Promise((r) => setImmediate(r));

      expect(mockNotifications.queueBookingConfirmation).toHaveBeenCalledWith('new-appt');
      expect(mockNotifications.queueBookingReminder).toHaveBeenCalledWith(
        'new-appt',
        expect.any(Date),
      );
    });

    it('sets status to confirmed when autoConfirm is true', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        ...TENANT,
        bookingSettings: { minAdvanceHours: 0, maxAdvanceDays: 36600, autoConfirm: true },
      });

      let capturedStatus: string | undefined;
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          appointment: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              capturedStatus = data.status;
              return { id: 'appt-1', status: data.status, startsAt: new Date(), endsAt: new Date() };
            }),
          },
          bookingToken: { create: jest.fn().mockResolvedValue({}) },
          customer: { update: jest.fn().mockResolvedValue({}) },
        });
      });

      await service.createBooking(TENANT.slug, makeDto());

      expect(capturedStatus).toBe('confirmed');
    });
  });

  // ─── cancelBooking ─────────────────────────────────────────────────────────

  describe('cancelBooking', () => {
    const TOKEN = 'valid-cancel-token';

    const mockCancelRecord = (overrides = {}) => ({
      id: 'token-1',
      token: TOKEN,
      action: 'cancel',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      appointmentId: 'appt-1',
      appointment: { id: 'appt-1', status: 'pending' },
      ...overrides,
    });

    it('throws NotFoundException for invalid token', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(null);
      await expect(service.cancelBooking('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException for expired token', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(
        mockCancelRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.cancelBooking(TOKEN)).rejects.toThrow(GoneException);
    });

    it('throws BadRequestException when appointment already cancelled', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(
        mockCancelRecord({ appointment: { id: 'appt-1', status: 'cancelled' } }),
      );
      await expect(service.cancelBooking(TOKEN)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when appointment already completed', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(
        mockCancelRecord({ appointment: { id: 'appt-1', status: 'completed' } }),
      );
      await expect(service.cancelBooking(TOKEN)).rejects.toThrow(BadRequestException);
    });

    it('cancels appointment and removes reminder on valid token', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockCancelRecord());
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.cancelBooking(TOKEN, 'No puedo');

      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Allow microtasks to settle
      await new Promise((r) => setImmediate(r));
      expect(mockNotifications.cancelReminder).toHaveBeenCalledWith('appt-1');
      expect(result.message).toContain('cancelled');
    });
  });

  // ─── confirmBooking ────────────────────────────────────────────────────────

  describe('confirmBooking', () => {
    const TOKEN = 'valid-confirm-token';

    const mockConfirmRecord = (status: string) => ({
      id: 'token-1',
      token: TOKEN,
      action: 'confirm',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      appointmentId: 'appt-1',
      appointment: { id: 'appt-1', status },
    });

    it('confirms a pending appointment', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockConfirmRecord('pending'));
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.confirmBooking(TOKEN);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.message).toContain('confirmed');
    });

    it('does not resurrect a cancelled appointment', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockConfirmRecord('cancelled'));
      await expect(service.confirmBooking(TOKEN)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

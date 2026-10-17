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

    it('never reveals the stored customer behind a phone number', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'existing-cust',
        firstName: 'Nombre',
        lastName: 'Real',
        phone: CUSTOMER_INPUT.phone,
        email: 'real@example.com',
      });
      const txCustomerUpdate = jest.fn().mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          appointment: {
            create: jest.fn().mockResolvedValue({ id: 'a', status: 'pending' }),
          },
          bookingToken: { create: jest.fn().mockResolvedValue({}) },
          customer: { update: txCustomerUpdate },
        }),
      );

      const result = await service.createBooking(
        TENANT.slug,
        makeDto({ firstName: 'Intruso', lastName: 'X', email: 'attacker@example.com' }),
      );

      expect(result.customer).toEqual({
        firstName: 'Intruso',
        lastName: 'X',
        phone: CUSTOMER_INPUT.phone,
      });
      // The stored email must not be replaced from the public form.
      expect(txCustomerUpdate.mock.calls[0][0].data).not.toHaveProperty('email');
    });

    it('fills in a missing email on an existing customer', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'existing-cust',
        ...CUSTOMER_INPUT,
        email: null,
      });
      const txCustomerUpdate = jest.fn().mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          appointment: {
            create: jest.fn().mockResolvedValue({ id: 'a', status: 'pending' }),
          },
          bookingToken: { create: jest.fn().mockResolvedValue({}) },
          customer: { update: txCustomerUpdate },
        }),
      );

      await service.createBooking(TENANT.slug, makeDto());

      expect(txCustomerUpdate.mock.calls[0][0].data.email).toBe(CUSTOMER_INPUT.email);
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
      appointment: {
        id: 'appt-1',
        status: 'pending',
        customerId: 'cust-1',
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
      ...overrides,
    });

    // Interactive transaction whose updateMany calls report `counts` in order.
    const runTx = (counts: number[]) => {
      const tx = {
        bookingToken: { updateMany: jest.fn() },
        appointment: { updateMany: jest.fn() },
        customer: { update: jest.fn().mockResolvedValue({}) },
      };
      tx.bookingToken.updateMany.mockResolvedValue({ count: counts[0] });
      tx.appointment.updateMany.mockResolvedValue({ count: counts[1] });
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx));
      return tx;
    };

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
      const tx = runTx([1, 1]);

      const result = await service.cancelBooking(TOKEN, 'No puedo');

      expect(tx.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'appt-1', status: 'pending' } }),
      );
      expect(tx.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { totalAppointments: { decrement: 1 } },
      });

      // Allow microtasks to settle
      await new Promise((r) => setImmediate(r));
      expect(mockNotifications.cancelReminder).toHaveBeenCalledWith('appt-1');
      expect(result.message).toContain('cancelled');
    });
  });

  describe('cancelBooking (races and limits)', () => {
    const record = (appointment: any) => ({
      id: 'token-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      appointmentId: 'appt-1',
      appointment: {
        id: 'appt-1',
        customerId: 'cust-1',
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        ...appointment,
      },
    });

    it('does not decrement twice when the status changed concurrently', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(record({ status: 'pending' }));
      const tx = {
        bookingToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        appointment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        customer: { update: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx));

      await expect(service.cancelBooking('t')).rejects.toThrow(BadRequestException);
      expect(tx.customer.update).not.toHaveBeenCalled();
    });

    it('rejects a token used concurrently', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(record({ status: 'pending' }));
      const tx = {
        bookingToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        appointment: { updateMany: jest.fn() },
        customer: { update: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx));

      await expect(service.cancelBooking('t')).rejects.toThrow(NotFoundException);
      expect(tx.appointment.updateMany).not.toHaveBeenCalled();
    });

    it.each(['no_show', 'in_progress'])('does not let the customer cancel a %s appointment', async (status) => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(record({ status }));
      await expect(service.cancelBooking('t')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not cancel an appointment that already started', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(
        record({ status: 'confirmed', startsAt: new Date(Date.now() - 60_000) }),
      );
      await expect(service.cancelBooking('t')).rejects.toThrow(BadRequestException);
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

    const confirmTx = (tokenCount: number, apptCount: number, current?: string) => {
      const tx = {
        bookingToken: { updateMany: jest.fn().mockResolvedValue({ count: tokenCount }) },
        appointment: {
          updateMany: jest.fn().mockResolvedValue({ count: apptCount }),
          findUnique: jest.fn().mockResolvedValue({ status: current }),
        },
      };
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx));
      return tx;
    };

    it('confirms a pending appointment', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockConfirmRecord('pending'));
      const tx = confirmTx(1, 1);

      const result = await service.confirmBooking(TOKEN);
      expect(tx.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'pending' },
        data: { status: 'confirmed' },
      });
      expect(result.message).toContain('confirmed');
    });

    it('treats an already-confirmed appointment as success', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockConfirmRecord('confirmed'));
      confirmTx(1, 0, 'confirmed');
      await expect(service.confirmBooking(TOKEN)).resolves.toBeDefined();
    });

    it('does not resurrect an appointment cancelled concurrently', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockConfirmRecord('pending'));
      confirmTx(1, 0, 'cancelled');
      await expect(service.confirmBooking(TOKEN)).rejects.toThrow(BadRequestException);
    });

    it('does not resurrect a cancelled appointment', async () => {
      mockPrisma.bookingToken.findFirst.mockResolvedValue(mockConfirmRecord('cancelled'));
      await expect(service.confirmBooking(TOKEN)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

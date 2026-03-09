import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../../common/prisma/prisma.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  scheduleException: { findFirst: jest.fn() },
  workingHour: { findMany: jest.fn() },
  appointment: { findFirst: jest.fn(), findMany: jest.fn() },
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  const TENANT_ID = 'tenant-1';
  const EMPLOYEE_ID = 'employee-1';
  const DATE = '2026-04-07'; // Monday

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);

    // Default: no exceptions, no appointments
    mockPrisma.scheduleException.findFirst.mockResolvedValue(null);
    mockPrisma.appointment.findMany.mockResolvedValue([]);
    mockPrisma.appointment.findFirst.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateSlots (via getAvailableSlots) ─────────────────────────────────

  describe('slot generation', () => {
    beforeEach(() => {
      mockPrisma.workingHour.findMany.mockResolvedValue([
        { startTime: '09:00', endTime: '14:00' },
      ]);
    });

    it('generates correct slots for 60-min duration', async () => {
      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);

      expect(slots).toHaveLength(5);
      expect(slots[0]).toEqual({ start: '09:00', end: '10:00', available: true });
      expect(slots[4]).toEqual({ start: '13:00', end: '14:00', available: true });
    });

    it('generates correct slots for 30-min duration', async () => {
      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 30);

      expect(slots).toHaveLength(10);
      expect(slots[0]).toEqual({ start: '09:00', end: '09:30', available: true });
      expect(slots[1]).toEqual({ start: '09:30', end: '10:00', available: true });
    });

    it('generates correct slots for 90-min duration', async () => {
      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 90);

      expect(slots).toHaveLength(3);
      expect(slots[0]).toEqual({ start: '09:00', end: '10:30', available: true });
      expect(slots[2]).toEqual({ start: '12:00', end: '13:30', available: true });
    });

    it('returns no slots when duration exceeds period', async () => {
      mockPrisma.workingHour.findMany.mockResolvedValue([
        { startTime: '09:00', endTime: '09:30' },
      ]);
      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);

      expect(slots).toHaveLength(0);
    });

    it('returns empty when no working hours', async () => {
      mockPrisma.workingHour.findMany.mockResolvedValue([]);
      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);

      expect(slots).toHaveLength(0);
    });
  });

  // ─── Conflict detection ────────────────────────────────────────────────────

  describe('conflict detection', () => {
    beforeEach(() => {
      mockPrisma.workingHour.findMany.mockResolvedValue([
        { startTime: '09:00', endTime: '13:00' },
      ]);
    });

    it('marks slot as unavailable when appointment overlaps exactly', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          startsAt: makeDate(DATE, '10:00'),
          endsAt: makeDate(DATE, '11:00'),
        },
      ]);

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);
      const tenOclock = slots.find((s) => s.start === '10:00');

      expect(tenOclock?.available).toBe(false);
    });

    it('marks slot as unavailable when appointment overlaps partially (start)', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          startsAt: makeDate(DATE, '09:30'),
          endsAt: makeDate(DATE, '10:30'),
        },
      ]);

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);
      const nineOclock = slots.find((s) => s.start === '09:00');
      const tenOclock = slots.find((s) => s.start === '10:00');

      expect(nineOclock?.available).toBe(false);
      expect(tenOclock?.available).toBe(false);
    });

    it('does not affect non-overlapping slots', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          startsAt: makeDate(DATE, '11:00'),
          endsAt: makeDate(DATE, '12:00'),
        },
      ]);

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);
      const nineOclock = slots.find((s) => s.start === '09:00');
      const tenOclock = slots.find((s) => s.start === '10:00');
      const elevenOclock = slots.find((s) => s.start === '11:00');

      expect(nineOclock?.available).toBe(true);
      expect(tenOclock?.available).toBe(true);
      expect(elevenOclock?.available).toBe(false);
    });

    it('handles multiple appointments', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          startsAt: makeDate(DATE, '09:00'),
          endsAt: makeDate(DATE, '10:00'),
        },
        {
          startsAt: makeDate(DATE, '11:00'),
          endsAt: makeDate(DATE, '12:00'),
        },
      ]);

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);
      expect(slots.find((s) => s.start === '09:00')?.available).toBe(false);
      expect(slots.find((s) => s.start === '10:00')?.available).toBe(true);
      expect(slots.find((s) => s.start === '11:00')?.available).toBe(false);
      expect(slots.find((s) => s.start === '12:00')?.available).toBe(true);
    });
  });

  // ─── Schedule exceptions ───────────────────────────────────────────────────

  describe('schedule exceptions', () => {
    it('returns empty slots for a day-off exception', async () => {
      mockPrisma.scheduleException.findFirst.mockResolvedValue({
        isAvailable: false,
        startTime: null,
        endTime: null,
      });

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);
      expect(slots).toHaveLength(0);
      expect(mockPrisma.workingHour.findMany).not.toHaveBeenCalled();
    });

    it('uses exception hours instead of regular working hours', async () => {
      mockPrisma.scheduleException.findFirst.mockResolvedValue({
        isAvailable: true,
        startTime: '10:00',
        endTime: '12:00',
      });

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);

      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual({ start: '10:00', end: '11:00', available: true });
      expect(slots[1]).toEqual({ start: '11:00', end: '12:00', available: true });
      expect(mockPrisma.workingHour.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── isSlotAvailable ───────────────────────────────────────────────────────

  describe('isSlotAvailable', () => {
    it('returns true when no conflicts', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);
      const result = await service.isSlotAvailable(
        TENANT_ID,
        EMPLOYEE_ID,
        makeDate(DATE, '10:00'),
        makeDate(DATE, '11:00'),
      );
      expect(result).toBe(true);
    });

    it('returns false when there is a conflict', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue({ id: 'existing' });
      const result = await service.isSlotAvailable(
        TENANT_ID,
        EMPLOYEE_ID,
        makeDate(DATE, '10:00'),
        makeDate(DATE, '11:00'),
      );
      expect(result).toBe(false);
    });

    it('excludes the specified appointment from conflict check', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);
      const result = await service.isSlotAvailable(
        TENANT_ID,
        EMPLOYEE_ID,
        makeDate(DATE, '10:00'),
        makeDate(DATE, '11:00'),
        'exclude-this-id',
      );

      expect(result).toBe(true);
      const call = mockPrisma.appointment.findFirst.mock.calls[0][0];
      expect(call.where.id).toEqual({ not: 'exclude-this-id' });
    });
  });

  // ─── Multiple working periods ──────────────────────────────────────────────

  describe('split working hours (morning + afternoon)', () => {
    it('generates slots for both periods', async () => {
      mockPrisma.workingHour.findMany.mockResolvedValue([
        { startTime: '09:00', endTime: '13:00' },
        { startTime: '15:00', endTime: '18:00' },
      ]);

      const slots = await service.getAvailableSlots(TENANT_ID, EMPLOYEE_ID, DATE, 60);

      const starts = slots.map((s) => s.start);
      expect(starts).toContain('09:00');
      expect(starts).toContain('12:00');
      expect(starts).toContain('15:00');
      expect(starts).toContain('17:00');
      // Gap between 13:00 and 15:00 should not appear
      expect(starts).not.toContain('13:00');
      expect(starts).not.toContain('14:00');
    });
  });
});

import {
  zonedWallTimeToUtc,
  civilDayOfWeek,
  startOfDayUtc,
  endOfDayUtc,
  todayInTz,
  formatTimeInTz,
} from './timezone';

describe('timezone helpers', () => {
  describe('zonedWallTimeToUtc', () => {
    it('Madrid winter (CET, UTC+1): 10:00 → 09:00 UTC', () => {
      const utc = zonedWallTimeToUtc('2026-01-15', '10:00', 'Europe/Madrid');
      expect(utc.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    });

    it('Madrid summer (CEST, UTC+2): 10:00 → 08:00 UTC', () => {
      const utc = zonedWallTimeToUtc('2026-07-15', '10:00', 'Europe/Madrid');
      expect(utc.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    });

    it('handles a negative-offset zone (New York EDT, UTC-4)', () => {
      const utc = zonedWallTimeToUtc('2026-07-15', '10:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-07-15T14:00:00.000Z');
    });

    it('UTC zone is identity', () => {
      const utc = zonedWallTimeToUtc('2026-07-15', '10:00', 'UTC');
      expect(utc.toISOString()).toBe('2026-07-15T10:00:00.000Z');
    });
  });

  describe('civilDayOfWeek', () => {
    it('2026-07-07 is Tuesday (2) regardless of timezone', () => {
      expect(civilDayOfWeek('2026-07-07')).toBe(2);
    });

    it('2026-07-06 is Monday (1)', () => {
      expect(civilDayOfWeek('2026-07-06')).toBe(1);
    });
  });

  describe('startOfDayUtc / endOfDayUtc', () => {
    it('Madrid summer day spans 22:00 prev day → 22:00 UTC', () => {
      expect(startOfDayUtc('2026-07-15', 'Europe/Madrid').toISOString()).toBe(
        '2026-07-14T22:00:00.000Z',
      );
      expect(endOfDayUtc('2026-07-15', 'Europe/Madrid').toISOString()).toBe(
        '2026-07-15T22:00:00.000Z',
      );
    });
  });

  describe('todayInTz', () => {
    it('near midnight UTC returns the correct local civil date', () => {
      // 2026-07-15T23:30Z is already 2026-07-16 01:30 in Madrid (UTC+2)
      const at = new Date('2026-07-15T23:30:00.000Z');
      expect(todayInTz('Europe/Madrid', at)).toBe('2026-07-16');
      // ...and still 2026-07-15 19:30 in New York (UTC-4)
      expect(todayInTz('America/New_York', at)).toBe('2026-07-15');
    });
  });

  describe('formatTimeInTz', () => {
    it('renders the instant in the tenant timezone', () => {
      const at = new Date('2026-07-15T08:00:00.000Z');
      expect(formatTimeInTz(at, 'Europe/Madrid')).toBe('10:00');
    });
  });
});

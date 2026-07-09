/**
 * Timezone helpers.
 *
 * The database stores instants (timestamptz), but the business reasons in its
 * own wall-clock timezone (tenant.timezone, e.g. "Europe/Madrid"). Booking a
 * slot at "10:00" means 10:00 in that zone, which is a different UTC instant in
 * winter vs summer. These helpers convert between wall-clock time in a given
 * IANA zone and UTC using the runtime's full ICU data — no external dependency.
 */

/** Offset in ms of `timeZone` at instant `at` (positive east of UTC). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour % 24,
    +p.minute,
    +p.second,
  );
  return asUtc - at.getTime();
}

/**
 * Interpret `YYYY-MM-DD` + `HH:MM` as wall-clock time in `timeZone` and return
 * the corresponding UTC instant. Two-pass to settle DST boundaries.
 */
export function zonedWallTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const o1 = tzOffsetMs(timeZone, new Date(guess));
  const o2 = tzOffsetMs(timeZone, new Date(guess - o1));
  return new Date(guess - o2);
}

/** Day of week (0=Sun..6=Sat) of a civil date, independent of any timezone. */
export function civilDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** UTC instant at the start (00:00) of a civil day in `timeZone`. */
export function startOfDayUtc(dateStr: string, timeZone: string): Date {
  return zonedWallTimeToUtc(dateStr, '00:00', timeZone);
}

/** UTC instant at the start of the NEXT civil day in `timeZone` (exclusive end). */
export function endOfDayUtc(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + 1);
  return zonedWallTimeToUtc(next.toISOString().slice(0, 10), '00:00', timeZone);
}

/** Today's civil date (YYYY-MM-DD) in `timeZone`. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Format an instant as "HH:MM" in `timeZone`. */
export function formatTimeInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Format an instant as "YYYY-MM-DD" in `timeZone`. */
export function formatDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

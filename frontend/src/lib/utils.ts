import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return '-'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

// Pass the tenant's IANA timezone (e.g. "Europe/Madrid") so instants render in
// the business's wall-clock time regardless of the viewer's browser timezone.
// Omit it to fall back to the browser timezone.
export function formatDate(date: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: timeZone || undefined,
  }).format(new Date(date))
}

export function formatTime(date: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || undefined,
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date, timeZone?: string): string {
  return `${formatDate(date, timeZone)} ${formatTime(date, timeZone)}`
}

/** Today's civil date as YYYY-MM-DD in the given timezone (or the browser's). */
export function todayInTimezone(timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timeZone || undefined,
  }).format(new Date())
}

/** Civil date (YYYY-MM-DD) of an instant in the given timezone. */
export function dateKeyInTimezone(date: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(date))
}

/** Wall-clock hour of an instant in the timezone, as a fraction (10:30 → 10.5). */
export function hourOfDayInTimezone(date: string | Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(date))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') + get('minute') / 60
}

function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const p: Record<string, number> = {}
  for (const part of parts) p[part.type] = Number(part.value)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asUtc - at.getTime()
}

/**
 * Interpret "YYYY-MM-DD" + "HH:MM" as wall-clock time in `timeZone` and return
 * the UTC instant (same algorithm as the backend's zonedWallTimeToUtc). Slots
 * come from the API in the business's wall-clock time, so they must not be
 * parsed with the browser's timezone.
 */
export function zonedWallTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0)
  const o1 = tzOffsetMs(timeZone, new Date(guess))
  const o2 = tzOffsetMs(timeZone, new Date(guess - o1))
  return new Date(guess - o2)
}

export function getInitials(firstName: string, lastName?: string | null): string {
  const first = firstName?.[0]?.toUpperCase() ?? ''
  const last = lastName?.[0]?.toUpperCase() ?? ''
  return `${first}${last}`
}

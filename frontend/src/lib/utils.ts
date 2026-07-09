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

export function getInitials(firstName: string, lastName?: string | null): string {
  const first = firstName?.[0]?.toUpperCase() ?? ''
  const last = lastName?.[0]?.toUpperCase() ?? ''
  return `${first}${last}`
}

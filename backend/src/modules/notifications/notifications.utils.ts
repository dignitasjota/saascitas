/** Format price from cents to Spanish format (e.g. 4900 → "49,00 €") */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/**
 * Long Spanish date in the business's timezone, e.g. "viernes, 17 de octubre
 * de 2026". Formatting with the server's zone (UTC in Docker) would shift the
 * day for appointments near midnight.
 */
export function formatLongDateEs(
  date: Date,
  timeZone: string,
  withYear = true,
): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear && { year: 'numeric' }),
  }).format(date);
}

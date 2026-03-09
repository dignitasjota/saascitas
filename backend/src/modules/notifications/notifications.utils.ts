/** Format price from cents to Spanish format (e.g. 4900 → "49,00 €") */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

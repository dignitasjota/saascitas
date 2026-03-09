/**
 * Generate a URL-safe slug from a string.
 * Example: "Fontanería Madrid SL" → "fontaneria-madrid-sl"
 */
export function generateSlug(text: string): string {
  return text
    .normalize('NFD')                   // Decompose accents
    .replace(/[\u0300-\u036f]/g, '')    // Remove accent marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // Remove non-alphanumeric
    .replace(/[\s]+/g, '-')            // Spaces to hyphens
    .replace(/-+/g, '-')              // Collapse multiple hyphens
    .replace(/^-|-$/g, '');           // Trim hyphens
}

/**
 * Generate a unique slug by appending a random suffix if needed.
 */
export function generateUniqueSlug(text: string): string {
  const base = generateSlug(text);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

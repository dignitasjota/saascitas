/**
 * Detects a Postgres exclusion-constraint violation coming from the
 * `appointments_no_overlap` GiST constraint (see migration
 * `*_appointments_no_overlap_exclusion`).
 *
 * Prisma does not model exclusion constraints, so this violation is not mapped
 * to a dedicated P200x code. Depending on the Prisma version it surfaces either
 * with the native SQLSTATE (23P01) or as an unknown request error whose message
 * carries the constraint name — we check both defensively.
 */
export function isOverlapConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const e = err as {
    code?: string;
    meta?: Record<string, unknown>;
    message?: string;
  };

  // Postgres exclusion_violation SQLSTATE
  if (e.code === '23P01') return true;

  const haystack = `${e.message ?? ''} ${JSON.stringify(e.meta ?? {})}`;
  return (
    haystack.includes('appointments_no_overlap') ||
    haystack.includes('23P01') ||
    haystack.includes('exclusion constraint')
  );
}

/** Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && (err as { code?: string }).code === 'P2002'
  );
}

import { Prisma } from '@prisma/client';
import { getCurrentTenantId } from '../context/tenant-context';

/**
 * Models that carry a `tenantId` column and must be isolated per tenant.
 * `Tenant` itself is intentionally excluded (it has no tenantId; it IS the
 * tenant), so admin/platform queries over tenants are never filtered here.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'User',
  'Employee',
  'WorkingHour',
  'ScheduleException',
  'Service',
  'EmployeeService',
  'Customer',
  'Appointment',
  'Notification',
  'BookingToken',
  'RefreshToken',
  'AuditLog',
]);

// Operations whose `where` can safely receive an extra scalar filter.
const WHERE_FILTERED_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Defense-in-depth tenant isolation for Prisma.
 *
 * When a tenant is in context (see tenant-context.ts) every query against a
 * tenant-scoped model is constrained to that tenant, even if a service forgets
 * its manual `where: { tenantId }`. This is a safety net layered on top of the
 * explicit filters, not a replacement for them.
 *
 * Coverage and limits (deliberately conservative to avoid false safety):
 *  - Reads/aggregates/*Many operations: tenantId is injected into `where`.
 *  - findUnique / findUniqueOrThrow: the result is post-filtered by tenantId
 *    (their `where` only accepts unique fields, so it cannot be pre-filtered).
 *  - create / createMany: tenantId is forced onto the written rows.
 *  - Singular update / delete / upsert (by unique id) are NOT intercepted;
 *    services already verify ownership with findFirst({ id, tenantId }) before
 *    mutating by id, and their `where` cannot take a non-unique tenantId.
 */
export function tenantGuardExtension() {
  return Prisma.defineExtension({
    name: 'tenant-guard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = getCurrentTenantId();

          if (!tenantId || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const a: any = args ?? {};

          if (WHERE_FILTERED_OPS.has(operation)) {
            a.where = a.where
              ? { AND: [{ tenantId }, a.where] }
              : { tenantId };
            return query(a);
          }

          if (operation === 'create') {
            a.data = { ...a.data, tenantId };
            return query(a);
          }

          if (operation === 'createMany') {
            if (Array.isArray(a.data)) {
              a.data = a.data.map((d: any) => ({ ...d, tenantId }));
            } else if (a.data) {
              a.data = { ...a.data, tenantId };
            }
            return query(a);
          }

          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const result: any = await query(a);
            if (
              result &&
              result.tenantId !== undefined &&
              result.tenantId !== tenantId
            ) {
              if (operation === 'findUniqueOrThrow') {
                throw new Prisma.PrismaClientKnownRequestError(
                  'No record found for the current tenant',
                  { code: 'P2025', clientVersion: Prisma.prismaVersion.client },
                );
              }
              return null;
            }
            return result;
          }

          return query(a);
        },
      },
    },
  });
}

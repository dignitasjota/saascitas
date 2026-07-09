import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string;
}

/**
 * Per-request tenant context. Populated by the TenantInterceptor for
 * authenticated non-superadmin requests and consumed by the Prisma tenant-guard
 * extension to scope queries to the current tenant.
 *
 * When there is NO store (background jobs, public booking, auth endpoints,
 * superadmin) the extension does not inject any filter — those flows rely on
 * their own explicit `tenantId` filters or are legitimately cross-tenant.
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Run `fn` with the given tenant in context. `fn` must perform (and await) its
 * work inside the callback — Prisma promises are lazy, so a query merely
 * *created* here but awaited outside the scope would run without context.
 */
export function runInTenantScope<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

/** The tenant id in scope, or undefined when unscoped. */
export function getCurrentTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

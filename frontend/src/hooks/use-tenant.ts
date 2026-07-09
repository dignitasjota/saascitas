import { useAuthStore } from '@/stores/auth-store'

const DEFAULT_TZ = 'Europe/Madrid'

/**
 * The current tenant's IANA timezone (falls back to Europe/Madrid until the
 * tenant is loaded / for sessions persisted before timezone was stored).
 * Pass the result to formatDate/formatTime/todayInTimezone so dashboard times
 * render in the business's wall-clock time, not the browser's.
 */
export function useTenantTimezone(): string {
  return useAuthStore((s) => s.tenant?.timezone) ?? DEFAULT_TZ
}

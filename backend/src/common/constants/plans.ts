export type PlanKey = 'basic' | 'professional' | 'business';

/**
 * Max employees per plan. Single source of truth for billing (Stripe
 * webhooks) and the superadmin panel. More than 20 → contact sales.
 */
export const PLAN_MAX_EMPLOYEES: Record<PlanKey, number> = {
  basic: 1,
  professional: 5,
  business: 20,
};

/**
 * Max appointments per calendar month (tenant timezone); null = unlimited.
 * Cancelled appointments don't count.
 */
export const PLAN_MAX_MONTHLY_APPOINTMENTS: Record<PlanKey, number | null> = {
  basic: 100,
  professional: null,
  business: null,
};

/** Free trial: the Professional plan for this many days, no card required. */
export const TRIAL_DAYS = 14;

/** Days before the end of the trial when the reminder email is sent. */
export const TRIAL_REMINDER_DAYS = 3;

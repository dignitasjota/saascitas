export type PlanKey = 'basic' | 'professional' | 'business';

/**
 * Max employees per plan. Single source of truth for billing (Stripe
 * webhooks) and the superadmin panel, which used to disagree (20 vs 999).
 */
export const PLAN_MAX_EMPLOYEES: Record<PlanKey, number> = {
  basic: 1,
  professional: 5,
  business: 20,
};

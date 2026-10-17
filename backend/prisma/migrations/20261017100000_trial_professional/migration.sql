-- The free trial is now the Professional plan for 14 days. When it ends
-- without a subscription, a scheduled job moves the tenant to the free Basic
-- plan. trial_reminder_sent_at marks the "N days left" email as sent.
ALTER TABLE "tenants" ADD COLUMN "trial_reminder_sent_at" TIMESTAMPTZ;

-- Tenants currently in a trial (never paid) get Professional until their
-- existing trial end date. Expired trials are handled by the job on its first
-- run (they drop to Basic).
UPDATE "tenants"
SET "plan" = 'professional', "max_employees" = 5
WHERE "plan_status" = 'trialing'
  AND "stripe_subscription_id" IS NULL
  AND "trial_ends_at" > now()
  AND "deleted_at" IS NULL;

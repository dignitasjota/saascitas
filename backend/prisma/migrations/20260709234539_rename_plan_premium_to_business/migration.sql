-- Rename SubscriptionPlan enum value: premium -> business
-- Aligns the DB enum with the application code (billing/admin) and the
-- frontend, which already use "business". Preserves existing rows.
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'premium' TO 'business';

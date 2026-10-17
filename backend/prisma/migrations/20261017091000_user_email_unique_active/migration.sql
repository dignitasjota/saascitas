-- Login, refresh and password reset look users up by email across ALL tenants,
-- but uniqueness was only (email, tenant_id) and included soft-deleted rows:
--  * an owner could create a user in their tenant with another tenant's
--    email, making that person's login ambiguous (and lockable);
--  * a deleted user's email could never be reused in the same tenant (P2002).
-- Replace it with a global unique index over active (non-deleted) users.

DROP INDEX IF EXISTS "users_email_tenant_id_key";

-- Don't block the deploy if existing data already has duplicates: skip the
-- index and warn so they can be cleaned up, then re-run the statement below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "deleted_at" IS NULL
    GROUP BY lower("email")
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'users_email_active_key NOT created: duplicate active emails exist. Resolve them and create the index manually.';
  ELSE
    CREATE UNIQUE INDEX "users_email_active_key"
      ON "users" (lower("email"))
      WHERE "deleted_at" IS NULL;
  END IF;
END $$;

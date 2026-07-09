-- Prevent duplicate active customers with the same phone within a tenant.
-- Partial (excludes soft-deleted rows) so a deleted customer's phone can be
-- reused. Prisma cannot model partial unique indexes, so it lives here.
CREATE UNIQUE INDEX "customers_tenant_phone_active"
  ON "customers" ("tenant_id", "phone")
  WHERE "deleted_at" IS NULL;

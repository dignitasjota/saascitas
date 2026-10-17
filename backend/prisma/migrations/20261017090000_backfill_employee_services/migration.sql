-- Until now nothing outside the seed created employee_services rows, so public
-- booking listed no professionals for any real tenant. For tenants that have no
-- links at all, link every active employee to every active service (the same
-- default now applied when creating employees/services). Tenants that already
-- configured links are left untouched.
INSERT INTO "employee_services" ("employee_id", "service_id", "tenant_id")
SELECT e."id", s."id", e."tenant_id"
FROM "employees" e
JOIN "services" s
  ON s."tenant_id" = e."tenant_id"
 AND s."deleted_at" IS NULL
 AND s."is_active" = true
WHERE e."deleted_at" IS NULL
  AND e."is_active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "employee_services" es WHERE es."tenant_id" = e."tenant_id"
  )
ON CONFLICT DO NOTHING;

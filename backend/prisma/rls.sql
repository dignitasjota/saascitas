-- ============================================
-- ROW LEVEL SECURITY (RLS) for Multi-Tenancy
-- Run after Prisma migrations: psql $DATABASE_URL -f prisma/rls.sql
-- ============================================

-- Create application role (non-superuser, RLS applies). The password is passed
-- as a psql variable so no secret is committed to the repo:
--   psql "$DATABASE_URL" -v app_user_password="$APP_USER_PASSWORD" -f prisma/rls.sql
-- %L quotes it safely; the role is created only if it doesn't already exist.
SELECT format('CREATE ROLE app_user LOGIN PASSWORD %L', :'app_user_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')
\gexec

-- Grant permissions to app_user
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for each table
-- Each policy ensures a row is only visible if tenant_id matches the session variable

CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_employees ON employees
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_working_hours ON working_hours
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_schedule_exceptions ON schedule_exceptions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_services ON services
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_employee_services ON employee_services
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_appointments ON appointments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_notifications ON notifications
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_booking_tokens ON booking_tokens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Note: The database owner used by Prisma bypasses RLS unless the tables use
-- FORCE ROW LEVEL SECURITY and the session sets app.current_tenant_id inside a
-- transaction. This script is an OPTIONAL extra hardening layer for production
-- (connect the app as the non-owner app_user for it to take effect).
--
-- The PRIMARY tenant isolation now runs at the application layer: the Prisma
-- `tenant-guard` extension (src/common/prisma/tenant-extension.ts) injects the
-- current tenant (from the per-request AsyncLocalStorage context) into every
-- query against a tenant-scoped model. See tenant-guard.int-spec.ts for the
-- verified behaviour.

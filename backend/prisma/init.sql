-- This file runs when PostgreSQL container starts for the first time.
-- It sets up RLS policies for multi-tenant isolation.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Note: RLS policies are applied AFTER Prisma migrations create the tables.
-- Run this manually or via a post-migration script:
--
--   psql $DATABASE_URL -f prisma/rls.sql
--
-- We keep RLS setup separate because Prisma Migrate doesn't support RLS natively.

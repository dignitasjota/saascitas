-- The schema has had the 'superadmin' role (admin panel) since it was added,
-- but no migration ever added it to the Postgres enum: on a database built
-- with `prisma migrate deploy` no superadmin could exist. IF NOT EXISTS keeps
-- this safe where the value was already added by hand.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'superadmin';

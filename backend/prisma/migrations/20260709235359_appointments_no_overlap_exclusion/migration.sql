-- Prevent double-booking at the database level (the check-then-insert in
-- application code has a race window; two concurrent bookings for the same
-- employee + overlapping time could both pass isSlotAvailable and insert).
--
-- A GiST exclusion constraint makes overlapping active appointments for the
-- same employee physically impossible. tstzrange defaults to [start, end),
-- so back-to-back appointments (10:00-11:00 and 11:00-12:00) do NOT conflict,
-- matching the application's overlap logic (startsAt < endsAt AND endsAt > startsAt).
-- Cancelled / no_show appointments are excluded so their slots stay reusable.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" NOT IN ('cancelled', 'no_show'));

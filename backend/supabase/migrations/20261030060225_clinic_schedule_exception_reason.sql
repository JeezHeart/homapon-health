-- Additive only: existing appointments retain their dates and have no reason.
-- Review and authorize the target database before applying this migration.
alter table public.appointments
  add column if not exists schedule_exception_reason text;

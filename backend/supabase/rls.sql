-- Phase 3: link staff logins to roles + lock tables with RLS.
-- Run ONCE in Supabase SQL Editor (fresh paste, then Run).
-- Safe to re-run: every step below tolerates already-applied state.
-- Backend uses the service_role key (bypasses RLS); browsers and any
-- anon-key access must pass these policies. No real data in this file.

-- 0. Remove accidental duplicate staff rows (keep the earliest per
-- name+role). Nothing references staff, so this deletes cleanly.
delete from staff a
using staff b
where a.name = b.name
  and a.role = b.role
  and a.created_at > b.created_at;

-- 1. Staff rows point at Supabase Auth users.
alter table staff add column if not exists auth_user_id uuid unique references auth.users (id);

-- 2. Turn on RLS on every table. With no policies defined for anon or
-- authenticated roles, PostgREST denies direct browser/client access by
-- default; all tables stay reachable only via the backend's server-only
-- service_role client, which enforces authentication, staff membership,
-- validation, and audit logging.
-- migration-sms-reservations.sql separately enables RLS and revokes browser
-- access to the live-send ledger and its SECURITY INVOKER RPCs.
alter table children enable row level security;
alter table dose_records enable row level security;
alter table appointments enable row level security;
alter table sms_log enable row level security;
alter table staff enable row level security;
alter table audit_events enable row level security;

-- 3. Remove any previously applied permissive PostgREST policies so
-- re-running this script locks down existing databases as well.
drop policy if exists "authenticated full access" on children;
drop policy if exists "authenticated full access" on dose_records;
drop policy if exists "authenticated full access" on appointments;
drop policy if exists "authenticated full access" on sms_log;

-- 4. Link the two demo logins to their staff roles.
-- (Auth user IDs confirmed in Dashboard > Authentication > Users.)
update staff set auth_user_id = 'fa00a353-d8e8-40a7-a965-31995455a0ac'
  where role = 'midwife' and name = 'Demo Midwife';
update staff set auth_user_id = '5579e779-4abc-4fc7-9777-7588dd67143f'
  where role = 'bhw' and name = 'Demo BHW';

-- Phase 2 schema: Barangay Homapon child immunization system.
-- Run in Supabase Dashboard > SQL Editor (paste the whole file, Run).
-- Fictional seed data lives in seed.sql. Never store real child data
-- in fixtures or screenshots.

-- Children registry (paper: child registration; purok supports
-- "Reaching Every Purok"; weightKg per the manual flow).
create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  sex text not null check (sex in ('Female', 'Male')),
  guardian text not null,
  guardian_mobile text not null,
  purok text not null default '',
  weight_kg numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- Completed dose records. One row per child/vaccine/dose, enforced.
create table if not exists dose_records (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id) on delete cascade,
  vaccine_id text not null,
  dose_number int not null check (dose_number >= 1),
  date_administered date not null,
  health_worker text not null,
  batch_lot text,
  remarks text,
  created_at timestamptz not null default now(),
  unique (child_id, vaccine_id, dose_number)
);

-- Scheduled (upcoming/overdue) appointments. Status is derived from
-- scheduled_date vs today, exactly like the frontend derives it.
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id) on delete cascade,
  vaccine_id text not null,
  dose_number int not null check (dose_number >= 1),
  scheduled_date date not null,
  scheduled_time text,
  schedule_exception_reason text,
  follow_up_status text,
  follow_up_notes text,
  follow_up_date date,
  created_at timestamptz not null default now()
);

-- SMS reminder log (simulated in frontend phase; real Semaphore
-- delivery tracking lands here in Phase 5).
create table if not exists sms_log (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id) on delete cascade,
  message text not null,
  sent_at date not null,
  status text not null,
  created_at timestamptz not null default now()
);

-- Staff accounts (used for real in Phase 3 auth; roles per the paper:
-- midwife administers, BHW encodes).
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('midwife', 'bhw')),
  created_at timestamptz not null default now()
);

-- Audit trail (written by the API from Phase 3 onward).
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  created_at timestamptz not null default now()
);

-- Helpful indexes for the app's main queries.
-- After this base schema, apply migration-sms-reservations.sql for the
-- live-send ledger, metadata columns, and service-only transactional RPCs.
create index if not exists dose_records_child_idx on dose_records (child_id);
create index if not exists appointments_child_idx on appointments (child_id);
create index if not exists appointments_date_idx on appointments (scheduled_date);
create index if not exists sms_log_child_idx on sms_log (child_id);

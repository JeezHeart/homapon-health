-- Additive migration. Apply after schema.sql to a LOCAL test database first.
-- Never expire/reclaim reserved, dispatching, or unknown rows automatically.
begin;

alter table public.sms_log
  add column if not exists attempt_id uuid,
  add column if not exists provider text,
  add column if not exists provider_id text,
  add column if not exists delivery_status text not null default 'legacy_unknown';
create unique index if not exists sms_log_attempt_unique on public.sms_log (attempt_id);

-- IDs are retained snapshots, not cascading FKs: deleting a booking/child
-- must not erase the durable barrier after an external submission.
create table if not exists public.sms_send_reservations (
  reminder_key text primary key check (reminder_key ~ '^[0-9a-f]{64}$'),
  scope_key text not null check (scope_key ~ '^[0-9a-f]{64}$'),
  attempt_id uuid not null unique,
  child_id uuid not null,
  appointment_id uuid not null,
  staff_id uuid not null,
  recipient text not null,
  message text not null,
  provider text not null check (provider in ('semaphore', 'unisms')),
  state text not null check (state in ('reserved', 'dispatching', 'accepted', 'not_sent', 'unknown')),
  provider_id text,
  provider_status text,
  log_id uuid,
  updated_at timestamptz not null default now(),
  check (state <> 'accepted' or nullif(provider_id, '') is not null)
);
create unique index if not exists sms_one_unresolved_scope
  on public.sms_send_reservations (scope_key)
  where state in ('reserved', 'dispatching', 'unknown');
create unique index if not exists sms_one_unresolved_booking
  on public.sms_send_reservations (appointment_id)
  where state in ('reserved', 'dispatching', 'unknown');
alter table public.sms_send_reservations enable row level security;
revoke all on public.sms_send_reservations from public, anon, authenticated, service_role;
grant select, insert, update on public.sms_send_reservations to service_role;

create or replace function public.claim_sms_send(
  p_key text, p_scope text, p_attempt_id uuid, p_child_id uuid,
  p_appointment_id uuid, p_staff_id uuid, p_recipient text,
  p_message text, p_provider text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.sms_send_reservations;
  entry public.sms_log;
begin
  -- Serializes this vaccine/dose even across changed dates and API instances.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_scope, 0));
  select * into r from public.sms_send_reservations
    where (scope_key = p_scope or appointment_id = p_appointment_id)
      and state in ('reserved', 'dispatching', 'unknown')
    limit 1
    for update;
  if found then
    return jsonb_build_object('kind', 'blocked', 'state', r.state);
  end if;
  select * into r from public.sms_send_reservations where reminder_key = p_key for update;
  if found and r.state = 'accepted' then
    select * into entry from public.sms_log where id = r.log_id;
    if not found then return jsonb_build_object('kind', 'blocked', 'state', 'accepted'); end if;
    return jsonb_build_object('kind', 'replayed', 'entry', to_jsonb(entry),
      'provider', r.provider, 'providerId', r.provider_id);
  end if;

  -- Conservative cutover guard: old Sent rows cannot be reliably separated
  -- into real sends vs historical dry-runs. Never rewrite them by guessing.
  if exists (select 1 from public.sms_log where child_id = p_child_id
    and message = p_message and status = 'Sent' and attempt_id is null
    and created_at >= now() - interval '24 hours') then
    return jsonb_build_object('kind', 'blocked', 'state', 'legacy');
  end if;

  insert into public.sms_send_reservations as existing (
    reminder_key, scope_key, attempt_id, child_id, appointment_id, staff_id,
    recipient, message, provider, state
  ) values (p_key, p_scope, p_attempt_id, p_child_id, p_appointment_id, p_staff_id,
    p_recipient, p_message, p_provider, 'reserved')
  on conflict (reminder_key) do update set
    attempt_id = excluded.attempt_id, appointment_id = excluded.appointment_id,
    staff_id = excluded.staff_id, recipient = excluded.recipient,
    message = excluded.message, provider = excluded.provider, state = 'reserved',
    provider_id = null, provider_status = null, log_id = null, updated_at = now()
  where existing.state = 'not_sent'
  returning * into r;
  if not found then return jsonb_build_object('kind', 'blocked', 'state', 'unknown'); end if;
  return jsonb_build_object('kind', 'claimed', 'reservation', to_jsonb(r));
end;
$$;

create or replace function public.begin_sms_dispatch(p_key text, p_attempt_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.sms_send_reservations set state = 'dispatching', updated_at = now()
    where reminder_key = p_key and attempt_id = p_attempt_id and state = 'reserved';
  return found;
end;
$$;

create or replace function public.finish_sms_send(
  p_key text, p_attempt_id uuid, p_outcome text,
  p_provider_id text default null, p_provider_status text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.sms_send_reservations;
  entry public.sms_log;
begin
  select * into r from public.sms_send_reservations where reminder_key = p_key for update;
  if not found or r.attempt_id <> p_attempt_id then
    raise exception 'SMS attempt ownership mismatch';
  end if;
  if p_outcome not in ('accepted', 'not_sent', 'unknown') or p_outcome is null then
    raise exception 'Invalid SMS outcome';
  end if;
  if r.state = p_outcome then
    select * into entry from public.sms_log where id = r.log_id;
    return to_jsonb(entry);
  end if;
  -- Only a pre-dispatch reservation can be released. HTTP rejection, abort,
  -- timeout, and old age do NOT establish that no provider submission occurred.
  if (p_outcome = 'not_sent' and r.state <> 'reserved') or
     (p_outcome <> 'not_sent' and r.state <> 'dispatching') then
    raise exception 'Unsafe SMS state transition';
  end if;
  if p_outcome = 'accepted' and nullif(p_provider_id, '') is null then
    raise exception 'Provider reference required for acceptance';
  end if;
  insert into public.sms_log (
    child_id, message, sent_at, status, attempt_id, provider, provider_id, delivery_status
  ) values (
    r.child_id, r.message, (clock_timestamp() at time zone 'Asia/Manila')::date,
    case p_outcome when 'accepted' then 'Accepted' when 'unknown' then 'Unknown' else 'Not sent' end,
    p_attempt_id, r.provider, p_provider_id,
    case p_outcome when 'accepted' then 'unconfirmed' when 'unknown' then 'unknown' else 'not_sent' end
  ) returning * into entry;
  update public.sms_send_reservations set state = p_outcome,
    provider_id = p_provider_id, provider_status = p_provider_status,
    log_id = entry.id, updated_at = now() where reminder_key = p_key;
  return to_jsonb(entry);
end;
$$;

revoke all on function public.claim_sms_send(text,text,uuid,uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.begin_sms_dispatch(text,uuid) from public, anon, authenticated;
revoke all on function public.finish_sms_send(text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_sms_send(text,text,uuid,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.begin_sms_dispatch(text,uuid) to service_role;
grant execute on function public.finish_sms_send(text,uuid,text,text,text) to service_role;
commit;

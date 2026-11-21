-- Review and approve the target database before applying this migration.
begin;

alter table public.children add column dose_review_revision uuid;

create function public.bump_dose_review_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.children set dose_review_revision = gen_random_uuid() where id = old.child_id;
  elsif tg_op = 'INSERT' or new is distinct from old then
    if tg_op = 'UPDATE' and old.child_id <> new.child_id then
      update public.children set dose_review_revision = gen_random_uuid() where id = old.child_id;
    end if;
    update public.children set dose_review_revision = gen_random_uuid() where id = new.child_id;
  end if;
  return null;
end;
$$;
create trigger dose_review_revision
after insert or update or delete on public.dose_records
for each row execute function public.bump_dose_review_revision();
revoke all on function public.bump_dose_review_revision() from public, anon, authenticated;

-- The historical identifiers deliberately survive deletion of source rows or staff.
create table public.immunization_review_events (
  id bigint generated always as identity primary key,
  child_id uuid not null,
  finding_key text not null check (finding_key ~ '^[0-9a-f]{64}$'),
  version text not null check (version ~ '^[0-9a-f]{64}$'),
  vaccine_id text not null,
  issue_type text not null,
  record_ids uuid[] not null check (cardinality(record_ids) > 0),
  reviewer_id uuid not null,
  reviewer_name text not null,
  reviewer_role text not null check (reviewer_role in ('bhw', 'midwife')),
  from_status text not null check (from_status in ('pending', 'verified', 'escalated')),
  status text not null check (status in ('verified', 'escalated', 'resolved')),
  remarks text not null check (char_length(remarks) <= 500),
  created_at timestamptz not null default clock_timestamp()
);
create index immunization_review_history_idx
  on public.immunization_review_events (finding_key, id desc);
alter table public.immunization_review_events enable row level security;
revoke all on public.immunization_review_events from public, anon, authenticated, service_role;
grant select, insert on public.immunization_review_events to service_role;

create view public.immunization_review_latest with (security_invoker = true) as
select distinct on (e.finding_key) e.finding_key, e.version, e.status, e.id::text as event_id,
  e.child_id, e.vaccine_id, e.issue_type, e.record_ids, c.dose_review_revision
from public.immunization_review_events e join public.children c on c.id = e.child_id
order by finding_key, e.id desc;
revoke all on public.immunization_review_latest from public, anon, authenticated;
grant select on public.immunization_review_latest to service_role;

create function public.transition_immunization_review(
  p_child uuid, p_vaccine text, p_finding text, p_version text, p_issue text,
  p_records uuid[], p_revision uuid, p_actor uuid, p_expected text,
  p_status text, p_remarks text, p_clinic_date date
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor public.staff%rowtype;
  previous public.immunization_review_events%rowtype;
  saved public.immunization_review_events%rowtype;
  revision uuid;
  prior text := 'pending';
  expected text;
begin
  select * into actor from public.staff where id = p_actor for share;
  if not found or actor.role not in ('bhw', 'midwife') then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- The dose trigger takes this same lock before a dose change can commit.
  select dose_review_revision into revision from public.children where id = p_child for no key update;
  if not found then return jsonb_build_object('error', 'stale'); end if;
  select * into previous from public.immunization_review_events
    where finding_key = p_finding and child_id = p_child order by id desc limit 1;
  if revision is distinct from p_revision
     or p_clinic_date is distinct from (clock_timestamp() at time zone 'Asia/Manila')::date
     or p_records is null or cardinality(p_records) = 0
     or exists (select 1 from public.dose_records d where d.id = any(p_records)
       and (d.child_id <> p_child or d.vaccine_id <> p_vaccine))
     or (not coalesce((previous.status = 'escalated' and p_status = 'resolved'
       and previous.record_ids = p_records and previous.vaccine_id = p_vaccine
       and previous.issue_type = p_issue), false) and exists (
       select 1 from unnest(p_records) as affected(id)
       where not exists (select 1 from public.dose_records d
         where d.id = affected.id and d.child_id = p_child and d.vaccine_id = p_vaccine)
     )) then
    return jsonb_build_object('error', 'stale');
  end if;

  if previous.version = p_version or previous.status = 'escalated' then
    prior := previous.status;
    expected := previous.id::text;
  end if;
  if expected is distinct from p_expected then return jsonb_build_object('error', 'stale'); end if;
  if p_status = 'resolved' and actor.role <> 'midwife' then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not coalesce(
    (prior = 'pending' and p_status in ('verified', 'escalated')) or
    (prior = 'verified' and p_status = 'escalated') or
    (prior = 'escalated' and p_status = 'resolved'), false
  ) then return jsonb_build_object('error', 'transition'); end if;

  insert into public.immunization_review_events (
    child_id, finding_key, version, vaccine_id, issue_type, record_ids,
    reviewer_id, reviewer_name, reviewer_role, from_status, status, remarks
  ) values (p_child, p_finding, p_version, p_vaccine, p_issue, p_records,
    actor.id, actor.name, actor.role, prior, p_status, p_remarks)
  returning * into saved;
  insert into public.audit_events (actor, action, entity, entity_id)
    values (actor.name, 'review_status_changed', 'immunization_review', saved.id::text);
  return jsonb_build_object('eventId', saved.id::text, 'status', saved.status);
end;
$$;
revoke all on function public.transition_immunization_review(uuid,text,text,text,text,uuid[],uuid,uuid,text,text,text,date)
  from public, anon, authenticated;
grant execute on function public.transition_immunization_review(uuid,text,text,text,text,uuid[],uuid,uuid,text,text,text,date)
  to service_role;

commit;

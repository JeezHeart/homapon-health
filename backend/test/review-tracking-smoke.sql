-- Run against a disposable local or approved staging database after the migration.
-- Use psql -v ON_ERROR_STOP=1. All fixtures are fictional and rolled back.
begin;
do $$
declare
  child uuid := gen_random_uuid();
  other_child uuid := gen_random_uuid();
  dose uuid := gen_random_uuid();
  other_dose uuid := gen_random_uuid();
  bhw uuid := gen_random_uuid();
  midwife uuid := gen_random_uuid();
  revision uuid;
  version text := repeat('a', 64);
  finding text := repeat('b', 64);
  result jsonb;
  event_id text;
  today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  signature text := 'public.transition_immunization_review(uuid,text,text,text,text,uuid[],uuid,uuid,text,text,text,date)';
begin
  assert not has_function_privilege('authenticated', signature, 'EXECUTE');
  assert not has_function_privilege('anon', signature, 'EXECUTE');
  assert not has_table_privilege('authenticated', 'public.immunization_review_events', 'SELECT');
  assert not has_table_privilege('service_role', 'public.immunization_review_events', 'DELETE');
  insert into public.children(id, first_name, last_name, birth_date, sex, guardian, guardian_mobile)
    values (child, 'Fictional', 'Review Test', '2024-01-01', 'Female', 'Fictional Guardian', '09000000000'),
           (other_child, 'Fictional', 'Other Child', '2024-01-01', 'Female', 'Fictional Guardian', '09000000000');
  insert into public.staff(id, name, role)
    values (bhw, 'Fictional BHW', 'bhw'), (midwife, 'Fictional Midwife', 'midwife');
  insert into public.dose_records(id, child_id, vaccine_id, dose_number, date_administered, health_worker)
    values (dose, child, 'penta', 3, '2024-05-01', 'Fictional Worker'),
           (other_dose, other_child, 'penta', 3, '2024-05-01', 'Fictional Worker');
  select dose_review_revision into revision from public.children where id = child;
  assert revision is not null, 'insert must advance revision';

  set local role service_role;
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[other_dose], revision, bhw, null, 'verified', '', today);
  assert result = '{"error":"stale"}'::jsonb;
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, bhw, null, 'escalated', 'Review source register', today);
  assert result->>'status' = 'escalated';
  event_id := result->>'eventId';
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, bhw, null, 'escalated', '', today);
  assert result = '{"error":"stale"}'::jsonb;
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, bhw, event_id, 'resolved', '', today);
  assert result = '{"error":"forbidden"}'::jsonb;
  update public.dose_records set date_administered = '2024-05-02' where id = dose;
  select dose_review_revision into revision from public.children where id = child;
  version := repeat('c', 64);
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, bhw, event_id, 'verified', '', today);
  assert result = '{"error":"transition"}'::jsonb;
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, bhw, null, 'verified', '', today);
  assert result = '{"error":"stale"}'::jsonb;
  delete from public.dose_records where id = dose;
  select dose_review_revision into revision from public.children where id = child;
  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, midwife, event_id, 'resolved', '', today);
  assert result->>'status' = 'resolved';
  assert (select count(*) from public.immunization_review_events where finding_key = finding and child_id = child) = 2;
  assert (select count(*) from public.audit_events where entity = 'immunization_review'
    and entity_id in (event_id, result->>'eventId')) = 2;

  result := public.transition_immunization_review(child, 'penta', finding, version, 'prior_dose_not_recorded',
    array[dose], revision, midwife, null, 'verified', '', today);
  assert result = '{"error":"stale"}'::jsonb;
  reset role;
end;
$$;
rollback;

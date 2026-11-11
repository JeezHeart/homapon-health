-- Prepared only. Apply after reviewing and approving the target database.
create table public.growth_measurements (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric check (weight_kg > 0 and weight_kg <= 200),
  height_cm numeric check (height_cm > 0 and height_cm <= 250),
  position text check (position in ('lying', 'standing')),
  oedema text not null check (oedema in ('unknown', 'no', 'yes')),
  notes text not null default '' check (length(notes) <= 500),
  recorded_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (child_id, measured_on),
  check (weight_kg is not null or height_cm is not null),
  check ((height_cm is null and position is null) or (height_cm is not null and position is not null))
);
alter table public.growth_measurements enable row level security;
revoke all on public.growth_measurements from public, anon, authenticated;
grant select, insert, delete on public.growth_measurements to service_role;
-- No browser policies: staff access is enforced by the protected Express API.

-- One transaction: a measurement failure rolls back the new child too.
create function public.register_child_with_growth(p_child jsonb, p_measurement jsonb, p_staff uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved_child public.children;
  measurement_id uuid;
begin
  if p_measurement->>'weightKg' is null or p_measurement->>'heightCm' is null then
    raise exception 'Initial weight and length/height are required';
  end if;
  if (p_measurement->>'measuredOn')::date < (p_child->>'birth_date')::date
    or (p_measurement->>'measuredOn')::date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'Invalid measurement date';
  end if;
  insert into public.children(first_name, last_name, birth_date, sex, guardian, guardian_mobile, purok, weight_kg, notes)
  values (p_child->>'first_name', p_child->>'last_name', (p_child->>'birth_date')::date,
    p_child->>'sex', p_child->>'guardian', p_child->>'guardian_mobile', coalesce(p_child->>'purok', ''),
    (p_measurement->>'weightKg')::numeric, p_child->>'notes') returning * into saved_child;
  insert into public.growth_measurements(child_id, measured_on, weight_kg, height_cm, position, oedema, notes, recorded_by)
  values (saved_child.id, (p_measurement->>'measuredOn')::date, (p_measurement->>'weightKg')::numeric,
    (p_measurement->>'heightCm')::numeric, p_measurement->>'position', p_measurement->>'oedema',
    coalesce(p_measurement->>'notes', ''), p_staff) returning id into measurement_id;
  return jsonb_build_object('child', to_jsonb(saved_child), 'measurementId', measurement_id);
end;
$$;
revoke all on function public.register_child_with_growth(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.register_child_with_growth(jsonb, jsonb, uuid) to service_role;

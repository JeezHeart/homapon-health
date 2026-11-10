-- Fictional seed data for development ONLY (mirrors src/data/mockData.ts).
-- Run after schema.sql in the SQL Editor. Never add real child data.

insert into children (id, first_name, last_name, birth_date, sex, guardian, guardian_mobile, purok, weight_kg, notes) values
  ('11111111-1111-1111-1111-111111111111', 'Althea', 'Reyes', '2024-03-14', 'Female', 'Jenny Reyes', '0900-000-0001', 'Purok 3, Homapon', 11.5, null),
  ('22222222-2222-2222-2222-222222222222', 'Marco', 'Villanueva', '2023-07-02', 'Male', 'Paolo Villanueva', '0900-000-0002', 'Purok 1, Homapon', null, null),
  ('33333333-3333-3333-3333-333333333333', 'Sofia', 'Ramos', '2025-01-20', 'Female', 'Liza Ramos', '0900-000-0003', 'Purok 5, Homapon', 8.2, 'Guardian prefers morning appointments.'),
  ('44444444-4444-4444-4444-444444444444', 'Liam', 'Garcia', '2022-11-30', 'Male', 'Mark Garcia', '0900-000-0004', 'Purok 2, Homapon', 14.0, null),
  ('55555555-5555-5555-5555-555555555555', 'Ava', 'Mendoza', '2025-06-08', 'Female', 'Rosa Mendoza', '0900-000-0005', 'Purok 4, Homapon', null, null),
  ('66666666-6666-6666-6666-666666666666', 'Noah', 'Aquino', '2024-09-25', 'Male', 'Chris Aquino', '0900-000-0006', 'Purok 6, Homapon', null, null),
  ('77777777-7777-7777-7777-777777777777', 'Mia', 'Torres', '2023-02-11', 'Female', 'Ana Torres', '0900-000-0007', 'Purok 7, Homapon', null, null),
  ('88888888-8888-8888-8888-888888888888', 'Ethan', 'Castillo', '2026-04-17', 'Male', 'Joy Castillo', '0900-000-0008', 'Purok 3, Homapon', null, null)
on conflict (id) do nothing;

-- A small starter history (full history mirrors the frontend demo set).
insert into dose_records (child_id, vaccine_id, dose_number, date_administered, health_worker, batch_lot, remarks) values
  ('33333333-3333-3333-3333-333333333333', 'bcg', 1, current_date - 50, 'Nurse Demo Santos', 'LOT-2026-001', 'No reaction observed'),
  ('33333333-3333-3333-3333-333333333333', 'hepb', 1, current_date - 50, 'Nurse Demo Santos', 'LOT-2026-002', null),
  ('11111111-1111-1111-1111-111111111111', 'bcg', 1, current_date - 580, 'Nurse Demo Santos', 'LOT-2026-003', null),
  ('11111111-1111-1111-1111-111111111111', 'hepb', 1, current_date - 580, 'Nurse Demo Santos', 'LOT-2026-004', null)
on conflict (child_id, vaccine_id, dose_number) do nothing;

insert into appointments (child_id, vaccine_id, dose_number, scheduled_date) values
  ('33333333-3333-3333-3333-333333333333', 'penta', 2, current_date - 6),
  ('33333333-3333-3333-3333-333333333333', 'opv', 2, current_date - 6),
  ('11111111-1111-1111-1111-111111111111', 'penta', 3, current_date - 2),
  ('66666666-6666-6666-6666-666666666666', 'penta', 3, current_date),
  ('55555555-5555-5555-5555-555555555555', 'penta', 2, current_date + 2);

insert into staff (id, name, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Demo Midwife', 'midwife'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Demo BHW', 'bhw')
on conflict (id) do nothing;

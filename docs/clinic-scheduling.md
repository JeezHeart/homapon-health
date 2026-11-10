# Weekly clinic scheduling

The health center's regular immunization day is Wednesday. New appointments
default to the next Wednesday, including today when today is Wednesday. Staff
can choose another date and must enter a reason in the appointment form.
Holiday dates and replacement days are decided manually by the health center.

This change schedules individual appointments. It does not cancel a Wednesday
session or move other children's bookings automatically. Staff must update
each affected appointment. Existing bookings and their dates are preserved.

The dashboard shows the earliest date with pending appointments, with separate
counts for children and appointments. Completed doses and overdue bookings are
excluded. With no pending bookings, the next regular Wednesday is a suggestion,
not a confirmed session. “View session” opens that date in the schedule calendar.

## API and database prerequisite

Optional request/response field: `scheduleExceptionReason` (text, at most 500
characters after trimming). It maps to `appointments.schedule_exception_reason`.
An empty string or null clears the reason; leaving the field out preserves it
on an update. Legacy API records may omit a reason. The frontend requires a
reason when saving a non-Wednesday booking and clears it when moved to Wednesday.

Before using the updated appointment form against an existing database, review
and explicitly authorize this additive migration for the correct target:

`backend/supabase/migrations/20261030060225_clinic_schedule_exception_reason.sql`

It adds one nullable text column. It does not change dates, data, grants, or RLS
policies. Do not run the full schema or RLS files to apply this change. Without
the new column, requests writing the reason field will fail. Regular bookings
without a prior exception omit that field and remain compatible. No migration is
applied by the app or its mocked tests.

## Local verification

- Frontend: `node --test test/*.test.mjs`, `npm.cmd run lint`,
  `npx.cmd --no-install tsc -b --noEmit`, `npm.cmd run build`.
- Backend: `npm.cmd test` (database/provider calls are mocked; the dedicated
  local Postgres reservation test is skipped unless explicitly configured).

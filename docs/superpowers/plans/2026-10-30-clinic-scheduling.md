# Clinic Scheduling Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan inline, task by task.

**Goal:** Default appointments to Wednesday, retain staff-entered exception reasons, and show the next booked clinic session on the dashboard.

**Architecture:** Extend the existing shared appointment form and appointment API mapping. Derive the dashboard session from pending appointments, without introducing a session service or automatic holiday calendar.

**Tech Stack:** React, TypeScript, Tailwind, Express, existing Supabase/Postgres schema, node:test and Vite's existing TypeScript loader.

**Spec:** User-approved chat requirements: Wednesday is the regular clinic day; staff choose a replacement date for a holiday. Implement the first two recommended frontend priorities.

## Global Constraints
- Preserve pre-existing changes. No dependencies, commits, deployment, production access, live SMS, or applied migrations.
- Existing non-Wednesday appointments remain valid; no bulk movement or invented holiday dates.
- Keep the existing visual tokens and accessible labels. Display exception reasons as plain text.
- The optional API field `scheduleExceptionReason` maps to `schedule_exception_reason`; legacy appointments may lack it. The form requires a reason for a non-Wednesday date.

## Review Focus
- Wednesday itself remains selectable; Friday defaults to the following Wednesday.
- Month, year, and leap-day boundaries must work independently of server timezone.
- Moving back to Wednesday clears an earlier exception reason.
- Completed and overdue appointments must not inflate the next pending session; count children separately from doses.
- The dashboard link must select the session's calendar date, including in another month. No bookings must not imply a confirmed session.

### Task 1: Scheduling helpers and appointment form
- [x] Add failing tests in `frontend/test/clinicScheduling.test.mjs` for Wednesday defaults, boundaries, session grouping, and empty results.
- [x] Implement `nextRegularClinicDate(date?: string): string`, `isRegularClinicDay(date: string): boolean`, and `nextClinicSession(appointments): {date, appointmentCount, childCount} | null` in `frontend/src/utils/clinicScheduling.ts`.
- [x] Extend `Appointment` and `AppointmentDialog`: next Wednesday default, conditional reason field, trimmed persisted reason, clearing on Wednesday, pending-save feedback.

### Task 2: Persist and display exception reasons
- [x] Add API regression cases for reason round-trip, clearing, and invalid input in `backend/test/api.test.js`.
- [x] Extend `backend/src/routes/appointments.js` and `backend/src/lib/validate.js` with optional text field mapping/validation (maximum 500 characters).
- [x] Add nullable text column to `backend/supabase/schema.sql` and the CLI-created additive migration; do not execute SQL.
- [x] Display saved reasons in schedule detail and child profile. Document the migration prerequisite in `docs/clinic-scheduling.md`.

### Task 3: Next session dashboard and verification
- [x] Add a card above charts for the next booked pending date, distinct child count, appointment count, and date-linked schedule button. If empty, show the next regular Wednesday as a suggestion only.
- [x] Read the validated `date` query parameter in `SchedulePage` to select the day/month.
- [x] Run all frontend node tests, backend tests, frontend lint, type-check, build, and diff checks. Attempt visual/interaction verification using a local demo server without reading credentials.
- [x] Request one focused read-only reviewer pass; fix concrete issues and record results here.

## Decision log / verification
- The user authorized implementation in this chat; proceed inline without another approval round.
- Existing appointment-level dates remain the source of truth. A replacement date is set per appointment; this change does not move every booking automatically.
- The new SQL file is prepared only. Applying it requires separate approval for an explicitly identified database.

- Verification: frontend node tests 15/15 passed; backend tests 121 passed, 0 failed, 1 local-Postgres test skipped. Frontend lint, tsc --noEmit, build, and git diff --check passed.
- Focused reviewer found no blocking defects. Regular Wednesday saves omit an absent exception field for compatibility with an unmigrated DB.
- Browser host unavailable; no visual or interaction verification was possible. Render tests verify default date, existing exception value, dashboard/empty state, and calendar date/month navigation. Manual save/clear/error interactions remain a verification limit.
- No database migration applied. No deployment, commit, live SMS, or production access performed.

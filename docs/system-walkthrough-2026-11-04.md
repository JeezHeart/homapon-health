# System walkthrough — 4 November 2026

The health-worker workflow passed in an isolated browser using fictional demo records. No application bug was reproduced, so no application source was changed. A repeatable check was added at `scripts/check-clinic-workflow.cjs`.

## Browser results

All eleven checks passed:

1. Sign in through the demo staff screen.
2. Register and open a fictional child record.
3. Review and save an administered vaccine dose.
4. Verify that the completed dose cannot be selected again.
5. Book an appointment on the default Wednesday.
6. Move the appointment to Thursday, require a reason, and display the saved reason.
7. Preview a reminder, confirm a simulated send, and display the honest demo result.
8. Open the child document and verify that the print button invokes printing.
9. Open reports.
10. Confirm the schedule includes overdue visits.
11. Check that the schedule page fits a 390-pixel mobile screen.

No browser page errors were detected. The print check verifies the action, not the appearance of a physical printout. Reports were opened, not independently reconciled against every total. Duplicate-dose database enforcement is covered by mocked backend tests, not a real database in this run.

## Commands and results

- Backend: `npm.cmd test` — 121 passed, 0 failed, 1 skipped (dedicated local PostgreSQL database not configured).
- Frontend: `node --test test/*.test.mjs` — 15 passed, 0 failed. A Vite WebSocket-port warning appeared during the tests; the tests completed successfully.
- Frontend: `npm.cmd run lint` — passed.
- Frontend: `npx.cmd tsc -b --noEmit` — passed.
- Frontend: `npm.cmd run build` — passed.
- Browser: `node scripts/check-clinic-workflow.cjs <playwright-module-path> <browser-executable-path>` — eleven checks passed using bundled Playwright and headless Brave.

The browser used a separate Vite server on port 5189 with its environment directory set to the temporary directory, preventing the project's service configuration from being loaded. External service requests were blocked. The test browser profile was temporary; the fictional records were held in demo state.

## What remains

Verify real sign-in and persistence against an explicitly authorized test environment, including reloading saved records and server error handling. Check the appointment-reason and SMS-reservation database setup for that environment before using those features. Investigate the earlier SMS uncertainty using its saved state before considering a resend. No production database, migration, deployment, or live SMS was used here.

The separate model study is still not an application prediction feature. This walkthrough establishes demo workflow behavior, not production readiness.

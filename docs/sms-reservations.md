# Live SMS reservation rollout and reconciliation

Live sending remains opt-in. This change does not apply SQL or enable a provider.
No packages, external queue, scheduled retry, or reconciliation endpoint are added.

## Identity and guarantees

The key is SHA-256 of a versioned tuple: child ID, normalized vaccine ID,
dose number, appointment date, and normalized time. The scope excludes date/time.
Duplicate booking IDs, phone/name changes, staff changes, and provider switching
do not create a new reminder. A new dose or genuinely rescheduled date/time can.
The version prefix describes the key format; changing copy/templates must not
bump it or bypass old reservations. Key-format changes need a ledger migration.
An accepted key never expires; this replaces the old same-message/24-hour rule
for new live sends. Accepted means a provider reference was returned, not that
the handset received a message. There is no automatic delivery confirmation.

All instances use the same Postgres ledger. Only a fresh claim can progress
`reserved -> dispatching`, and the dispatch marker must be acknowledged before
the single provider POST. A lost marker response leaves a blocked reservation
without making a provider call. The old process cannot start after a pre-send
release: both transitions check the attempt UUID and current state.

`dispatching` and `unknown` never expire or become retryable automatically.
A network error, HTTP rejection, timeout, invalid JSON, missing reference, or
lost response after dispatch all remain uncertain. A process crash may leave
even an unsent message blocked. This prioritizes preventing duplicates over
eventual delivery. Exactly-once handset delivery is not guaranteed; provider
idempotency would be needed to safely retry an ambiguous submission.

Only `reserved` can become `not_sent`, currently when the local staff quota
rejects the attempt before dispatch. The 10/minute staff quota remains
process-local; multiple instances need a shared quota store separately.

## Local verification before rollout

1. Use an existing isolated local PostgreSQL/Supabase test instance with roles
   `anon`, `authenticated`, and `service_role` (BYPASSRLS). Do not install or
   start services against production as part of tests.
2. Prepare a dedicated database named with the suffix `_sms_test`. Apply
   `backend/supabase/schema.sql` and then
   `backend/supabase/migration-sms-reservations.sql` there. Existing table
   access grants must allow the backend service role to select/insert sms_log.
3. Set `LOCAL_SMS_TEST_DATABASE_URL` to that database on `127.0.0.1`, `::1`, or
   `localhost`, without query-string overrides. The integration test never
   reads `.env` and refuses remote hosts and non-test database names. It needs
   `psql` on PATH and a local administrator connection for fixture setup.
4. Run `npm.cmd test` from `backend/`. Without that variable, the SQL test
   explicitly skips: passing mocked tests is not proof of database locking.
   The SQL suite uses independent psql processes, fictitious rows, and cleans
   up only its own UUIDs; it never drops schemas or truncates tables.
5. Run `node --test test/batchSms.test.mjs`, `npm.cmd run lint`,
   `npx.cmd --no-install tsc -b --noEmit`, and `npm.cmd run build` in `frontend/`.

## Before enabling real sending

- Review and separately authorize the additive migration for the target DB.
  Do not rerun the entire rls.sql file as a migration: it contains legacy staff
  cleanup/linking operations unrelated to this change.
- Confirm table RLS and function grants: browser roles must have no ledger or
  RPC access. RPCs are SECURITY INVOKER and executable only by service_role.
  Confirm PostgREST exposes the functions to the backend service role, and
  refresh its schema cache if required. There is no fallback when RPCs fail.
- Drain/stop every old send-capable backend process before cutover. An older
  route can bypass the reservation. Do not run old and new live senders together.
- Review historical `Sent` rows and any historical ambiguous provider calls.
  They have no appointment/provider-reference metadata and cannot be safely
  backfilled by guessing. The claim RPC conservatively blocks matching recent
  legacy Sent rows for 24 hours. It does not prove older calls never happened.
- Verify provider credentials/sender registration separately. Do not perform a
  live test without explicit approval. Dry-run responses/log-only entries use
  Demo statuses, never reservations, and never claim real delivery.
- Agree who reconciles blocked records and how evidence and retention are
  handled. Ledger IDs are retained snapshots without cascading foreign keys;
  deleting a booking/child must not remove an unresolved duplicate barrier.

## Manual reconciliation

Use a protected administrative session. Inspect only the needed records:

```sql
select reminder_key, attempt_id, state, provider, provider_id, updated_at
from public.sms_send_reservations
where state in ('reserved', 'dispatching', 'unknown');
```

Do not put recipients/messages or credentials in incident logs. Do not clear a
row or reset `dispatching`/`unknown` to test a resend. Age, HTTP failure, and an
apparently absent dashboard entry do not prove non-submission.

- A still-`reserved` attempt can be released with `finish_sms_send` and
  `not_sent`, using its current key/attempt UUID. The state check races safely
  with the dispatch marker; it refuses release if dispatch won.
- A `dispatching` attempt with trustworthy acceptance evidence and a provider
  reference can be finalized with `finish_sms_send(..., 'accepted', reference,
  provider_status)`. This retries DB persistence only, never the provider POST.
- An already-`unknown` attempt requires a human-reviewed DB transaction to lock
  that exact key/attempt, update its existing log and reservation together,
  and record the reconciliation evidence in the audit trail. Do not insert a
  second log for the same attempt. Mark Accepted only with verified provider
  acceptance/reference; keep delivery unconfirmed unless independently proven.
- If the outcome cannot be established, leave it blocked. Switching provider,
  editing the recipient, or moving the date is not a reconciliation strategy.

The API has no automatic unknown-to-accepted/retry transition. Even after a
confirmed acceptance, repeating the same key returns the saved result without
another provider call. A missing/deleted history row remains blocked.

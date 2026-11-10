# SMS reservation production cutover checklist

Prepared 2026-10-28 from the current working tree and `docs/sms-reservations.md`.
This is a proposed procedure, not permission to access production, apply SQL,
deploy, change configuration, or send a message. No production checks below
have been executed. Existing production data, permissions, host, and running
versions remain unverified.

Prior verification: the local PostgreSQL reservation suite passed; the separate
`capstone-sms-staging` project (`soogwdhussrkxoiisscu`) passed nine API checks
with fictional data and no SMS provider call. That verifies the tested code and
staging setup, not the existing project's readiness or handset delivery.

## 1. Decisions required before rollout

- [ ] **Target and access:** identify the exact existing project and authorize a
  separately scoped, read-only review. Confirm the project in the Dashboard;
  `current_database()` is usually `postgres` and does not identify a Supabase
  project. Do not reuse the staging credential or silently load a linked `.env`.
- [ ] **Rollout operator and window:** name the person who can freeze ingress,
  stop every sender, inspect backups, and execute a separately approved migration
  and deployment. Choose an outage window and a verified restore procedure.
- [ ] **Runtime and quota:** choose the API host and enumerate all processes,
  workers, replicas, preview revisions, jobs, and developer machines with live
  provider access. The current 10-attempt/60-second quota is per staff ID **per
  process**, and resets on restart. One process avoids multiplying the quota
  across replicas but does not preserve it across restarts. Decide whether that
  limitation is acceptable; a strict shared/restart-durable quota needs separate
  implementation and verification before live enablement.
- [ ] **Historical reminder policy:** define the period and reminders to review,
  and the explicitly approved first live reminder set. Hold ambiguous legacy
  reminders out of sending. Do not blanket-resend a backlog or infer a new
  appointment identity from old message text. The app has no historical holdlist
  or reconciliation UI; an enforced historical exclusion/backfill policy would
  require a separately reviewed change before enabling live sending.
- [ ] **Reconciliation owner and backup:** name an accountable clinic lead
  (for example, the midwife/admin), a backup, and a technical DB operator with
  provider-account access. Agree a response time, escalation route, evidence
  standard, and retention policy. These are proposed responsibilities; no person
  is assigned by the code.
- [ ] **Provider and release authority:** approve the provider, registered sender,
  permitted recipients/consent process, live-send start time, and the person who
  may enable sending or halt it. Credential possession is not live-send approval.

Do not proceed while any decision or required evidence remains unresolved.

## 2. Historical review: exact read-only checks

After separate access approval, run the SELECTs in a protected administrative
session using this wrapper for each review batch:

```sql
begin read only;
-- Run the applicable SELECTs below.
rollback;
```

Do not call `claim_sms_send`, `begin_sms_dispatch`, or `finish_sms_send` during
read-only inspection: they mutate state. Keep query results in the protected
review; report counts and decisions, not names, phones, message bodies, keys,
or record-level identifiers in chat or public logs. Use bounded execution time
and an approved window for full-history scans; stop and review if they time out.

### H1. Discover schema before selecting optional columns

```sql
select current_database(), current_user, transaction_timestamp() as checked_at;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('sms_log', 'sms_send_reservations', 'staff', 'appointments')
order by table_name, ordinal_position;
```

Check the base `sms_log` fields (`id`, `child_id`, `message`, `sent_at`, `status`,
`created_at`) exist. Establish whether reservation metadata already exists;
do not assume this migration is absent or that an existing object is correct.
Check that `staff.auth_user_id` exists for backend authentication. The SMS
migration does not add that Phase 3 prerequisite.

### H2. Inventory all statuses and recency without exposing message text

This works before the reservation migration:

```sql
select status, count(*) as rows,
       min(created_at) as first_recorded_at,
       max(created_at) as last_recorded_at,
       count(*) filter (
         where created_at >= transaction_timestamp() - interval '24 hours'
       ) as recorded_in_last_24_hours
from public.sms_log
group by status
order by status;

select (created_at at time zone 'Asia/Manila')::date as recorded_day_manila,
       status, count(*) as rows
from public.sms_log
group by recorded_day_manila, status
order by recorded_day_manila desc, status;
```

Review historical `Sent`, `Failed`, unknown spellings, and any unexpected states.
Old `Sent` is not proof of live submission or handset delivery: earlier dry-run
and log-only behavior may be indistinguishable. Old `Failed` or a missing log
also does not prove the provider never received a request. Compare with the old
runtime versions/configuration and provider records in a separate protected,
read-only review; do not send a test message to establish what happened.

### H3. Find repeated child/message groups without returning their contents

```sql
select count(*) as repeated_sent_groups,
       coalesce(sum(group_rows - 1), 0) as additional_sent_rows
from (
  select count(*) as group_rows
  from public.sms_log
  where status = 'Sent'
  group by child_id, message
  having count(*) > 1
) as repeated;
```

These are review candidates, not proof of duplicate delivery: legitimate later
reminders and simulations may share text. A changed name/template can also
evade exact-text grouping. Review all agreed historical periods, not just the
most recent 24 hours.

### H4. Obtain a minimal review queue

```sql
select id, status, sent_at, created_at,
       created_at >= transaction_timestamp() - interval '24 hours'
         as within_recent_guard_window
from public.sms_log
where status not in ('Demo sent', 'Demo failed')
order by created_at desc, id desc
limit 200;
```

This is only the first page. Continue with keyset pagination on
`(created_at, id)` in the protected session until the approved review period is
covered. Record each row's evidence disposition privately. Missing log rows,
timeouts, crashes, and provider submissions not persisted locally must also be
reviewed from incident/deployment/provider evidence. Do not relabel history or
backfill logical reminder keys by guessing from names, phones, or text.

After H1 confirms `attempt_id` exists, this matches the migration's legacy
24-hour candidate filter exactly (the actual claim additionally matches the
specific `child_id` and exact `message`):

```sql
select count(*) as recent_legacy_sent_candidates,
       min(created_at) as earliest_candidate,
       max(created_at) as latest_candidate
from public.sms_log
where status = 'Sent' and attempt_id is null
  and created_at >= transaction_timestamp() - interval '24 hours';
```

The guard uses `created_at`, not `sent_at`, and does not create a permanent
barrier for legacy reminders. Waiting 24 hours, changing text, or finding no
candidate is not authorization to resend a historical reminder.

## 3. Database permissions and migration readiness: read-only checks

Run P1/P2 before migration and repeat after an independently authorized migration.
An absent ledger/functions can be expected before migration, but is a stop
condition before new live senders are enabled. Do not run the whole `schema.sql`,
`rls.sql`, or `seed.sql` as a production upgrade. In particular, `rls.sql` deletes
duplicate staff and changes staff/Auth links (lines 7-16 and 39-44).

### P1. Roles, table RLS, and policies

```sql
select rolname, rolsuper, rolbypassrls
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role')
order by rolname;

select pg_has_role('anon', 'service_role', 'MEMBER') as anon_service_membership,
       pg_has_role('authenticated', 'service_role', 'MEMBER')
         as authenticated_service_membership;

with wanted(table_name) as (values
  ('children'), ('dose_records'), ('appointments'), ('sms_log'),
  ('staff'), ('audit_events'), ('sms_send_reservations')
)
select w.table_name, c.oid is not null as present,
       c.relrowsecurity as rls_enabled, pg_get_userbyid(c.relowner) as owner
from wanted w
left join pg_class c on c.oid = to_regclass('public.' || w.table_name)
order by w.table_name;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('children','dose_records','appointments','sms_log',
                    'staff','audit_events','sms_send_reservations')
order by tablename, policyname;
```

Expected: all three roles exist; `anon`/`authenticated` have neither superuser nor
BYPASSRLS nor service-role membership. `service_role` is not a superuser and has
BYPASSRLS. All existing application tables have RLS enabled. Under the current
backend-only design, no policy may allow direct browser access to operational
records or the ledger. Unexpected policies require review, not an automatic
rerun of `rls.sql`.

### P2. Effective table and schema privileges, checked individually

```sql
select has_schema_privilege('service_role','public','USAGE') as service_usage;

with objects(table_name) as (values ('sms_log'), ('sms_send_reservations')),
roles(role_name) as (values ('anon'), ('authenticated'), ('service_role')),
privileges(privilege) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
  ('REFERENCES'), ('TRIGGER')
)
select o.table_name, r.role_name, p.privilege,
       has_table_privilege(r.role_name::name, c.oid, p.privilege) as allowed
from objects o
join pg_class c on c.oid = to_regclass('public.' || o.table_name)
cross join roles r cross join privileges p
order by o.table_name, r.role_name, p.privilege;
```

Expected: schema USAGE and both SELECT and INSERT on `sms_log` for the backend
role. On the ledger, `service_role` has SELECT/INSERT/UPDATE; no browser-role
table privileges, and no service DELETE/TRUNCATE/REFERENCES/TRIGGER grants.
Base-table browser grants alone are not proof of exposure if RLS denies every
row; evaluate P1 and P2 together. Missing ledger rows in this output mean the
object is absent, not that permissions passed.

### P3. Exact RPC signatures, invoker mode, search path, and grants

```sql
with expected(signature) as (values
 ('public.claim_sms_send(text,text,uuid,uuid,uuid,uuid,text,text,text)'),
 ('public.begin_sms_dispatch(text,uuid)'),
 ('public.finish_sms_send(text,uuid,text,text,text)')
)
select e.signature, p.oid is not null as present,
       not p.prosecdef as security_invoker, p.provolatile, p.proconfig,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       coalesce((select bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE')
         from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
       ), false) as public_execute
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.signature)
order by e.signature;

select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_sms_send','begin_sms_dispatch','finish_sms_send')
order by p.oid::regprocedure::text;
```

Require all three exact signatures, VOLATILE (`provolatile = 'v'`), SECURITY INVOKER, an explicitly empty
`search_path`, service EXECUTE true, and anon/authenticated/PUBLIC EXECUTE false.
The definition query also exposes unexpected overloads. Compare all definitions
with the reviewed migration: the presence of a familiar function name alone is
not proof that the durable claim/dispatch/finalization logic is installed.

### P4. Uniqueness barriers and constraints

```sql
with expected(index_name) as (values
 ('sms_log_attempt_unique'), ('sms_one_unresolved_scope'),
 ('sms_one_unresolved_booking'), ('sms_send_reservations_attempt_id_key'),
 ('sms_send_reservations_pkey')
)
select e.index_name, i.indexrelid is not null as present,
       i.indisunique, i.indisvalid, i.indisready,
       pg_get_indexdef(i.indexrelid) as definition,
       pg_get_expr(i.indpred,i.indrelid) as predicate
from expected e
left join pg_index i on i.indexrelid = to_regclass('public.' || e.index_name)
order by e.index_name;

select conrelid::regclass as table_name, conname, contype,
       convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (to_regclass('public.sms_log'),
                   to_regclass('public.sms_send_reservations'))
order by conrelid::regclass::text, conname;
```

Require valid/ready uniqueness for reminder key, attempt UUIDs, and unresolved
scope/booking. Both partial predicates must include `reserved`, `dispatching`,
and `unknown`. Compare check constraints, nullability, defaults, and column types
against the migration. Equivalent existing names require explicit review; an
`IF NOT EXISTS` migration does not repair a wrong existing definition. Confirm
ledger snapshots do not have cascading child/booking foreign keys.

### P5. Ledger health and unresolved queue (only after H1 confirms the schema)

```sql
select state, count(*) as rows, min(updated_at) as oldest_updated_at,
       count(*) filter (where provider_id is not null) as with_provider_reference
from public.sms_send_reservations
group by state order by state;

select count(*) as inconsistent_finalized_reservations
from public.sms_send_reservations r
left join public.sms_log l on l.id = r.log_id
where r.state in ('accepted','unknown','not_sent') and (
  l.id is null or l.attempt_id is distinct from r.attempt_id
  or l.provider is distinct from r.provider
  or l.provider_id is distinct from r.provider_id
  or l.status is distinct from case r.state
       when 'accepted' then 'Accepted' when 'unknown' then 'Unknown' else 'Not sent' end
  or l.delivery_status is distinct from case r.state
       when 'accepted' then 'unconfirmed' when 'unknown' then 'unknown' else 'not_sent' end
  or (r.state = 'accepted' and nullif(r.provider_id,'') is null)
);

select reminder_key, attempt_id, state, provider, provider_id,
       provider_status, updated_at
from public.sms_send_reservations
where state in ('reserved','dispatching','unknown')
order by updated_at, reminder_key;
```

Review every inconsistency and unresolved attempt. A deleted history row can
leave a valid duplicate barrier; do not delete the ledger to fix that symptom.
Old `not_sent` attempt logs need not match the ledger's current attempt UUID
after a safe new claim. Age is useful for prioritization, never for expiry or
automatic release. Keep the record-level queue restricted to its named owners.

## 4. Freeze, stop old senders, then perform a separately approved cutover

1. **Freeze new requests externally.** Ask staff to finish/stop batches; block
   new `POST /api/sms-log/send` requests at every ingress/origin, including direct
   host and preview URLs. Disable automatic client/proxy/job retries of POSTs.
   A hidden frontend button alone is not a sending boundary. Pause any scheduled
   or manual provider integrations found in the inventory.
2. **Drain and stop all old runtimes.** Observe active send requests/outbound
   work until drained, then stop every old revision, replica, worker, service,
   developer Node process, and manual sender. Disable auto-restart/auto-scale or
   old scheduled jobs that could revive them. The operator must identify the
   actual host/process manager first; no platform-specific stop command is
   prescribed by this repository. For a managed host, stop/scale old revisions
   to zero and disable their jobs; for a process manager or local machine, stop
   the identified service/task/PID and its restart mechanism. Do not kill every
   Node process on the machine.
3. **Prove the freeze.** Record sender IDs/revisions, stop acknowledgements,
   zero active work, blocked direct origins, paused schedules, and the final
   cutoff time in UTC and Asia/Manila. Review actual runtime logs without
   copying messages/phones/keys. Zero database sessions alone is insufficient:
   a sender can be between requests or awaiting its provider response.
4. **Treat interrupted work as uncertain.** The current `index.js` has no
   graceful-drain handler. The current provider timeout is 30 seconds, but this
   is not an end-to-end drain guarantee and may not describe older code. A
   request freezes provider configuration before sending, so changing dry-run
   settings does not cancel in-flight work. Never infer non-submission just
   because a process stopped or a timeout elapsed. Review final historical
   records again after the freeze and reconcile all interrupted attempts.
5. **Back up and apply only the approved additive migration.** With old senders
   stopped and sending blocked, verify the backup/restore point, review schema
   drift and index/lock duration, and obtain separate production migration
   authorization. Apply `migration-sms-reservations.sql` only after prerequisites
   are satisfied. Resolve any failed permission/index/function check before
   serving live traffic. Preserve original history; do not seed production.
6. **Start only the reviewed new revision in dry-run mode.** Keep
   `SEMAPHORE_DRY_RUN=true` for every instance until final approval. This guards
   both providers. Confirm target project, provider selection, build identity,
   allowed origin, auth/staff mapping, secret storage, and worker count without
   printing secret values. Confirm the frontend handles 429/Retry-After and
   partial uncertain results; close/refresh loses the in-dialog resume queue.
7. **Check the API schema without invoking send RPCs.** After separate access
   approval, inspect `GET /rest/v1/` with `Accept: application/openapi+json` using
   server-side credentials and confirm all three `/rpc/...` paths/signatures.
   Check browser-role visibility separately with publishable/user credentials;
   never put a server key into browser tools or a command line. OpenAPI can be
   stale or configured to ignore privileges, so use P1-P4 as well. If the root
   schema is disabled/overridden, record that gap and agree a separate controlled
   API verification procedure; do not probe a mutating RPC in production.
   Also make a read-only `GET /rest/v1/sms_send_reservations?select=reminder_key&limit=0`
   under each browser role. Require a permission-denied/schema-hidden response,
   not HTTP 200 with an empty array. Verify the authenticated test session is
   valid first; an expired-token rejection does not test database permissions.
   Do not create production test accounts for this check without separate approval.
   Cache refresh is a separate administrative change, not a read-only check.
8. **Authorize live enablement separately.** Confirm historical exclusions,
   reconciliation ownership, quota decision, staff training, and all checks
   are signed off. Only then authorize provider configuration/live sending and
   reopen ingress to the approved reminder set. No real test SMS is implied by
   this checklist or the earlier staging approval.

### Halt and rollback rule

For missing/incorrect RPCs, invalid indexes/grants, quota surprises, or unresolved
cutover ambiguity: keep sending blocked, stop live senders, and investigate.
Do not fall back to an older sender that bypasses reservations. Preserve the
ledger, history, and evidence. Never restore a pre-send backup, drop the ledger,
or roll back its state and then resume sending: that can erase duplicate barriers
for messages already submitted. Application rollback is safe only to a version
that keeps the reservation protocol or with real sending disabled.

## 5. Who handles uncertain messages

- **Staff/BHW:** stop the affected batch, report its timestamp/error and protected
  record reference to the named owner, and do not resume an uncertain recipient,
  change the appointment/provider to bypass a block, or call the provider directly.
- **Clinic reconciliation owner + backup:** assess the reminder's operational
  importance and inspect provider acceptance/delivery evidence read-only, using
  only the minimum recipient/message detail in protected tools. Absence from a
  provider dashboard, HTTP failure, `Failed`/`Refunded`, or an old timestamp alone
  is not permission to retry under the current code. Agree an approved manual
  contact/escalation path when the outcome cannot be established.
- **Technical DB operator:** inspect the exact key/attempt. A still-`reserved`
  attempt may be safely released using the state/ownership-checked RPC after a
  reviewed determination; the transition refuses release if dispatch won.
  `dispatching` with verified acceptance/reference may be finalized by retrying
  DB persistence only. An already-`unknown` outcome needs a separately reviewed,
  atomic reconciliation of the existing log and ledger, plus an audit record.
  There is no automatic unknown-to-retry transition or endpoint.
- **Joint sign-off:** link the protected evidence, operator, timestamp, decision,
  and audit reference. Keep acceptance separate from handset delivery. Leave
  an unproven outcome blocked; do not clear/reset it or create a second log to
  make a resend possible. The current provider path has no idempotency token,
  so safe retry after an ambiguous submission and exactly-once handset delivery
  cannot be promised.

## Code evidence and references

- `docs/sms-reservations.md`: identity, rollout prerequisites, reconciliation.
- `backend/src/routes/smsLog.js:133`: dry-run branch; `:145`: durable claim;
  `:156`: staff quota; `:167`: dispatch barrier; `:175`: finalization;
  `:185`: fail-closed 503; `:195`: demo-only log endpoint.
- `backend/src/lib/smsReservations.js:4`: stable logical identity; `:12`: actual
  Supabase RPC path and failure handling.
- `backend/src/lib/sms.js:58`: default dry-run; `:99`: frozen provider config;
  `:113`: timeout; `:132`: accepted-status allowlists; `:143`: uncertain outcome.
- `backend/src/lib/smsRateLimit.js:1`: per-process quota and restart limitation.
- `backend/src/index.js:6`: listener with no shutdown/drain protocol.
- `backend/src/lib/auth.js:21`: staff/Auth linkage prerequisite.
- `backend/supabase/migration-sms-reservations.sql:31`: unresolved uniqueness;
  `:70`: exact legacy guard; `:121`: release restrictions; `:145`: RPC grants.
- `backend/supabase/rls.sql:9`: unrelated staff deletion; `:41`: staff relinking.
- `frontend/src/components/BatchSmsDialog.tsx:174`: uncertain-result handling;
  `frontend/src/utils/batchSms.ts:18`: explicit rate-limit resume boundary.
- PostgreSQL [privilege inquiry functions](https://www.postgresql.org/docs/17/functions-info.html)
  underpin P1-P3; PostgREST [OpenAPI](https://docs.postgrest.org/en/stable/references/api/openapi.html)
  and [schema cache](https://docs.postgrest.org/en/stable/references/schema_cache.html)
  describe the API metadata checks and cache limitation.

Verification for this preparation is repository inspection and document/query
review only. No production queries, permissions checks, provider queries, SQL
migration, deployment, live SMS, or commit were performed for this document.

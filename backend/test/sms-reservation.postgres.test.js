// Requires an explicitly configured, dedicated LOCAL database with schema.sql
// and migration-sms-reservations.sql already applied. Never reads .env.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');

test('Postgres reservation transactions, independent connections, and privileges', {
  skip: !process.env.LOCAL_SMS_TEST_DATABASE_URL && 'No dedicated local Postgres test database configured',
}, async (t) => {
  const url = new URL(process.env.LOCAL_SMS_TEST_DATABASE_URL);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  assert.ok(['127.0.0.1', '::1', 'localhost'].includes(host), 'Remote databases are forbidden');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.search, '', 'Connection overrides are forbidden');
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.match(database, /^[a-zA-Z0-9_]+_sms_test$/, 'Use a dedicated *_sms_test database');
  const connection = {
    ...process.env, PGHOST: host, PGHOSTADDR: host === 'localhost' ? '127.0.0.1' : host,
    PGPORT: url.port || '5432', PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'disable', PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=5000',
  };
  // An empty PGSERVICE still requests a named service in libpq.
  delete connection.PGSERVICE;
  function sql(input, role = 'service_role') {
    return new Promise((resolve, reject) => {
      const proc = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
        env: connection, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      let error = '';
      proc.stdout.on('data', (chunk) => { output += chunk; });
      proc.stderr.on('data', (chunk) => { error += chunk; });
      proc.on('error', reject);
      proc.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
      proc.stdin.end(`${role ? `set role ${role};` : ''}\n${input}`);
    });
  }
  const child = randomUUID();
  const staff = randomUUID();
  const booking = randomUUID();
  const hex = () => randomBytes(32).toString('hex');
  const literal = (s) => `'${String(s).replaceAll("'", "''")}'`;
  const claim = async (key, scope, attempt = randomUUID(), appointment = booking) => JSON.parse(await sql(
    `select public.claim_sms_send('${key}','${scope}','${attempt}','${child}','${appointment}','${staff}',` +
    `'09000000000','Fictional reminder','semaphore');`,
  ));
  const begin = (key, attempt) => sql(`select public.begin_sms_dispatch('${key}','${attempt}');`);
  const finish = async (key, attempt, outcome, reference = null) => JSON.parse(await sql(
    `select public.finish_sms_send('${key}','${attempt}','${outcome}',${reference === null ? 'null' : literal(reference)},null);`,
  ));
  const fixture = `insert into public.children(id,first_name,last_name,birth_date,sex,guardian,guardian_mobile)
    values ('${child}','Fictional','Reservation Test','2026-01-01','Female','Fictional Guardian','09000000000');`;
  assert.equal(await sql("select to_regprocedure('public.begin_sms_dispatch(text,uuid)') is not null;", null), 't', 'Apply the migration locally first');
  await sql(fixture, null);
  try {
    await t.test('only one of 20 independent connections owns a claim', async () => {
      const key = hex(), scope = hex();
      const results = await Promise.all(Array.from({ length: 20 }, () => claim(key, scope)));
      assert.equal(results.filter((r) => r.kind === 'claimed').length, 1);
      assert.equal(results.filter((r) => r.kind === 'blocked').length, 19);
      const owner = results.find((r) => r.kind === 'claimed').reservation;
      const markers = await Promise.all(Array.from({ length: 10 }, () => begin(key, owner.attempt_id)));
      assert.equal(markers.filter((v) => v === 't').length, 1);
      await assert.rejects(finish(key, owner.attempt_id, 'not_sent'), /Unsafe SMS state transition/);
      const entry = await finish(key, owner.attempt_id, 'accepted', 'fictional-provider-reference');
      assert.equal(entry.status, 'Accepted');
      assert.equal(entry.delivery_status, 'unconfirmed');
      assert.equal((await finish(key, owner.attempt_id, 'accepted', 'fictional-provider-reference')).id, entry.id);
      assert.equal((await claim(key, scope)).kind, 'replayed');
      assert.equal(await sql(`select count(*) from public.sms_log where attempt_id='${owner.attempt_id}';`), '1');
      // A later schedule can have a new key, but the accepted key never resets.
      const later = await claim(hex(), scope);
      assert.equal(later.kind, 'claimed');
      await finish(later.reservation.reminder_key, later.reservation.attempt_id, 'not_sent');
    });

    await t.test('unknown outcomes remain blocked across age, sessions and changed schedule', async () => {
      const key = hex(), scope = hex();
      const { reservation: r } = await claim(key, scope);
      await begin(key, r.attempt_id);
      await finish(key, r.attempt_id, 'unknown', 'possible-reference');
      await sql(`update public.sms_send_reservations set updated_at=now()-interval '7 days' where reminder_key='${key}';`, null);
      assert.equal((await claim(key, scope)).state, 'unknown');
      assert.equal((await claim(hex(), scope)).state, 'unknown');
      assert.equal((await claim(hex(), hex())).state, 'unknown', 'Changing the same booking vaccine/dose must not bypass its unresolved attempt');
      await assert.rejects(finish(key, r.attempt_id, 'not_sent'), /Unsafe SMS state transition/);
      // Finish this test's scope manually only by keeping it unknown; later
      // subtests use a different booking so the appointment guard also holds.
    });

    await t.test('pre-dispatch release permits one new owner and rejects stale finalizers', async () => {
      const key = hex(), scope = hex(), appointment = randomUUID();
      const { reservation: first } = await claim(key, scope, randomUUID(), appointment);
      await finish(key, first.attempt_id, 'not_sent');
      const { reservation: second } = await claim(key, scope, randomUUID(), appointment);
      assert.notEqual(first.attempt_id, second.attempt_id);
      await assert.rejects(finish(key, first.attempt_id, 'not_sent'), /ownership mismatch/);
      await finish(key, second.attempt_id, 'not_sent');
    });

    await t.test('failed history insert rolls back finalization and retains dispatch barrier', async () => {
      const key = hex(), scope = hex();
      const { reservation: r } = await claim(key, scope, randomUUID(), randomUUID());
      await begin(key, r.attempt_id);
      await sql(`delete from public.children where id='${child}';`, null);
      await assert.rejects(finish(key, r.attempt_id, 'accepted', 'fictional-reference'), /foreign key/);
      assert.equal((await claim(key, scope, randomUUID(), r.appointment_id)).state, 'dispatching');
      await sql(fixture, null);
      assert.equal((await finish(key, r.attempt_id, 'accepted', 'fictional-reference')).provider_id, 'fictional-reference');
    });

    await t.test('browser roles cannot access ledger or RPCs', async () => {
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(sql('select * from public.sms_send_reservations;', role), /permission denied/);
        await assert.rejects(sql(`select public.begin_sms_dispatch('${hex()}','${randomUUID()}');`, role), /permission denied/);
        await assert.rejects(sql(`select public.claim_sms_send('${hex()}','${hex()}','${randomUUID()}','${child}',
          '${booking}','${staff}','09000000000','Fictional','semaphore');`, role), /permission denied/);
        await assert.rejects(sql(`select public.finish_sms_send('${hex()}','${randomUUID()}','accepted','fictional-reference',null);`, role), /permission denied/);
      }
      assert.equal(await sql("select relrowsecurity from pg_class where oid='public.sms_send_reservations'::regclass;", null), 't');
    });
  } finally {
    // Exact fixture ownership only; never drop schemas or truncate user tables.
    await sql(`delete from public.sms_send_reservations where child_id='${child}';
      delete from public.children where id='${child}';`, null);
  }
});

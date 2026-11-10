// Backend stability tests: malformed input, validation, and simulated
// database/async failures. Uses only node:test + node:http (no extra deps,
// no network sockets required).
//
// Safety: the real Supabase client is replaced with an in-memory fake
// (no network, no production data), live sends are stubbed, and global
// fetch is guarded so any outbound provider call fails the test.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PassThrough } = require('node:stream');
const path = require('node:path');

process.env.SEMAPHORE_DRY_RUN = 'true';
process.env.SMS_PROVIDER = 'semaphore';
delete process.env.UNISMS_SECRET_KEY;
delete process.env.SEMAPHORE_API_KEY;

// ---- Fake Supabase -------------------------------------------------
const STAFF = { id: 'staff-1', name: 'Test Midwife', role: 'midwife' };
const db = {
  calls: [],
  handler: null,
  authUser: { id: 'auth-1' },
  authThrows: null,
  staffResult: null,
  rpcHandler: null,
  rpcCalls: [],
  reset() {
    this.calls = [];
    this.handler = null;
    this.authUser = { id: 'auth-1' };
    this.authThrows = null;
    this.staffResult = null;
    this.rpcHandler = null;
    this.rpcCalls = [];
  },
};

function makeBuilder(table) {
  const ops = [];
  const b = {};
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'gte',
    'order',
    'single',
  ]) {
    b[m] = (...args) => {
      ops.push([m, args]);
      return b;
    };
  }
  // oxlint-disable-next-line unicorn/no-thenable
  b.then = (onOk, onErr) =>
    Promise.resolve()
      .then(() => {
        const q = {
          table,
          ops,
          has: (name) => ops.some(([m]) => m === name),
          arg: (name) => (ops.find(([m]) => m === name) || [])[1],
        };
        db.calls.push(q);
        if (table === 'staff')
          return db.staffResult ?? { data: STAFF, error: null };
        if (!db.handler) throw new Error(`Unexpected query on ${table}`);
        return db.handler(q);
      })
      .then(onOk, onErr);
  return b;
}

const fakeSupabase = {
  async rpc(name, args) {
    db.rpcCalls.push({ name, args });
    if (db.rpcHandler) return db.rpcHandler(name, args);
    if (name === 'claim_sms_send') return { data: {
      kind: 'claimed', reservation: {
        reminder_key: args.p_key, attempt_id: args.p_attempt_id,
        child_id: args.p_child_id, message: args.p_message,
        recipient: args.p_recipient, provider: args.p_provider,
      },
    }, error: null };
    if (name === 'begin_sms_dispatch') return { data: true, error: null };
    if (name === 'finish_sms_send') return { data: {
      id: 'reservation-log', child_id: CHILD_ID, message: 'Fictional', sent_at: '2026-11-01',
      status: args.p_outcome === 'accepted' ? 'Accepted' : args.p_outcome === 'unknown' ? 'Unknown' : 'Not sent',
      provider: 'semaphore', provider_id: args.p_provider_id,
    }, error: null };
    throw new Error('Unexpected RPC');
  },
  auth: {
    async getUser() {
      if (db.authThrows) throw db.authThrows;
      return db.authUser
        ? { data: { user: db.authUser }, error: null }
        : { data: { user: null }, error: { message: 'invalid' } };
    },
  },
  from: (table) => makeBuilder(table),
};

const dbPath = require.resolve(path.join(__dirname, '..', 'src', 'db'));
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { supabase: fakeSupabase },
};

// ---- Outbound network guard -----------------------------------------
let outboundCalls = 0;
globalThis.fetch = (url) => {
  outboundCalls += 1;
  return Promise.reject(new Error(`Blocked outbound call in tests: ${url}`));
};

const sms = require('../src/lib/sms');
const originalSmsConfig = sms.smsConfig;
const originalSendSms = sms.sendSms;
const originalPrepareSmsSend = sms.prepareSmsSend;
let useActualSender = false;
let liveSms = false;
let sendCalls = 0;
let sendResult;
sms.smsConfig = () => ({ ...originalSmsConfig(), dryRun: !liveSms });
sms.sendSms = async (args) => {
  if (!liveSms) return originalSendSms(args);
  sendCalls += 1;
  return sendResult;
};
sms.prepareSmsSend = () => useActualSender ? originalPrepareSmsSend() : ({
  provider: 'semaphore', dryRun: !liveSms,
  send: async (args) => {
    const result = await sms.sendSms(args);
    return { ...result, outcome: result.ok ? 'accepted' : 'unknown' };
  },
});

process.env.CORS_ORIGINS = 'http://localhost:5173';
let app = require('../src/app');

test.beforeEach(() => {
  db.reset();
  outboundCalls = 0;
  liveSms = false;
  useActualSender = false;
  sendCalls = 0;
  sendResult = { ok: true, dryRun: false, provider: 'stub', providerId: 'test-id' };
});

test.afterEach(() => {
  assert.equal(outboundCalls, 0, 'tests must never call an SMS provider');
});

function api(method, url, body, { token = 'good-token', raw, headers } = {}) {
  return new Promise((resolve) => {
    const socket = new PassThrough();
    socket.remoteAddress = '127.0.0.1';
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { ...headers };
    if (token && req.headers.authorization === undefined)
      req.headers.authorization = `Bearer ${token}`;
    const payload =
      raw !== undefined
        ? Buffer.from(raw, 'utf8')
        : body !== undefined
          ? Buffer.from(JSON.stringify(body), 'utf8')
          : null;
    if (payload !== null) {
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = String(payload.length);
    }

    const res = new http.ServerResponse(req);
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    res.write = (chunk, encoding, cb) => {
      if (chunk)
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
        );
      return origWrite(chunk, encoding, cb);
    };
    res.end = (chunk, encoding, cb) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
        );
      }
      origEnd(chunk, encoding, cb);
      const rawOut = Buffer.concat(chunks).toString('utf8');
      const sep = rawOut.indexOf('\r\n\r\n');
      const text = sep !== -1 ? rawOut.slice(sep + 4) : rawOut;
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON response */
      }
      resolve({ status: res.statusCode, json, text, headers: res.getHeaders() });
    };

    app(req, res);
    process.nextTick(() => {
      if (payload !== null) req.push(payload);
      req.push(null);
    });
  });
}

function assertSafeError(r, status) {
  assert.equal(
    r.status,
    status,
    `expected ${status}, got ${r.status}: ${r.text.slice(0, 200)}`,
  );
  assert.ok(r.json, `expected JSON body, got: ${r.text.slice(0, 200)}`);
  assert.equal(r.json.ok, false);
  assert.equal(typeof r.json.error, 'string');
  assert.doesNotMatch(r.text, /\bat .+\.js:\d+/, 'stack trace leaked');
}

const CHILD_ID = '11111111-1111-1111-1111-111111111111';
const APPT_ID = '22222222-2222-2222-2222-222222222222';
const VALID_CHILD = {
  firstName: 'Ana',
  lastName: 'Santos',
  birthDate: '2025-01-15',
  sex: 'Female',
  guardian: 'Maria Santos',
  guardianMobile: '09171234567',
  purok: 'Purok 1',
};
const CHILD_ROW = {
  id: CHILD_ID,
  first_name: 'Ana',
  last_name: 'Santos',
  birth_date: '2025-01-15',
  sex: 'Female',
  guardian: 'Maria Santos',
  guardian_mobile: '09171234567',
  purok: 'Purok 1',
  weight_kg: null,
  notes: null,
};
function futureISO(days = 7) {
  const d = new Date(Date.now() + days * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Live SMS rate limit (sender is always stubbed) ------------------
const SEND_BODY = { childId: CHILD_ID, appointmentId: APPT_ID };
function liveSendingAs(id) {
  liveSms = true;
  db.staffResult = { data: { ...STAFF, id }, error: null };
  db.handler = smsHandler();
}

test('live SMS permits 10 attempts then returns 429 with CORS and Retry-After', async () => {
  liveSendingAs('limit-staff');
  for (let i = 0; i < 10; i++)
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  const inserts = db.calls.filter((q) => q.table === 'sms_log' && q.has('insert')).length;
  const r = await api('POST', '/api/sms-log/send', SEND_BODY, {
    headers: { origin: 'http://localhost:5173' },
  });
  assertSafeError(r, 429);
  assert.ok(Number(r.headers['retry-after']) >= 1);
  assert.ok(Number(r.headers['retry-after']) <= 60);
  assert.equal(r.headers['access-control-expose-headers'], 'Retry-After');
  assert.equal(r.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(sendCalls, 10);
  assert.equal(db.calls.filter((q) => q.table === 'sms_log' && q.has('insert')).length, inserts);
  assert.equal(outboundCalls, 0);
});

test('live SMS uses a rolling window and frees only expired attempts', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  liveSendingAs('expiry-staff');
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  now += 30000;
  for (let i = 0; i < 9; i++)
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  now = 159999;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 429);
  now = 160000;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  const r = await api('POST', '/api/sms-log/send', SEND_BODY);
  assert.equal(r.status, 429);
  assert.equal(r.headers['retry-after'], '30');
});

test('live SMS keeps staff quotas separate but token and forwarded IP changes do not reset them', async () => {
  liveSendingAs('identity-staff');
  for (let i = 0; i < 10; i++)
    await api('POST', '/api/sms-log/send', SEND_BODY);
  const r = await api('POST', '/api/sms-log/send', SEND_BODY, {
    token: 'refreshed-token', headers: { 'x-forwarded-for': '192.0.2.10' },
  });
  assert.equal(r.status, 429);
  db.staffResult = { data: { ...STAFF, id: 'another-staff' }, error: null };
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  assert.equal(sendCalls, 11);
});

test('concurrent live SMS requests cannot exceed the staff quota', async () => {
  liveSendingAs('concurrent-staff');
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    api('POST', '/api/sms-log/send', SEND_BODY)));
  assert.equal(results.filter((r) => r.status === 201).length, 10);
  assert.equal(results.filter((r) => r.status === 429).length, 10);
  assert.equal(sendCalls, 10);
});

test('failed provider attempts still consume the live SMS quota', async () => {
  liveSendingAs('failure-staff');
  sendResult = { ok: false, dryRun: false, error: 'Stub provider unavailable' };
  for (let i = 0; i < 10; i++)
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 502);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 429);
  assert.equal(sendCalls, 10);
});

test('dry-run, log-only, reads and Authorization preflight do not consume live quota', async () => {
  liveSendingAs('excluded-staff');
  liveSms = false;
  for (let i = 0; i < 11; i++) {
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
    assert.equal((await api('POST', '/api/sms-log', {
      childId: CHILD_ID, message: 'Demo reminder', status: 'Demo sent',
    })).status, 201);
  }
  db.handler = () => ({ data: [], error: null });
  for (let i = 0; i < 11; i++)
    assert.equal((await api('GET', '/api/sms-log')).status, 200);
  const preflight = await api('OPTIONS', '/api/sms-log/send', undefined, {
    token: null, headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-headers'], /authorization/);
  liveSms = true;
  db.handler = smsHandler();
  for (let i = 0; i < 10; i++)
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 429);
  assert.equal(sendCalls, 10);
  assert.equal(outboundCalls, 0);
});

test('invalid, unauthorized and duplicate requests do not consume live quota', async () => {
  liveSendingAs('validation-staff');
  for (let i = 0; i < 11; i++) {
    assert.equal((await api('POST', '/api/sms-log/send', {})).status, 400);
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY, { token: null })).status, 401);
  }
  db.staffResult = { data: null, error: { code: 'PGRST116' } };
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 403);
  liveSendingAs('validation-staff');
  db.rpcHandler = async () => ({ data: { kind: 'blocked', state: 'legacy' } });
  for (let i = 0; i < 11; i++)
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
  db.handler = smsHandler();
  db.rpcHandler = null;
  for (let i = 0; i < 10; i++)
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 429);
});

// Stateful DB double exercises route orchestration, NOT PostgreSQL locking.
// The separate loopback-only Postgres suite verifies the SQL itself.
function persistentLedger({ failBegin = false, failFinish = false } = {}) {
  const rows = new Map();
  return { rows, rpc: async (name, p) => {
    if (name === 'claim_sms_send') {
      const unresolved = [...rows.values()].find((r) => r.scope_key === p.p_scope && ['reserved', 'dispatching', 'unknown'].includes(r.state));
      if (unresolved) return { data: { kind: 'blocked', state: unresolved.state } };
      const old = rows.get(p.p_key);
      if (old?.state === 'accepted') return { data: { kind: 'replayed', entry: old.entry, provider: old.provider, providerId: old.provider_id } };
      const r = { reminder_key: p.p_key, scope_key: p.p_scope, attempt_id: p.p_attempt_id,
        child_id: p.p_child_id, recipient: p.p_recipient, message: p.p_message, provider: p.p_provider, state: 'reserved' };
      rows.set(p.p_key, r);
      return { data: { kind: 'claimed', reservation: { ...r } } };
    }
    const r = rows.get(p.p_key);
    assert.equal(r.attempt_id, p.p_attempt_id, 'ownership must match');
    if (name === 'begin_sms_dispatch') {
      assert.equal(r.state, 'reserved');
      r.state = 'dispatching';
      if (failBegin) throw new Error('Dispatch marker response lost');
      return { data: true };
    }
    if (failFinish) return { error: { message: 'Simulated persistence failure' } };
    assert.equal(r.state, p.p_outcome === 'not_sent' ? 'reserved' : 'dispatching');
    r.state = p.p_outcome;
    r.provider_id = p.p_provider_id;
    r.entry = { id: r.attempt_id, child_id: r.child_id, message: r.message, sent_at: '2026-11-01',
      status: r.state === 'accepted' ? 'Accepted' : r.state === 'unknown' ? 'Unknown' : 'Not sent' };
    return { data: r.entry };
  } };
}

test('durable reservation allows only one concurrent provider submission', async () => {
  liveSendingAs('durable-race');
  const ledger = persistentLedger();
  db.rpcHandler = ledger.rpc;
  let complete;
  sendResult = new Promise((resolve) => { complete = resolve; });
  const requests = Array.from({ length: 20 }, () => api('POST', '/api/sms-log/send', SEND_BODY));
  await new Promise(setImmediate);
  complete({ ok: true, providerId: 'accepted-reference' });
  const results = await Promise.all(requests);
  assert.equal(sendCalls, 1);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 19);
  assert.equal(results.find((r) => r.status === 201).json.entry.status, 'Accepted');
});

test('lost dispatch marker response blocks submission across route reload/restart', async () => {
  liveSendingAs('durable-crash');
  const ledger = persistentLedger({ failBegin: true });
  db.rpcHandler = ledger.rpc;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 503);
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/smsLog')];
  app = require('../src/app');
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
  assert.equal(sendCalls, 0);
  assert.equal([...ledger.rows.values()][0].state, 'dispatching');
});

test('post-provider persistence failure remains blocked and never re-submits', async () => {
  liveSendingAs('durable-finalize');
  db.rpcHandler = persistentLedger({ failFinish: true }).rpc;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 503);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
  assert.equal(sendCalls, 1);
});

test('uncertain delivery blocks even a rescheduled reminder; acceptance replays without sending', async () => {
  liveSendingAs('durable-unknown');
  const ledger = persistentLedger();
  db.rpcHandler = ledger.rpc;
  sendResult = { ok: false, error: 'Unknown provider outcome' };
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 502);
  const baseHandler = smsHandler();
  db.handler = (q) => q.table === 'appointments'
    ? { data: { ...APPT_ROW, scheduled_date: futureISO(30) } } : baseHandler(q);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
  assert.equal(sendCalls, 1);
  assert.equal([...ledger.rows.values()][0].state, 'unknown');
});

test('accepted logical reminder replays across restarts; new schedule can send', async () => {
  liveSendingAs('durable-replay');
  db.rpcHandler = persistentLedger().rpc;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/smsLog')];
  app = require('../src/app');
  const replay = await api('POST', '/api/sms-log/send', SEND_BODY);
  assert.equal(replay.status, 200);
  assert.equal(replay.json.replayed, true);
  assert.equal(sendCalls, 1);
  const baseHandler = smsHandler();
  db.handler = (q) => q.table === 'appointments'
    ? { data: { ...APPT_ROW, scheduled_date: futureISO(30) } } : baseHandler(q);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  assert.equal(sendCalls, 2);
});

for (const status of ['Failed', 'Refunded']) {
  test(`Semaphore ${status} response retains reference and blocks a second submission`, async (t) => {
    liveSendingAs(`semaphore-status-${status}`);
    useActualSender = true;
    process.env.SEMAPHORE_DRY_RUN = 'false';
    process.env.SEMAPHORE_API_KEY = 'fictional-test-key';
    t.after(() => {
      process.env.SEMAPHORE_DRY_RUN = 'true';
      delete process.env.SEMAPHORE_API_KEY;
    });
    const ledger = persistentLedger();
    db.rpcHandler = ledger.rpc;
    let providerCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      providerCalls++;
      return Response.json([{ message_id: 123, status }]);
    });
    const first = await api('POST', '/api/sms-log/send', SEND_BODY);
    assert.equal(first.status, 502);
    assert.equal(first.json.code, 'SMS_OUTCOME_UNKNOWN');
    assert.equal(first.json.entry.status, 'Unknown');
    assert.equal([...ledger.rows.values()][0].state, 'unknown');
    const finish = db.rpcCalls.find((r) => r.name === 'finish_sms_send');
    assert.equal(finish.args.p_outcome, 'unknown');
    assert.equal(finish.args.p_provider_id, '123');
    assert.equal(finish.args.p_provider_status, status);
    assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
    assert.equal(providerCalls, 1);
  });
}

test('dry-run and log-only entries never reserve or claim delivery', async () => {
  db.handler = smsHandler();
  const dry = await api('POST', '/api/sms-log/send', SEND_BODY);
  assert.equal(dry.status, 201);
  assert.equal(dry.json.entry.status, 'Demo sent');
  assert.equal(dry.json.entry.deliveryStatus, 'demo');
  await api('POST', '/api/sms-log', { childId: CHILD_ID, message: 'Fictional', status: 'Demo sent' });
  assert.equal(db.rpcCalls.length, 0);
  assert.equal(sendCalls, 0);
});

test('quota rejection releases only the pre-dispatch reservation for a later retry', async (t) => {
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  liveSendingAs('durable-quota-release');
  for (let i = 0; i < 10; i++) await api('POST', '/api/sms-log/send', SEND_BODY);
  const ledger = persistentLedger();
  db.rpcHandler = ledger.rpc;
  const rejected = await api('POST', '/api/sms-log/send', SEND_BODY);
  assert.equal(rejected.status, 429);
  assert.equal([...ledger.rows.values()][0].state, 'not_sent');
  assert.equal(sendCalls, 10);
  now += 60000;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 201);
  assert.equal(sendCalls, 11);
  assert.equal([...ledger.rows.values()][0].state, 'accepted');
});

test('failed quota-release persistence stays blocked without a provider call', async (t) => {
  let now = 2000000;
  t.mock.method(Date, 'now', () => now);
  liveSendingAs('durable-quota-failure');
  for (let i = 0; i < 10; i++) await api('POST', '/api/sms-log/send', SEND_BODY);
  const ledger = persistentLedger({ failFinish: true });
  db.rpcHandler = ledger.rpc;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 503);
  assert.equal([...ledger.rows.values()][0].state, 'reserved');
  now += 60000;
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
  assert.equal(sendCalls, 10);
});

test('a dispatch marker explicitly denied by the database never calls the sender', async () => {
  liveSendingAs('durable-marker-denied');
  const ledger = persistentLedger();
  db.rpcHandler = (name, args) => name === 'begin_sms_dispatch'
    ? { data: false } : ledger.rpc(name, args);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 503);
  assert.equal(sendCalls, 0);
});

test('claim acknowledgement lost after commit leaves a durable pre-send block', async () => {
  liveSendingAs('durable-lost-claim');
  const ledger = persistentLedger();
  let lost = false;
  db.rpcHandler = async (name, args) => {
    const response = await ledger.rpc(name, args);
    if (name === 'claim_sms_send' && !lost) {
      lost = true;
      throw new Error('Claim acknowledgement lost');
    }
    return response;
  };
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 503);
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 409);
  assert.equal(sendCalls, 0);
});

test('finalization acknowledgement lost after commit replays acceptance without a second POST', async () => {
  liveSendingAs('durable-lost-finalization');
  const ledger = persistentLedger();
  let lost = false;
  db.rpcHandler = async (name, args) => {
    const response = await ledger.rpc(name, args);
    if (name === 'finish_sms_send' && !lost) {
      lost = true;
      throw new Error('Finalization acknowledgement lost');
    }
    return response;
  };
  assert.equal((await api('POST', '/api/sms-log/send', SEND_BODY)).status, 503);
  const replay = await api('POST', '/api/sms-log/send', SEND_BODY);
  assert.equal(replay.status, 200);
  assert.equal(replay.json.replayed, true);
  assert.equal(sendCalls, 1);
});

// ---- Framework-level ------------------------------------------------
test('malformed JSON returns 400 JSON without a stack trace', async () => {
  const r = await api('POST', '/api/children', undefined, {
    raw: '{"firstName": ',
  });
  assertSafeError(r, 400);
});

test('oversized body returns 413 JSON', async () => {
  const r = await api('POST', '/api/children', {
    notes: 'x'.repeat(300 * 1024),
  });
  assertSafeError(r, 413);
});

test('unknown route still returns 404 JSON', async () => {
  const r = await api('GET', '/api/nope');
  assertSafeError(r, 404);
});

test('missing token still returns 401', async () => {
  const r = await api('GET', '/api/children', undefined, { token: null });
  assertSafeError(r, 401);
});

// ---- Auth middleware ------------------------------------------------
test('auth provider throwing returns 500 and server stays up', async () => {
  db.authThrows = new Error('network down');
  const r = await api('GET', '/api/children');
  assertSafeError(r, 500);
  const health = await api('GET', '/api/health', undefined, { token: null });
  assert.equal(health.status, 200);
});

test('staff lookup DB error returns 500, not a misleading 403', async () => {
  db.staffResult = {
    data: null,
    error: { code: '08006', message: 'connection failure' },
  };
  const r = await api('GET', '/api/me');
  assertSafeError(r, 500);
});

test('account without staff row still returns 403', async () => {
  db.staffResult = {
    data: null,
    error: { code: 'PGRST116', message: 'no rows' },
  };
  const r = await api('GET', '/api/me');
  assertSafeError(r, 403);
});

test('valid session still resolves /api/me', async () => {
  const r = await api('GET', '/api/me');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, {
    ok: true,
    user: { name: 'Test Midwife', role: 'midwife' },
  });
});

// ---- Children -------------------------------------------------------
test('POST /children valid request still returns 201', async () => {
  db.handler = (q) => {
    assert.ok(q.has('insert'));
    return { data: CHILD_ROW, error: null };
  };
  const r = await api('POST', '/api/children', VALID_CHILD);
  assert.equal(r.status, 201);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.child.id, CHILD_ID);
  assert.equal(r.json.child.firstName, 'Ana');
});

test('POST /children non-string purok returns 400 (no crash)', async () => {
  db.handler = () => ({ data: CHILD_ROW, error: null });
  const r = await api('POST', '/api/children', { ...VALID_CHILD, purok: 123 });
  assertSafeError(r, 400);
});

test('PUT /children non-string firstName returns 400 (no crash)', async () => {
  db.handler = () => ({ data: CHILD_ROW, error: null });
  const r = await api('PUT', `/api/children/${CHILD_ID}`, { firstName: 42 });
  assertSafeError(r, 400);
});

test('POST /children boolean weight returns 400', async () => {
  db.handler = () => ({ data: CHILD_ROW, error: null });
  const r = await api('POST', '/api/children', {
    ...VALID_CHILD,
    weightKg: true,
  });
  assertSafeError(r, 400);
});

test('POST /children DB error returns generic 500 without DB details', async () => {
  db.handler = () => ({
    data: null,
    error: {
      code: 'XX000',
      message: 'secret internal relation "children" detail',
    },
  });
  const r = await api('POST', '/api/children', VALID_CHILD);
  assertSafeError(r, 500);
  assert.doesNotMatch(r.json.error, /secret internal/);
});

test('GET /children rejected DB promise returns 500 and server stays up', async () => {
  db.handler = () => Promise.reject(new Error('socket hang up'));
  const r = await api('GET', '/api/children');
  assertSafeError(r, 500);
  const health = await api('GET', '/api/health', undefined, { token: null });
  assert.equal(health.status, 200);
});

test('PUT /children with a non-UUID id returns 404 without querying', async () => {
  db.handler = () => ({
    data: null,
    error: { code: '22P02', message: 'invalid input syntax for type uuid' },
  });
  const r = await api('PUT', '/api/children/not-a-uuid', { firstName: 'Ana' });
  assertSafeError(r, 404);
  assert.equal(db.calls.filter((q) => q.table === 'children').length, 0);
});

// ---- Dose records ---------------------------------------------------
const VALID_DOSE = {
  childId: CHILD_ID,
  vaccineId: 'bcg',
  doseNumber: 1,
  dateAdministered: '2025-01-16',
  healthWorker: 'Nurse Joy',
};

test('POST /dose-records non-string remarks returns 400 (no crash)', async () => {
  db.handler = (q) =>
    q.has('insert') ? { data: {}, error: null } : { count: 0, error: null };
  const r = await api('POST', '/api/dose-records', {
    ...VALID_DOSE,
    remarks: 5,
  });
  assertSafeError(r, 400);
});

test('POST /dose-records impossible calendar date returns 400', async () => {
  db.handler = (q) =>
    q.has('insert') ? { data: {}, error: null } : { count: 0, error: null };
  const r = await api('POST', '/api/dose-records', {
    ...VALID_DOSE,
    dateAdministered: '2025-02-30',
  });
  assertSafeError(r, 400);
});

test('POST /dose-records duplicate still returns 409', async () => {
  db.handler = () => ({ count: 1, error: null });
  const r = await api('POST', '/api/dose-records', VALID_DOSE);
  assertSafeError(r, 409);
});

test('POST /dose-records unknown child (FK violation) returns 400 without DB details', async () => {
  db.handler = (q) =>
    q.has('insert')
      ? {
          data: null,
          error: {
            code: '23503',
            message:
              'violates foreign key constraint "dose_records_child_id_fkey"',
          },
        }
      : { count: 0, error: null };
  const r = await api('POST', '/api/dose-records', VALID_DOSE);
  assertSafeError(r, 400);
  assert.doesNotMatch(r.json.error, /constraint/);
});

// ---- Appointments ---------------------------------------------------
const VALID_APPT = {
  childId: CHILD_ID,
  vaccineId: 'penta',
  doseNumber: 2,
  scheduledDate: futureISO(),
};

test('POST /appointments malformed time returns 400', async () => {
  db.handler = () => ({ data: {}, error: null });
  const r = await api('POST', '/api/appointments', {
    ...VALID_APPT,
    scheduledTime: 'banana',
  });
  assertSafeError(r, 400);
});

test('POST /appointments valid request with time still returns 201', async () => {
  db.handler = (q) => {
    const row = q.arg('insert')[0];
    return { data: { id: APPT_ID, ...row }, error: null };
  };
  const r = await api('POST', '/api/appointments', {
    ...VALID_APPT,
    scheduledTime: '09:30',
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.appointment.id, APPT_ID);
  assert.equal(r.json.appointment.scheduledTime, '09:30');
});

test('POST /appointments past date still returns 422', async () => {
  db.handler = () => ({ data: {}, error: null });
  const r = await api('POST', '/api/appointments', {
    ...VALID_APPT,
    scheduledDate: '2020-01-01',
  });
  assertSafeError(r, 422);
});

test('POST /appointments invalid follow-up date returns 400', async () => {
  db.handler = () => ({ data: {}, error: null });
  const r = await api('POST', '/api/appointments', {
    ...VALID_APPT,
    followUpDate: 'soon',
  });
  assertSafeError(r, 400);
});

test('GET /appointments with a non-UUID childId filter returns 400', async () => {
  db.handler = () => ({ data: [], error: null });
  const r = await api('GET', '/api/appointments?childId=abc');
  assertSafeError(r, 400);
});

test('GET /appointments with a valid childId filter still works', async () => {
  db.handler = () => ({ data: [], error: null });
  const r = await api('GET', `/api/appointments?childId=${CHILD_ID}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, appointments: [] });
});

// ---- SMS send -------------------------------------------------------
test('appointment API persists and returns the staff-entered exception reason', async () => {
  db.handler = (q) => ({ data: { id: APPT_ID, ...q.arg('insert')[0] }, error: null });
  const r = await api('POST', '/api/appointments', {
    ...VALID_APPT, scheduleExceptionReason: '  Wednesday holiday; moved to Thursday.  ',
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.appointment.scheduleExceptionReason, 'Wednesday holiday; moved to Thursday.');
  assert.equal(db.calls.find((q) => q.table === 'appointments').arg('insert')[0].schedule_exception_reason,
    'Wednesday holiday; moved to Thursday.');
});

test('appointment API can clear a previous exception reason when rescheduled', async () => {
  db.handler = (q) => ({ data: {
    id: APPT_ID, child_id: CHILD_ID, vaccine_id: 'penta', dose_number: 2,
    scheduled_date: futureISO(), schedule_exception_reason: 'Holiday',
    ...(q.has('update') ? q.arg('update')[0] : {}),
  }, error: null });
  const r = await api('PUT', `/api/appointments/${APPT_ID}`, { scheduleExceptionReason: '' });
  assert.equal(r.status, 200);
  assert.equal(db.calls.find((q) => q.has('update')).arg('update')[0].schedule_exception_reason, null);
  assert.equal(r.json.appointment.scheduleExceptionReason, undefined);
});

test('appointment API rejects non-text and overlong exception reasons before writing', async () => {
  for (const reason of [42, {}, 'x'.repeat(501)]) {
    const r = await api('POST', '/api/appointments', { ...VALID_APPT, scheduleExceptionReason: reason });
    assertSafeError(r, 400);
  }
  assert.equal(db.calls.filter((q) => q.table === 'appointments').length, 0);
});

const APPT_ROW = {
  id: APPT_ID,
  child_id: CHILD_ID,
  vaccine_id: 'penta',
  dose_number: 2,
  scheduled_date: futureISO(),
  scheduled_time: '09:00',
};

function smsHandler(overrides = {}) {
  return (q) => {
    if (q.table === 'children')
      return overrides.child ?? { data: CHILD_ROW, error: null };
    if (q.table === 'appointments') return { data: APPT_ROW, error: null };
    if (q.table === 'sms_log' && q.has('insert'))
      return (
        overrides.insert ?? {
          data: {
            id: 'log-1',
            child_id: CHILD_ID,
            message: 'm',
            sent_at: '2025-01-01',
            status: q.arg('insert')[0].status,
          },
          error: null,
        }
      );
    if (q.table === 'sms_log')
      return overrides.count ?? { count: 0, error: null };
    if (q.table === 'audit_events') return { data: null, error: null };
    throw new Error(`unexpected ${q.table}`);
  };
}

test('POST /sms-log/send dry-run still returns 201 with no outbound call', async () => {
  db.handler = smsHandler();
  const r = await api('POST', '/api/sms-log/send', {
    childId: CHILD_ID,
    appointmentId: APPT_ID,
  });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.provider.dryRun, true);
  assert.equal(outboundCalls, 0);
});

test('POST /sms-log/send non-string childId returns 400', async () => {
  db.handler = smsHandler();
  const r = await api('POST', '/api/sms-log/send', {
    childId: { $ne: null },
    appointmentId: APPT_ID,
  });
  assertSafeError(r, 400);
});

test('POST /sms-log/send child lookup DB error returns 500, not 404', async () => {
  db.handler = smsHandler({
    child: {
      data: null,
      error: { code: '08006', message: 'connection failure' },
    },
  });
  const r = await api('POST', '/api/sms-log/send', {
    childId: CHILD_ID,
    appointmentId: APPT_ID,
  });
  assertSafeError(r, 500);
});

test('POST /sms-log/send aborts when the reservation claim fails (no send, no log)', async () => {
  liveSendingAs('claim-failure');
  db.rpcHandler = async () => ({ error: { code: '08006', message: 'connection failure' } });
  const r = await api('POST', '/api/sms-log/send', {
    childId: CHILD_ID,
    appointmentId: APPT_ID,
  });
  assertSafeError(r, 503);
  assert.equal(
    db.calls.filter((q) => q.table === 'sms_log' && q.has('insert')).length,
    0,
  );
  assert.equal(outboundCalls, 0);
});

test('POST /sms-log/send log write failure returns 500 and server stays up', async () => {
  db.handler = smsHandler({
    insert: { data: null, error: { code: 'XX000', message: 'disk full' } },
  });
  const r = await api('POST', '/api/sms-log/send', {
    childId: CHILD_ID,
    appointmentId: APPT_ID,
  });
  assertSafeError(r, 500);
  assert.doesNotMatch(r.json.error, /disk full/);
  const health = await api('GET', '/api/health', undefined, { token: null });
  assert.equal(health.status, 200);
});

test('non-object JSON array body returns 400 across POST/PUT endpoints', async () => {
  for (const [m, url] of [
    ['POST', '/api/children'],
    ['PUT', `/api/children/${CHILD_ID}`],
    ['POST', '/api/dose-records'],
    ['PUT', `/api/dose-records/${CHILD_ID}`],
    ['POST', '/api/appointments'],
    ['PUT', `/api/appointments/${APPT_ID}`],
    ['POST', '/api/sms-log'],
    ['POST', '/api/sms-log/send'],
  ]) {
    const r = await api(m, url, [1, 2, 3]);
    assertSafeError(r, 400);
  }
});

test('empty update object on PUT returns 400', async () => {
  db.handler = (q) => {
    if (q.table === 'dose_records')
      return {
        data: {
          id: CHILD_ID,
          child_id: CHILD_ID,
          vaccine_id: 'bcg',
          dose_number: 1,
          date_administered: '2025-01-16',
          health_worker: 'Nurse Joy',
        },
        error: null,
      };
    if (q.table === 'appointments') return { data: APPT_ROW, error: null };
    return { count: 0, error: null };
  };
  for (const url of [
    `/api/children/${CHILD_ID}`,
    `/api/dose-records/${CHILD_ID}`,
    `/api/appointments/${APPT_ID}`,
  ]) {
    const r = await api('PUT', url, {});
    assertSafeError(r, 400);
  }
});

test('PUT lookup DB failure returns 500 instead of 404 on dose-records and appointments', async () => {
  db.handler = () => ({
    data: null,
    error: { code: '08006', message: 'connection failure' },
  });
  const r1 = await api('PUT', `/api/dose-records/${CHILD_ID}`, {
    remarks: 'updated',
  });
  assertSafeError(r1, 500);
  const r2 = await api('PUT', `/api/appointments/${APPT_ID}`, {
    followUpNotes: 'updated',
  });
  assertSafeError(r2, 500);
});

test('DELETE with non-UUID id returns 404 without querying DB', async () => {
  for (const url of [
    '/api/children/bad-id',
    '/api/dose-records/bad-id',
    '/api/appointments/bad-id',
  ]) {
    const r = await api('DELETE', url);
    assertSafeError(r, 404);
  }
  assert.equal(
    db.calls.filter((q) => q.table !== 'staff').length,
    0,
  );
});

test('GET /dose-records and /sms-log reject non-UUID childId query param with 400', async () => {
  const r1 = await api('GET', '/api/dose-records?childId=not-a-uuid');
  assertSafeError(r1, 400);
  const r2 = await api('GET', '/api/sms-log?childId=not-a-uuid');
  assertSafeError(r2, 400);
});

test('POST /sms-log valid request returns 201 and FK error returns 400', async () => {
  db.handler = (q) =>
    q.table === 'sms_log'
      ? {
          data: {
            id: 'log-9',
            child_id: CHILD_ID,
            message: 'Hello',
            sent_at: '2025-01-16',
            status: 'Demo sent',
          },
          error: null,
        }
      : { data: null, error: null };
  const ok = await api('POST', '/api/sms-log', {
    childId: CHILD_ID,
    message: 'Hello',
    status: 'Demo sent',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.ok, true);

  db.handler = () => ({
    data: null,
    error: {
      code: '23503',
      message: 'violates foreign key constraint "sms_log_child_id_fkey"',
    },
  });
  const fk = await api('POST', '/api/sms-log', {
    childId: CHILD_ID,
    message: 'Hello',
    status: 'Demo sent',
  });
  assertSafeError(fk, 400);
  assert.doesNotMatch(fk.json.error, /constraint/);
});

test('rejected audit_events write never fails a successful request', async () => {
  db.handler = (q) => {
    if (q.table === 'audit_events')
      return Promise.reject(new Error('audit table unreachable'));
    return { data: CHILD_ROW, error: null };
  };
  const r = await api('POST', '/api/children', VALID_CHILD);
  assert.equal(r.status, 201);
  assert.equal(r.json.ok, true);
});

// ---- Role-based authorization (Task 5) ------------------------------
const BHW_STAFF = { id: 'staff-bhw', name: 'Test BHW', role: 'bhw' };
const DOSE_ID = '33333333-3333-3333-3333-333333333333';

test('unauthenticated DELETE on children and dose-records returns 401 without querying DB', async () => {
  const r1 = await api('DELETE', `/api/children/${CHILD_ID}`, undefined, {
    token: null,
  });
  assertSafeError(r1, 401);

  const r2 = await api('DELETE', `/api/dose-records/${DOSE_ID}`, undefined, {
    token: null,
  });
  assertSafeError(r2, 401);
  assert.equal(db.calls.length, 0);
});

test('BHW cannot delete children or completed dose records (403 Midwife access only)', async () => {
  db.staffResult = { data: BHW_STAFF, error: null };

  const delChild = await api('DELETE', `/api/children/${CHILD_ID}`);
  assertSafeError(delChild, 403);
  assert.equal(delChild.json.error, 'Midwife access only.');

  const delDose = await api('DELETE', `/api/dose-records/${DOSE_ID}`);
  assertSafeError(delDose, 403);
  assert.equal(delDose.json.error, 'Midwife access only.');

  // Neither delete query nor audit write should have been issued.
  assert.equal(
    db.calls.filter((q) => q.table !== 'staff').length,
    0,
  );
});

test('Midwife can delete children and completed dose records (200)', async () => {
  // Default STAFF is role: 'midwife'.
  db.handler = (q) => {
    if (q.table === 'audit_events') return { data: null, error: null };
    if (q.table === 'children' && q.has('delete'))
      return { error: null, count: 1 };
    if (q.table === 'dose_records' && q.has('delete'))
      return { error: null, count: 1 };
    return { data: null, error: null };
  };

  const delChild = await api('DELETE', `/api/children/${CHILD_ID}`);
  assert.equal(delChild.status, 200);
  assert.equal(delChild.json.ok, true);

  const delDose = await api('DELETE', `/api/dose-records/${DOSE_ID}`);
  assert.equal(delDose.status, 200);
  assert.equal(delDose.json.ok, true);
});

test('BHW retains permitted day-to-day CRUD on children, dose-records, appointments (including delete), and sms-log', async () => {
  db.staffResult = { data: BHW_STAFF, error: null };
  const schedDate = futureISO(7);
  const doseRow = {
    id: DOSE_ID,
    child_id: CHILD_ID,
    vaccine_id: 'bcg',
    dose_number: 1,
    date_administered: '2025-01-16',
    health_worker: 'Test BHW',
    batch_lot: null,
    remarks: null,
  };
  const apptRow = {
    id: APPT_ID,
    child_id: CHILD_ID,
    vaccine_id: 'penta',
    dose_number: 1,
    scheduled_date: schedDate,
    scheduled_time: '09:00',
    follow_up_status: null,
    follow_up_notes: null,
    follow_up_date: null,
  };

  db.handler = (q) => {
    if (q.table === 'audit_events') return { data: null, error: null };
    if (q.table === 'children') {
      if (q.has('insert') || q.has('update'))
        return { data: CHILD_ROW, error: null };
      return { data: [CHILD_ROW], error: null };
    }
    if (q.table === 'dose_records') {
      if (q.has('insert') || q.has('update'))
        return { data: doseRow, error: null };
      if (q.has('single')) return { data: doseRow, error: null };
      return { data: [doseRow], count: 0, error: null };
    }
    if (q.table === 'appointments') {
      if (q.has('delete')) return { error: null, count: 1 };
      if (q.has('insert') || q.has('update') || q.has('single'))
        return { data: apptRow, error: null };
      return { data: [apptRow], error: null };
    }
    if (q.table === 'sms_log') {
      if (q.has('insert'))
        return {
          data: {
            id: 'log-bhw',
            child_id: CHILD_ID,
            message: 'Reminder',
            sent_at: '2025-01-16',
            status: 'Demo sent',
          },
          error: null,
        };
      return { data: [], error: null };
    }
    return { data: null, error: null };
  };

  // Children: GET, POST, PUT
  assert.equal((await api('GET', '/api/children')).status, 200);
  assert.equal((await api('POST', '/api/children', VALID_CHILD)).status, 201);
  assert.equal(
    (await api('PUT', `/api/children/${CHILD_ID}`, { purok: 'Purok 2' }))
      .status,
    200,
  );

  // Dose records: GET, POST, PUT
  assert.equal((await api('GET', '/api/dose-records')).status, 200);
  assert.equal(
    (
      await api('POST', '/api/dose-records', {
        childId: CHILD_ID,
        vaccineId: 'bcg',
        doseNumber: 1,
        dateAdministered: '2025-01-16',
        healthWorker: 'Test BHW',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api('PUT', `/api/dose-records/${DOSE_ID}`, {
        remarks: 'Checked by BHW',
      })
    ).status,
    200,
  );

  // Appointments: GET, POST, PUT, DELETE
  assert.equal((await api('GET', '/api/appointments')).status, 200);
  assert.equal(
    (
      await api('POST', '/api/appointments', {
        childId: CHILD_ID,
        vaccineId: 'penta',
        doseNumber: 1,
        scheduledDate: schedDate,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api('PUT', `/api/appointments/${APPT_ID}`, {
        followUpStatus: 'Confirmed',
      })
    ).status,
    200,
  );
  assert.equal(
    (await api('DELETE', `/api/appointments/${APPT_ID}`)).status,
    200,
  );

  // SMS log: GET, POST
  assert.equal((await api('GET', '/api/sms-log')).status, 200);
  assert.equal(
    (
      await api('POST', '/api/sms-log', {
        childId: CHILD_ID,
        message: 'Reminder',
        status: 'Demo sent',
      })
    ).status,
    201,
  );
});

// ---- Dose record identity immutability (Task 6) ---------------------
const EXISTING_DOSE_ROW = {
  id: DOSE_ID,
  child_id: CHILD_ID,
  vaccine_id: 'bcg',
  dose_number: 1,
  date_administered: '2025-01-16',
  health_worker: 'Nurse Joy',
  batch_lot: 'LOT-1',
  remarks: 'Initial remark',
};

test('PUT /dose-records/:id rejects attempts to change childId, vaccineId, or doseNumber with 400', async () => {
  db.handler = (q) => {
    if (q.table === 'dose_records' && q.has('single') && !q.has('update'))
      return { data: EXISTING_DOSE_ROW, error: null };
    throw new Error('update should not be called when identity fields change');
  };

  const otherChildId = '44444444-4444-4444-4444-444444444444';
  for (const body of [
    { childId: otherChildId, remarks: 'Reassign child' },
    { vaccineId: 'opv', remarks: 'Reassign vaccine' },
    { doseNumber: 2, remarks: 'Reassign dose number' },
    { childId: 123, remarks: 'Malformed childId type' },
    { vaccineId: null, remarks: 'Null vaccineId' },
    { doseNumber: '1', remarks: 'String doseNumber' },
  ]) {
    const r = await api('PUT', `/api/dose-records/${DOSE_ID}`, body);
    assertSafeError(r, 400);
    assert.match(
      r.json.error,
      /Child, vaccine, and dose number cannot be changed/i,
    );
  }
});

test('PUT /dose-records/:id permits valid corrections and strips identity fields from DB update payload', async () => {
  let lastUpdatePayload = null;
  db.handler = (q) => {
    if (q.table === 'audit_events') return { data: null, error: null };
    if (q.table === 'dose_records') {
      if (q.has('update')) {
        lastUpdatePayload = q.arg('update')[0];
        return {
          data: {
            ...EXISTING_DOSE_ROW,
            ...lastUpdatePayload,
          },
          error: null,
        };
      }
      return { data: EXISTING_DOSE_ROW, error: null };
    }
    return { data: null, error: null };
  };

  // 1. CorrectionForm shape (only correction fields sent)
  const r1 = await api('PUT', `/api/dose-records/${DOSE_ID}`, {
    dateAdministered: '2025-01-17',
    healthWorker: 'Midwife Ana',
    batchLot: 'LOT-2',
    remarks: 'Corrected entry',
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.ok, true);
  assert.deepEqual(lastUpdatePayload, {
    date_administered: '2025-01-17',
    health_worker: 'Midwife Ana',
    batch_lot: 'LOT-2',
    remarks: 'Corrected entry',
  });

  // 2. ImmunizationDocument shape (unchanged identity fields echoed alongside correction fields)
  lastUpdatePayload = null;
  const r2 = await api('PUT', `/api/dose-records/${DOSE_ID}`, {
    childId: CHILD_ID,
    vaccineId: 'bcg',
    doseNumber: 1,
    dateAdministered: '2025-01-18',
    healthWorker: 'Midwife Ana',
    batchLot: '',
    remarks: '',
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.ok, true);
  assert.deepEqual(lastUpdatePayload, {
    date_administered: '2025-01-18',
    health_worker: 'Midwife Ana',
    batch_lot: null,
    remarks: null,
  });
});

test('PUT /dose-records/:id rejects malformed correction fields and identity-only payloads with 400', async () => {
  db.handler = (q) => {
    if (q.table === 'dose_records' && !q.has('update'))
      return { data: EXISTING_DOSE_ROW, error: null };
    throw new Error('update should not be called on invalid correction');
  };

  for (const body of [
    { dateAdministered: '2999-01-01' },
    { dateAdministered: '2025-02-30' },
    { healthWorker: '   ' },
    { batchLot: 999 },
    { remarks: ['not-a-string'] },
    { childId: CHILD_ID, vaccineId: 'bcg', doseNumber: 1 },
  ]) {
    const r = await api('PUT', `/api/dose-records/${DOSE_ID}`, body);
    assertSafeError(r, 400);
  }
});

// ---- Client SMS log status restrictions (Task 7) --------------------
test('POST /sms-log accepts Demo sent and Demo failed when valid', async () => {
  const insertedStatuses = [];
  db.handler = (q) => {
    if (q.table === 'audit_events') return { data: null, error: null };
    if (q.table === 'sms_log' && q.has('insert')) {
      const row = q.arg('insert')[0];
      insertedStatuses.push(row.status);
      return {
        data: { id: `log-${insertedStatuses.length}`, ...row },
        error: null,
      };
    }
    return { data: null, error: null };
  };

  for (const status of ['Demo sent', 'Demo failed']) {
    const r = await api('POST', '/api/sms-log', {
      childId: CHILD_ID,
      message: 'Simulated reminder',
      status,
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.entry.status, status);
  }
  assert.deepEqual(insertedStatuses, ['Demo sent', 'Demo failed']);
});

test('POST /sms-log rejects Sent, Failed, alternate casing, unknown statuses, and invalid types with 400', async () => {
  db.handler = () => {
    throw new Error('sms_log insert should not be called on invalid status');
  };

  for (const status of [
    'Sent',
    'Failed',
    'sent',
    'failed',
    'demo sent',
    'DEMO SENT',
    'Demo Sent',
    'DEMO FAILED',
    'Delivered',
    'Pending',
    '',
    '   ',
    123,
    null,
    true,
    ['Demo sent'],
    { status: 'Demo sent' },
  ]) {
    const r = await api('POST', '/api/sms-log', {
      childId: CHILD_ID,
      message: 'Attempted log',
      status,
    });
    assertSafeError(r, 400);
  }

  // Malformed sentAt or message also rejected with 400
  for (const badBody of [
    {
      childId: CHILD_ID,
      message: 'Reminder',
      status: 'Demo sent',
      sentAt: 'not-a-date',
    },
    {
      childId: CHILD_ID,
      message: 'Reminder',
      status: 'Demo sent',
      sentAt: null,
    },
    { childId: CHILD_ID, message: '   ', status: 'Demo sent' },
  ]) {
    const r = await api('POST', '/api/sms-log', badBody);
    assertSafeError(r, 400);
  }
});

test('legacy duplicate guard blocks live sends but never affects dry-run logging', async () => {
  const schedDate = futureISO(5);
  let duplicateCount = 1;
  db.handler = (q) => {
    if (q.table === 'audit_events') return { data: null, error: null };
    if (q.table === 'children') return { data: CHILD_ROW, error: null };
    if (q.table === 'appointments')
      return {
        data: {
          id: APPT_ID,
          child_id: CHILD_ID,
          vaccine_id: 'bcg',
          dose_number: 1,
          scheduled_date: schedDate,
          scheduled_time: '08:30',
        },
        error: null,
      };
    if (q.table === 'sms_log') {
      if (q.has('insert')) {
        const row = q.arg('insert')[0];
        return { data: { id: 'send-log-1', ...row }, error: null };
      }
      return { count: duplicateCount, error: null };
    }
    return { data: null, error: null };
  };

  liveSms = true;
  db.rpcHandler = async () => ({ data: { kind: 'blocked', state: 'legacy' } });

  // 1. Duplicate guard returns 409 when a recent Sent entry exists
  const dup = await api('POST', '/api/sms-log/send', {
    childId: CHILD_ID,
    appointmentId: APPT_ID,
  });
  assertSafeError(dup, 409);

  // 2. Dry-run skips the reservation/legacy guard and is clearly simulated.
  liveSms = false;
  duplicateCount = 0;
  const sent = await api('POST', '/api/sms-log/send', {
    childId: CHILD_ID,
    appointmentId: APPT_ID,
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.ok, true);
  assert.equal(sent.json.entry.status, 'Demo sent');
});

// ---- Extended direct-API authorization tests ------------------------
test('invalid or expired Bearer token returns 401 across protected routes without querying DB', async () => {
  db.authUser = null;
  db.handler = () => {
    throw new Error('DB should not be queried when token verification fails');
  };

  for (const [method, url, body] of [
    ['GET', '/api/me'],
    ['GET', '/api/children'],
    ['POST', '/api/children', VALID_CHILD],
    ['DELETE', `/api/children/${CHILD_ID}`],
    ['PUT', `/api/dose-records/${DOSE_ID}`, { remarks: 'Updated' }],
    ['DELETE', `/api/dose-records/${DOSE_ID}`],
    [
      'POST',
      '/api/appointments',
      {
        childId: CHILD_ID,
        vaccineId: 'bcg',
        doseNumber: 1,
        scheduledDate: futureISO(5),
      },
    ],
    [
      'POST',
      '/api/sms-log/send',
      { childId: CHILD_ID, appointmentId: APPT_ID },
    ],
  ]) {
    const r = await api(method, url, body, { token: 'expired-or-bad-token' });
    assertSafeError(r, 401);
    assert.equal(r.json.error, 'Session expired. Please sign in again.');
  }

  assert.equal(db.calls.length, 0);
});

test('malformed Authorization headers return 401 without querying DB', async () => {
  db.handler = () => {
    throw new Error('DB should not be queried on malformed Authorization');
  };

  for (const authorization of [
    'Basic dXNlcjpwYXNz',
    'Token secret-token',
    'bearer lowercase-scheme',
    'Bearer',
    'Bearer    ',
    '',
  ]) {
    const r = await api('POST', '/api/children', VALID_CHILD, {
      token: null,
      headers: { authorization },
    });
    assertSafeError(r, 401);
    assert.equal(r.json.error, 'Sign in required.');
  }

  assert.equal(db.calls.length, 0);
});

test('authenticated user without a staff row receives 403 across operational GET and mutation routes without querying operational tables', async () => {
  db.staffResult = {
    data: null,
    error: { code: 'PGRST116', message: 'no rows' },
  };
  db.handler = (q) => {
    throw new Error(`Unexpected operational query on ${q.table}`);
  };

  const schedDate = futureISO(7);
  for (const [method, url, body] of [
    ['GET', '/api/children'],
    ['POST', '/api/children', VALID_CHILD],
    ['PUT', `/api/children/${CHILD_ID}`, { purok: 'Purok 3' }],
    ['DELETE', `/api/children/${CHILD_ID}`],
    ['GET', '/api/dose-records'],
    [
      'POST',
      '/api/dose-records',
      {
        childId: CHILD_ID,
        vaccineId: 'bcg',
        doseNumber: 1,
        dateAdministered: '2025-01-16',
        healthWorker: 'Nurse Joy',
      },
    ],
    ['PUT', `/api/dose-records/${DOSE_ID}`, { remarks: 'Attempted edit' }],
    ['DELETE', `/api/dose-records/${DOSE_ID}`],
    ['GET', '/api/appointments'],
    [
      'POST',
      '/api/appointments',
      {
        childId: CHILD_ID,
        vaccineId: 'penta',
        doseNumber: 1,
        scheduledDate: schedDate,
      },
    ],
    ['PUT', `/api/appointments/${APPT_ID}`, { followUpStatus: 'Confirmed' }],
    ['DELETE', `/api/appointments/${APPT_ID}`],
    ['GET', '/api/sms-log'],
    [
      'POST',
      '/api/sms-log',
      { childId: CHILD_ID, message: 'Hello', status: 'Demo sent' },
    ],
    [
      'POST',
      '/api/sms-log/send',
      { childId: CHILD_ID, appointmentId: APPT_ID },
    ],
  ]) {
    const r = await api(method, url, body);
    assertSafeError(r, 403);
    assert.equal(r.json.error, 'No staff role assigned to this account.');
  }

  assert.equal(
    db.calls.filter((q) => q.table !== 'staff').length,
    0,
  );
});

test('BHW cannot escalate privileges by spoofing midwife role in request body or headers', async () => {
  db.staffResult = { data: BHW_STAFF, error: null };
  db.handler = (q) => {
    throw new Error(`Unexpected operational or audit query on ${q.table}`);
  };

  const spoofHeaders = {
    'x-role': 'midwife',
    'x-staff-role': 'midwife',
    'x-user-role': 'midwife',
  };
  const spoofBody = {
    role: 'midwife',
    staff: { id: 'staff-1', name: 'Spoofed Midwife', role: 'midwife' },
  };

  const me = await api('GET', '/api/me', undefined, { headers: spoofHeaders });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.role, 'bhw');

  const delChild = await api('DELETE', `/api/children/${CHILD_ID}`, spoofBody, {
    headers: spoofHeaders,
  });
  assertSafeError(delChild, 403);
  assert.equal(delChild.json.error, 'Midwife access only.');

  const delDose = await api(
    'DELETE',
    `/api/dose-records/${DOSE_ID}`,
    spoofBody,
    { headers: spoofHeaders },
  );
  assertSafeError(delDose, 403);
  assert.equal(delDose.json.error, 'Midwife access only.');

  assert.equal(
    db.calls.filter((q) => q.table !== 'staff').length,
    0,
  );
});



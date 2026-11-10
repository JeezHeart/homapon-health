import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

// Load the real TypeScript modules without reading local credentials.
process.env.VITE_API_URL = 'https://mock-api.invalid/api';
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, watch: null },
});
const { api } = await server.ssrLoadModule('/src/data/api.ts');
const originalFetch = globalThis.fetch;
test.after(async () => {
  globalThis.fetch = originalFetch;
  await server.close();
});

let calls;
let responses;
test.beforeEach(() => {
  calls = [];
  responses = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://mock-api.invalid/api/sms-log/send');
    calls.push(JSON.parse(init.body).appointmentId);
    const response = responses.shift();
    assert.ok(response, 'unexpected request (possible automatic retry)');
    if (response instanceof Error) throw response;
    return response;
  };
});
const success = () => Response.json({
  ok: true,
  entry: { id: 'fictional-log', childId: 'fictional-child', message: 'Fictional reminder',
    sentAt: '2026-11-01', status: 'Accepted', providerId: 'fictional-reference', deliveryStatus: 'unconfirmed' },
  provider: { name: 'semaphore', dryRun: false, providerId: 'fictional-reference' },
});
const limited = (retryAfter) => Response.json(
  { ok: false, error: 'Too many SMS attempts.' },
  { status: 429, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } },
);
const send = (id) => api.sendSms('fictional-child', id);

test('API retains 429 status and numeric Retry-After as a deadline', async () => {
  responses = [limited('17')];
  const before = Date.now();
  await assert.rejects(send('a'), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.retryAfter, '17');
    assert.ok(error.retryAt >= before + 17000);
    assert.ok(error.retryAt <= Date.now() + 17000);
    return true;
  });
});

test('API supports HTTP-date Retry-After and conservatively defaults missing or invalid values', async () => {
  const date = new Date(Date.now() + 120000).toUTCString();
  responses = [limited(date), limited(null), limited('invalid')];
  await assert.rejects(send('a'), (error) => {
    assert.equal(error.retryAt, Date.parse(date));
    return true;
  });
  for (const id of ['b', 'c']) {
    const before = Date.now();
    await assert.rejects(send(id), (error) => {
      assert.ok(error.retryAt >= before + 60000);
      return true;
    });
  }
});

test('batch stops on 429 and resumes only the remaining reminders', async () => {
  const { sendBatch } = await server.ssrLoadModule('/src/utils/batchSms.ts');
  responses = [success(), success(), limited('1'), success(), success()];
  const progress = [];
  const paused = await sendBatch(['a', 'b', 'c', 'd'], 0, send, (n) => progress.push(n));
  assert.equal(paused.status, 'rate-limited');
  assert.equal(paused.succeeded, 2);
  assert.deepEqual(calls, ['a', 'b', 'c']);
  const done = await sendBatch(['a', 'b', 'c', 'd'], paused.succeeded, send, (n) => progress.push(n));
  assert.equal(done.status, 'completed');
  assert.equal(done.succeeded, 4);
  assert.deepEqual(calls, ['a', 'b', 'c', 'c', 'd']);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

for (const [name, failure] of [
  ['network failure', () => new TypeError('Connection lost')],
  ['provider failure', () => Response.json({ ok: false, error: 'Provider error' }, { status: 502 })],
  ['unreadable success response', () => new Response('invalid JSON', { status: 201 })],
]) {
  test(`batch stops after ${name} and reports partial progress without retrying`, async () => {
    const { sendBatch } = await server.ssrLoadModule('/src/utils/batchSms.ts');
    responses = [success(), failure(), success()];
    const result = await sendBatch(['a', 'b', 'c'], 0, send, () => {});
    assert.equal(result.status, 'uncertain');
    assert.equal(result.succeeded, 1);
    assert.deepEqual(calls, ['a', 'b']);
  });
}

test('multiple quota pauses preserve cumulative successes', async () => {
  const { sendBatch } = await server.ssrLoadModule('/src/utils/batchSms.ts');
  responses = [success(), limited('1'), success(), limited('1'), success()];
  let result = await sendBatch(['a', 'b', 'c'], 0, send, () => {});
  result = await sendBatch(['a', 'b', 'c'], result.succeeded, send, () => {});
  assert.equal(result.succeeded, 2);
  assert.equal(result.status, 'rate-limited');
  result = await sendBatch(['a', 'b', 'c'], result.succeeded, send, () => {});
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['a', 'b', 'b', 'c', 'c']);
});

test('SMS status labels never equate provider acceptance or demo logging with delivery', async () => {
  const { smsDeliveryLabel } = await server.ssrLoadModule('/src/data/mockData.ts');
  const entry = { id: 'fictional-log', childId: 'fictional-child', message: 'Fictional reminder', sentAt: '2026-11-01', status: 'Accepted' };
  assert.match(smsDeliveryLabel(entry), /handset delivery unconfirmed/);
  assert.match(smsDeliveryLabel({ ...entry, status: 'Demo sent' }), /no real SMS sent/);
  assert.match(smsDeliveryLabel({ ...entry, status: 'Unknown' }), /manual reconciliation/);
});

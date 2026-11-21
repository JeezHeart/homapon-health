const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSmsSend } = require('../src/lib/sms');

test.beforeEach(() => {
  process.env.SMS_DRY_RUN = 'false';
  process.env.IPROG_API_TOKEN = 'fictional-test-token';
  process.env.SMS_PROVIDER = 'iprog';
  delete process.env.IPROG_SMS_PROVIDER;
});

test('iProg SMS POST uses JSON encoding and preserves special characters in all fields', async (t) => {
  const message = 'Fictional reminder: A&B + cafe = 10%';
  let calls = 0;
  let request;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    request = { url, ...init };
    return Response.json({ status: 200, message_id: 'iProg-123', message: 'SMS queued' });
  });
  const result = await prepareSmsSend().send({ to: '09000000000', message });
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.provider, 'iprog');
  assert.equal(result.providerId, 'iProg-123');
  assert.equal(request.url, 'https://sms.iprogtech.com/api/v1/sms_messages');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.equal(request.headers.Accept, 'application/json');
  assert.deepEqual(JSON.parse(request.body), {
    api_token: 'fictional-test-token',
    phone_number: '09000000000',
    message,
  });
  assert.equal(request.redirect, 'error');
  assert.ok(request.signal);
  assert.equal(calls, 1);
});

for (const status of ['Failed', 'Refunded', 'failed', ' REFUNDED ', 'error', 'Unexpected', 500, null, undefined, '']) {
  test(`iProg SMS status ${JSON.stringify(status)} with HTTP 200/reference is not accepted`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return Response.json({ message_id: 'iProg-123', status });
    });
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.dispatched, true);
    assert.equal(result.providerId, 'iProg-123');
    assert.equal(result.providerStatus, typeof status === 'number' ? String(status) : (typeof status === 'string' ? status : null));
    assert.match(result.error, /reconciliation/);
    assert.equal(calls, 1);
  });
}

for (const status of [200, '200', 'success', 'Queued', 'Pending', 'Sent', ' pending ']) {
  test(`iProg SMS ${String(status)} with reference is accepted but delivery remains unconfirmed`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ message_id: 'iProg-123', status }));
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.provider, 'iprog');
    assert.equal(result.providerId, 'iProg-123');
    assert.equal(result.deliveryStatus, 'unconfirmed');
  });
}

test('iProg SMS nested data object response with id and queued status is accepted', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    status: 'success',
    data: { id: 14285, status: 'queued' },
  }, { status: 201 }));
  const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.providerId, '14285');
  assert.equal(result.deliveryStatus, 'unconfirmed');
});

test('iprog: dry-run cannot dispatch', async (t) => {
  process.env.SMS_DRY_RUN = 'true';
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not dispatch'); });
  const prepared = prepareSmsSend();
  const result = await prepared.send({ to: '09000000000', message: 'Fictional reminder' });
  assert.equal(result.outcome, 'demo');
  assert.equal(result.dispatched, false);
});

test('iprog: references mean acceptance, not confirmed handset delivery', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 200, message_id: 'iProg-123' }, { status: 201 }));
  const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.dispatched, true);
  assert.equal(result.providerId, 'iProg-123');
  assert.equal(result.deliveryStatus, 'unconfirmed');
});

for (const [name, response] of [
  ['timeout', () => { throw new Error('timeout containing sensitive provider detail'); }],
  ['provider rejection', () => Response.json({ status: 'error', message: 'Rejected' }, { status: 422 })],
  ['missing reference', () => Response.json({ status: 200 }, { status: 201 })],
  ['malformed response', () => new Response('not JSON', { status: 201 })],
]) {
  test(`iprog: ${name} stays uncertain and is never retried`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(calls, 1);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.dispatched, true);
    assert.doesNotMatch(result.error, /sensitive provider detail/);
  });
}

test('missing credentials fail before dispatch', () => {
  delete process.env.IPROG_API_TOKEN;
  delete process.env.IPROG_API_KEY;
  const prepared = prepareSmsSend();
  assert.ok(prepared.error);
  assert.equal(prepared.send, undefined);
});

test('prepared sender freezes provider configuration before reservation/dispatch', async (t) => {
  const prepared = prepareSmsSend();
  process.env.SMS_DRY_RUN = 'true';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://sms.iprogtech.com/api/v1/sms_messages');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    return Response.json({ status: 200, message_id: 'iProg-123' });
  });
  assert.equal((await prepared.send({ to: '09000000000', message: 'Fictional' })).outcome, 'accepted');
});

for (const message of ['x'.repeat(161), 'x'.repeat(159) + '^', 'Fictional \u{1f600}']) {
  test('provider guard rejects oversized or unsupported SMS without dispatch', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Provider must not be called'); });
    const result = await prepareSmsSend('iprog').send({ to: '09000000000', message });
    assert.equal(result.outcome, 'not_sent');
    assert.equal(result.dispatched, false);
    assert.equal(globalThis.fetch.mock.calls.length, 0);
  });
}

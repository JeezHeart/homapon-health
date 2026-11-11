const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSmsSend } = require('../src/lib/sms');

test.beforeEach(() => {
  process.env.SEMAPHORE_DRY_RUN = 'false';
  process.env.SEMAPHORE_API_KEY = 'fictional-test-key';
  process.env.UNISMS_SECRET_KEY = 'fictional-test-key';
  process.env.SEMAPHORE_SENDER_NAME = 'Fictional HC';
});

test('Semaphore POST uses form encoding and preserves special characters in all fields', async (t) => {
  process.env.SMS_PROVIDER = 'semaphore';
  const message = 'Fictional reminder: A&B + café = 10%';
  let calls = 0;
  let request;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    request = { url, ...init };
    return Response.json([{ message_id: 123, status: 'Queued' }]);
  });
  assert.equal((await prepareSmsSend().send({ to: '09000000000', message })).outcome, 'accepted');
  assert.equal(request.url, 'https://api.semaphore.co/api/v4/messages');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(typeof request.body, 'string');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.body)), {
    apikey: 'fictional-test-key', number: '09000000000', message, sendername: 'Fictional HC',
  });
  assert.equal(request.redirect, 'error');
  assert.ok(request.signal);
  assert.equal(calls, 1);
});

for (const status of ['Failed', 'Refunded', 'failed', ' REFUNDED ', 'Unexpected', null]) {
  test(`Semaphore status ${String(status)} with HTTP 200/reference is not accepted`, async (t) => {
    process.env.SMS_PROVIDER = 'semaphore';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return Response.json([{ message_id: 123, status }]);
    });
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.dispatched, true);
    assert.equal(result.providerId, '123');
    assert.equal(result.providerStatus, status);
    assert.match(result.error, /reconciliation/);
    assert.equal(calls, 1);
  });
}

for (const status of ['Queued', 'Pending', 'Sent', ' pending ']) {
  test(`Semaphore ${status} with reference is accepted but delivery remains unconfirmed`, async (t) => {
    process.env.SMS_PROVIDER = 'semaphore';
    t.mock.method(globalThis, 'fetch', async () => Response.json([{ message_id: 123, status }]));
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.deliveryStatus, 'unconfirmed');
  });
}

for (const status of ['pending', 'retrying', 'sent', ' SENT ']) {
  test(`UniSMS documented non-failure status ${status} is accepted with unconfirmed delivery`, async (t) => {
    process.env.SMS_PROVIDER = 'unisms';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return Response.json({ message: { reference_id: 'fictional-reference', status } }, { status: 201 });
    });
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.providerId, 'fictional-reference');
    assert.equal(result.providerStatus, status);
    assert.equal(result.deliveryStatus, 'unconfirmed');
    assert.equal(calls, 1, 'provider retrying status must not cause an application retry');
  });
}

for (const status of [undefined, null, '', '  ', 'queued', 'delivered', 'Unexpected', 'failed', 'refunded', 42, { value: 'pending' }]) {
  test(`UniSMS status ${JSON.stringify(status)} remains unknown with reference for reconciliation`, async (t) => {
    process.env.SMS_PROVIDER = 'unisms';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return Response.json({ message: { reference_id: 'fictional-reference', status } }, { status: 201 });
    });
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.dispatched, true);
    assert.equal(result.providerId, 'fictional-reference');
    assert.equal(result.providerStatus, typeof status === 'string' ? status : null);
    assert.match(result.error, /reconciliation/);
    assert.equal(calls, 1);
  });
}

test('UniSMS retains its JSON request format', async (t) => {
  process.env.SMS_PROVIDER = 'unisms';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://unismsapi.com/api/sms');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(JSON.parse(init.body).content, 'Fictional reminder');
    assert.equal(JSON.parse(init.body).recipient, '+639000000000');
    return Response.json({ message: { reference_id: 'fictional-reference', status: 'pending' } }, { status: 201 });
  });
  assert.equal((await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' })).outcome, 'accepted');
});

for (const provider of ['semaphore', 'unisms']) {
  test(`${provider}: dry-run cannot dispatch`, async (t) => {
    process.env.SMS_PROVIDER = provider;
    process.env.SEMAPHORE_DRY_RUN = 'true';
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not dispatch'); });
    const prepared = prepareSmsSend();
    const result = await prepared.send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.outcome, 'demo');
    assert.equal(result.dispatched, false);
  });

  test(`${provider}: references mean acceptance, not confirmed handset delivery`, async (t) => {
    process.env.SMS_PROVIDER = provider;
    const body = provider === 'semaphore'
      ? [{ message_id: 123, status: 'Queued' }]
      : { message: { reference_id: 'fictional-reference', status: 'pending' } };
    t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status: 201 }));
    const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.dispatched, true);
    assert.ok(result.providerId);
    assert.equal(result.deliveryStatus, 'unconfirmed');
  });

  for (const [name, response] of [
    ['timeout', () => { throw new Error('timeout containing sensitive provider detail'); }],
    ['provider rejection', () => Response.json({ error: 'Rejected' }, { status: 422 })],
    ['missing reference', () => Response.json({}, { status: 201 })],
    ['malformed response', () => new Response('not JSON', { status: 201 })],
  ]) {
    test(`${provider}: ${name} stays uncertain and is never retried`, async (t) => {
      process.env.SMS_PROVIDER = provider;
      let calls = 0;
      t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
      const result = await prepareSmsSend().send({ to: '09000000000', message: 'Fictional reminder' });
      assert.equal(calls, 1);
      assert.equal(result.outcome, 'unknown');
      assert.equal(result.dispatched, true);
      assert.doesNotMatch(result.error, /sensitive provider detail/);
    });
  }
}

test('missing credentials fail before dispatch', () => {
  process.env.SMS_PROVIDER = 'semaphore';
  delete process.env.SEMAPHORE_API_KEY;
  const prepared = prepareSmsSend();
  assert.ok(prepared.error);
  assert.equal(prepared.send, undefined);
});

test('prepared sender freezes provider configuration before reservation/dispatch', async (t) => {
  process.env.SMS_PROVIDER = 'semaphore';
  const prepared = prepareSmsSend();
  process.env.SMS_PROVIDER = 'unisms';
  process.env.SEMAPHORE_DRY_RUN = 'true';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.semaphore.co/api/v4/messages');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    return Response.json([{ message_id: 123, status: 'Pending' }]);
  });
  assert.equal((await prepared.send({ to: '09000000000', message: 'Fictional' })).outcome, 'accepted');
});

for (const message of ['x'.repeat(161), 'x'.repeat(159) + '^', 'Fictional \u{1f600}']) {
  test('provider guard rejects oversized or unsupported SMS without dispatch', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Provider must not be called'); });
    const result = await prepareSmsSend('semaphore').send({ to: '09000000000', message });
    assert.equal(result.outcome, 'not_sent');
    assert.equal(result.dispatched, false);
    assert.equal(globalThis.fetch.mock.calls.length, 0);
  });
}

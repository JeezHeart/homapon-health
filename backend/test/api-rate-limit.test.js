const test = require('node:test');
const assert = require('node:assert/strict');
const { createApiRateLimiter } = require('../src/lib/apiRateLimit');

function createMockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('allows requests up to the per-IP cap and blocks the next with 429 + Retry-After', () => {
  let now = 1_000_000;
  const { middleware } = createApiRateLimiter({
    maxRequests: 3,
    windowMs: 60_000,
    now: () => now,
  });

  for (let i = 0; i < 3; i++) {
    let nextCalled = false;
    const res = createMockRes();
    middleware({ ip: '203.0.113.10' }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.headers['x-ratelimit-limit'], '3');
    assert.equal(res.headers['x-ratelimit-remaining'], String(2 - i));
  }

  let blockedNextCalled = false;
  const blockedRes = createMockRes();
  middleware({ ip: '203.0.113.10' }, blockedRes, () => {
    blockedNextCalled = true;
  });
  assert.equal(blockedNextCalled, false);
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(blockedRes.headers['x-ratelimit-remaining'], '0');
  assert.equal(blockedRes.headers['retry-after'], '60');
  assert.equal(blockedRes.body.ok, false);

  // Separate client IP stays unaffected.
  let otherIpAllowed = false;
  middleware({ ip: '203.0.113.11' }, createMockRes(), () => {
    otherIpAllowed = true;
  });
  assert.equal(otherIpAllowed, true);

  // Once the 60s window expires, the first IP is allowed again.
  now += 60_001;
  let recovered = false;
  middleware({ ip: '203.0.113.10' }, createMockRes(), () => {
    recovered = true;
  });
  assert.equal(recovered, true);
});

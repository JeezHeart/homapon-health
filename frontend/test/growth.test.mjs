import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
const growth = await server.ssrLoadModule('/src/utils/growth.ts');
test.after(() => server.close());

// Independently published WHO anthro README examples, not generated expectations.
test('LMS scores reproduce published WHO anthro examples', () => {
  for (const [sex, days, weight, height, wfa, hfa, wfh] of [
    ['Male', 1001, 18, 120, 2.20, 7.31, -2.39],
    ['Female', 1000, 15, 80, 0.95, -3.50, 4.13],
    ['Male', 1010, 10, 100, -2.76, 1.62, -5.19],
    ['Male', 1000, 15, 100, 0.69, 1.70, -0.29],
  ]) {
    for (const [metric, value, expected] of [['weight', weight, wfa], ['height', height, hfa], ['proportion', weight, wfh]]) {
      const ref = growth.growthReference(metric, sex, days, height);
      const actual = growth.growthScore(value, ref, metric !== 'height');
      assert.ok(Math.abs(actual - expected) < 0.006, `${metric}: ${actual} != ${expected}`);
    }
  }
});

test('position corrections switch at 731 days; reference range is enforced', () => {
  assert.equal(growth.adjustedHeight({ heightCm: 80, position: 'standing' }, 730), 80.7);
  assert.equal(growth.adjustedHeight({ heightCm: 80, position: 'lying' }, 731), 79.3);
  assert.equal(growth.growthReference('weight', 'Male', -1), undefined);
  assert.equal(growth.growthReference('weight', 'Male', 1827), undefined);
  assert.equal(growth.growthReference('proportion', 'Male', 100, 44), undefined);
  assert.equal(growth.growthReference('weight', 'Unknown', 10), undefined);
  assert.equal(growth.ageDays('2024-02-28', '2024-03-01'), 2);
});

test('missing or suspect inputs never become healthy/unhealthy conclusions', () => {
  const row = { measuredOn: '2026-01-01', weightKg: 3.3464, heightCm: 49.8842, position: 'lying', oedema: 'no' };
  assert.equal(growth.growthIndicator(row, '2026-01-01', 'Male', 'weight').score, 0);
  assert.match(growth.growthIndicator({ ...row, oedema: 'yes' }, '2026-01-01', 'Male', 'weight').label, /unavailable/);
  assert.match(growth.growthIndicator({ ...row, oedema: 'unknown' }, '2026-01-01', 'Male', 'weight').label, /assessment needed/);
  assert.match(growth.growthIndicator({ ...row, weightKg: 100 }, '2026-01-01', 'Male', 'weight').label, /Check measurement/);
  assert.equal(growth.growthIndicator({ ...row, heightCm: undefined }, '2026-01-01', 'Male', 'height').score, undefined);
});

test('weight-for-height interpolation uses adjacent LMS rows', () => {
  const a = growth.growthReference('proportion', 'Female', 1000, 80);
  const b = growth.growthReference('proportion', 'Female', 1000, 80.1);
  const mid = growth.growthReference('proportion', 'Female', 1000, 80.05);
  assert.ok(Math.abs(mid.m - (a.m + b.m) / 2) < 1e-10);
});

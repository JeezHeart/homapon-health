const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGrowth } = require('../src/lib/growth');
const valid = { measuredOn: '2026-01-01', weightKg: 8, heightCm: 70, position: 'lying', oedema: 'unknown', notes: '' };
test('growth validation accepts partial measurements and rejects invalid values', () => {
  assert.equal(validateGrowth(valid, '2025-01-01'), '');
  assert.equal(validateGrowth({ ...valid, heightCm: undefined, position: undefined }, '2025-01-01'), '');
  for (const patch of [{ measuredOn: '2026-02-30' }, { measuredOn: '2099-01-01' },
    { measuredOn: '2024-01-01' }, { weightKg: '8' }, { weightKg: 0 },
    { heightCm: Infinity }, { position: 'guess' }, { oedema: undefined },
    { notes: 'x'.repeat(501) }, { weightKg: undefined, heightCm: undefined, position: undefined }]) {
    assert.ok(validateGrowth({ ...valid, ...patch }, '2025-01-01'));
  }
});

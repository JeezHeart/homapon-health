import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { summarizeGrowth } = await server.ssrLoadModule('/src/utils/growthSummary.ts');
const child = (id) => ({ id, firstName: id, lastName: 'Fictional', birthDate: '2026-01-01', sex: 'Male' });
const measurement = (childId, extra = {}) => ({ id: childId, childId, measuredOn: '2026-01-01', weightKg: 3.3464, heightCm: 49.8842, position: 'lying', oedema: 'no', notes: '', ...extra });

test('summary counts each registered child once and ignores orphan measurements', () => {
  const result = summarizeGrowth(['within', 'review', 'incomplete', 'missing'].map(child), [
    measurement('within'), measurement('review', { weightKg: 100 }),
    measurement('incomplete', { heightCm: undefined }), measurement('orphan'),
  ]);
  assert.deepEqual(result.map((r) => r.group), ['within', 'review', 'incomplete', 'missing']);
  assert.equal(result.filter((r) => r.measurement).length, 3);
});
test('summary uses latest date instead of array order and does not combine visits', () => {
  const newer = measurement('one', { measuredOn: '2026-01-02', weightKg: undefined });
  const older = measurement('one');
  assert.equal(summarizeGrowth([child('one')], [newer, older])[0].measurement, newer);
  assert.equal(summarizeGrowth([child('one')], [newer, older])[0].group, 'incomplete');
});
test('unassessed inputs and unsupported ages remain unavailable; review takes precedence', () => {
  assert.equal(summarizeGrowth([child('one')], [measurement('one', { oedema: 'unknown' })])[0].group, 'incomplete');
  assert.equal(summarizeGrowth([{ ...child('one'), birthDate: '2010-01-01' }], [measurement('one')])[0].group, 'incomplete');
  assert.equal(summarizeGrowth([child('one')], [measurement('one', { heightCm: 100, oedema: 'unknown' })])[0].group, 'review');
  assert.deepEqual(summarizeGrowth([], []), []);
});

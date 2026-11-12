import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { overviewMonths } = await server.ssrLoadModule('/src/utils/dashboardOverview.ts');

test('six-month window crosses years and excludes dates outside the displayed period', () => {
  const result = overviewMonths([
    { dateAdministered: '2025-08-31' }, { dateAdministered: '2025-09-01' },
    { dateAdministered: '2026-02-28' }, { dateAdministered: '2026-03-01' },
  ], [], '2026-02-10');
  assert.deepEqual(result.map((bucket) => bucket.prefix), ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(result.map((bucket) => bucket.doses), [1, 0, 0, 0, 0, 1]);
});

test('dose dates and scheduled dates remain separate recorded counts', () => {
  const result = overviewMonths([{ dateAdministered: '2026-11-01' }], [
    { scheduledDate: '2026-10-30' }, { scheduledDate: '2026-11-01' }, { scheduledDate: '2026-11-01' },
  ], '2026-11-12');
  assert.equal(result[4].doses, 0);
  assert.equal(result[4].appointments, 1);
  assert.equal(result[5].doses, 1);
  assert.equal(result[5].appointments, 2);
});

test('empty records produce six zero-count months', () => {
  const result = overviewMonths([], [], '2026-11-12');
  assert.equal(result.length, 6);
  assert.ok(result.every((bucket) => bucket.doses === 0 && bucket.appointments === 0));
});

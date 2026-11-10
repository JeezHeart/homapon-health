import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { reviewScore, reviewInputs, parityExamples } = await server.ssrLoadModule('/src/utils/recordReview.ts');

test('browser forest scores match Python scikit-learn on fictional examples', () => {
  for (const example of parityExamples) assert(Math.abs(reviewScore(example.input) - example.score) < 1e-10);
  assert.throws(() => reviewScore([NaN, 1, 1, 1, 1, 1]));
  assert.throws(() => reviewScore([1]));
});

test('missing, duplicated, future, malformed, impossible and reversed dates block review', () => {
  const rows = ['penta', 'opv', 'pcv'].flatMap(vaccineId => ['2026-01-01', '2026-01-29', '2026-02-26'].map((dateAdministered, i) => ({ vaccineId, doseNumber: i + 1, dateAdministered })));
  const original = JSON.stringify(rows);
  assert.deepEqual(reviewInputs(rows, '2026-11-04').gaps, [28, 28, 28, 28, 28, 28]);
  assert.equal(reviewInputs(rows, '2026-11-04').problems.length, 0);
  assert(reviewInputs(rows.slice(1), '2026-11-04').problems.length);
  assert(reviewInputs([...rows, rows[0]], '2026-11-04').problems.length);
  for (const date of ['2027-01-01', 'not-a-date', '2026-02-30', '2026-03-01']) {
    const altered = rows.map((r, i) => i === 0 ? { ...r, dateAdministered: date } : r);
    assert(reviewInputs(altered, '2026-11-04').problems.length, date);
  }
  assert.equal(JSON.stringify(rows), original);
});

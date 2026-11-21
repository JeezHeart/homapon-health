import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { reviewRows, filterReviewRows, ISSUE_LABELS, reviewActions } = await server.ssrLoadModule('/src/utils/reviewWorklist.ts');
const { directoryPage } = await server.ssrLoadModule('/src/utils/childDirectory.ts');

const children = [
  { id: 'a', firstName: 'Ana', lastName: 'Example' },
  { id: 'b', firstName: 'Bea', lastName: 'Example' },
];
const finding = (childId, issueType, priority) => ({
  childId, issueType, priority, vaccineId: 'penta', recordIds: [childId],
});
const rows = reviewRows([
  finding('a', 'missing_date', 'standard'),
  finding('b', 'potential_duplicate', 'high'),
  finding('unknown', 'invalid_date', 'high'),
], children);
const defaults = { query: '', issue: 'all', priority: 'all', sort: 'priority' };

test('review controls follow status and restrict finalization to midwives', () => {
  assert.deepEqual(reviewActions('pending', 'bhw'), ['verified', 'escalated']);
  assert.deepEqual(reviewActions('verified', 'bhw'), ['escalated']);
  assert.deepEqual(reviewActions('escalated', 'bhw'), []);
  assert.deepEqual(reviewActions('escalated', 'midwife'), ['resolved']);
  assert.deepEqual(reviewActions('resolved', 'midwife'), []);
  assert.deepEqual(reviewActions('pending'), []);
});

test('links only available children and labels possible duplicates as unconfirmed', () => {
  assert.deepEqual(rows.map((row) => [row.childId, row.name]), [['a', 'Ana Example'], ['b', 'Bea Example']]);
  assert.equal(ISSUE_LABELS.potential_duplicate, 'Possible duplicate');
});

test('sorts and filters the complete worklist before pagination', () => {
  const ordered = filterReviewRows(rows, defaults);
  assert.equal(directoryPage(ordered, 1, 1).visible[0].childId, 'b');
  assert.equal(directoryPage(ordered, 2, 1).visible[0].childId, 'a');
  assert.equal(filterReviewRows(rows, { ...defaults, sort: 'name' })[0].childId, 'a');
  assert.deepEqual(filterReviewRows(rows, {
    ...defaults, query: ' PENTA ', priority: 'high', issue: 'potential_duplicate',
  }).map((row) => row.childId), ['b']);
  assert.deepEqual(filterReviewRows(rows, { ...defaults, query: 'absent' }), []);
});

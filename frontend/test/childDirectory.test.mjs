import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { childDirectoryRows, directoryPage } = await server.ssrLoadModule('/src/utils/childDirectory.ts');
const { VACCINES } = await server.ssrLoadModule('/src/data/vaccines.ts');
const child = (id, extra = {}) => ({ id, firstName: id, lastName: 'Fictional', guardian: 'Fictional Guardian', guardianMobile: '09000000000', birthDate: '2024-01-01', sex: 'Female', purok: 'Purok 2', ...extra });
const appointment = (id, childId, extra = {}) => ({ id, childId, vaccineId: 'penta', doseNumber: 1, scheduledDate: '2025-01-01', ...extra });

test('overdue appointments remain separate from recorded-dose status', () => {
  const rows = childDirectoryRows([child('one')], [], [appointment('old', 'one')]);
  assert.equal(rows[0].vaccination, 'Partially immunized');
  assert.equal(rows[0].next.status, 'overdue');
  const complete = VACCINES.flatMap((vaccine) => vaccine.doses.map((dose) => ({ id: `${vaccine.id}-${dose.doseNumber}`, childId: 'one', vaccineId: vaccine.id, doseNumber: dose.doseNumber, dateAdministered: '2025-01-01' })));
  assert.equal(childDirectoryRows([child('one')], complete, [])[0].vaccination, 'Fully immunized');
});

test('appointment filters find matching visits even when the child also has another status', () => {
  const visits = [appointment('old', 'one'), appointment('future', 'one', { scheduledDate: '2099-01-01', doseNumber: 2 })];
  assert.equal(childDirectoryRows([child('one')], [], visits, { schedule: 'upcoming' })[0].next.id, 'future');
  assert.equal(childDirectoryRows([child('one')], [], visits, { schedule: 'overdue' })[0].next.id, 'old');
  const records = [{ id: 'record', childId: 'one', vaccineId: 'penta', doseNumber: 1, dateAdministered: '2025-01-01' }];
  assert.equal(childDirectoryRows([child('one')], records, visits, { schedule: 'overdue' }).length, 0);
});

test('search, purok, vaccination filters and empty schedules combine without losing children', () => {
  const children = [child('Beta'), child('Alpha', { guardian: 'Sample Parent', purok: 'Address, Purok 3' })];
  assert.deepEqual(childDirectoryRows(children, [], []).map((row) => row.child.id), ['Alpha', 'Beta']);
  assert.equal(childDirectoryRows(children, [], [], { query: ' SAMPLE parent ', purok: 'Purok 3', vaccination: 'Partially immunized' }).length, 1);
  assert.equal(childDirectoryRows(children, [], [], { schedule: 'upcoming' }).length, 0);
  assert.equal(childDirectoryRows(children, [], [], { vaccination: 'Fully immunized' }).length, 0);
});

test('pagination clamps stale pages after filtering or deletion and handles empty results', () => {
  const rows = Array.from({ length: 13 }, (_, index) => index);
  assert.deepEqual(directoryPage(rows, 999, 5), { page: 3, pages: 3, visible: [10, 11, 12], first: 11, last: 13 });
  assert.equal(directoryPage(rows.slice(0, 8), 3, 5).page, 2);
  assert.equal(directoryPage(rows, -3, 5).page, 1);
  assert.deepEqual(directoryPage([], 99, 10), { page: 1, pages: 1, visible: [], first: 0, last: 0 });
});

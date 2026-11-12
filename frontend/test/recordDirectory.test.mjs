import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { recordDirectory } = await server.ssrLoadModule('/src/utils/recordDirectory.ts');
const children = [
  { id: 'b', firstName: 'Bea', lastName: 'Fictional', guardian: 'Example Guardian' },
  { id: 'a', firstName: 'Ana', lastName: 'Fictional', guardian: 'Other Guardian' },
];
const record = (id, childId, dateAdministered, vaccineId = 'penta') => ({ id, childId, dateAdministered, vaccineId, doseNumber: 1 });
const records = [record('older', 'b', '2026-10-01'), record('newer', 'b', '2026-11-01'), record('another', 'a', '2026-10-15', 'opv'), record('orphan', 'missing', '2026-10-10')];

test('groups records by child, sorts dates newest first, and excludes missing children', () => {
  const groups = recordDirectory(children, records, {});
  assert.deepEqual(groups.map((group) => group.child.id), ['a', 'b']);
  assert.deepEqual(groups[1].doses.map((dose) => dose.id), ['newer', 'older']);
  assert.deepEqual(records.map((dose) => dose.id), ['older', 'newer', 'another', 'orphan']);
});

test('search supports child, guardian and vaccine alongside vaccine filters', () => {
  assert.equal(recordDirectory(children, records, { query: ' EXAMPLE GUARDIAN ' })[0].doses.length, 2);
  assert.equal(recordDirectory(children, records, { query: 'ana fictional' })[0].child.id, 'a');
  assert.equal(recordDirectory(children, records, { query: 'opv', vaccine: 'opv' })[0].child.id, 'a');
  assert.deepEqual(recordDirectory(children, records, { query: 'opv', vaccine: 'penta' }), []);
});

test('date range is inclusive and supports one-sided bounds', () => {
  assert.deepEqual(recordDirectory(children, records, { from: '2026-10-01', to: '2026-10-15' }).flatMap((group) => group.doses.map((dose) => dose.id)), ['another', 'older']);
  assert.equal(recordDirectory(children, records, { from: '2026-11-01' })[0].doses[0].id, 'newer');
  assert.equal(recordDirectory(children, records, { to: '2026-10-01' })[0].doses[0].id, 'older');
  assert.deepEqual(recordDirectory(children, records, { from: '2026-11-01', to: '2026-10-01' }), []);
});

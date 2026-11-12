import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { reportOverview } = await server.ssrLoadModule('/src/utils/reportOverview.ts');
const { VACCINES } = await server.ssrLoadModule('/src/data/vaccines.ts');
const child = (id, purok) => ({ id, firstName: id, lastName: 'Fictional', guardian: 'Example Guardian', purok });
const children = [child('a', 'Purok 2'), child('b', 'Purok 3'), child('c', '')];
const record = (id, childId, dateAdministered, vaccineId = 'penta', doseNumber = 1) => ({ id, childId, dateAdministered, vaccineId, doseNumber });
const records = [record('older', 'a', '2026-10-01'), record('period', 'a', '2026-11-01', 'opv'), record('orphan', 'missing', '2026-11-01'), ...VACCINES.flatMap((vaccine) => vaccine.doses.map((dose) => record(`${vaccine.id}-${dose.doseNumber}`, 'b', '2025-01-01', vaccine.id, dose.doseNumber)))];
const appointments = ['penta', 'opv'].map((vaccineId) => ({ id: vaccineId, childId: 'a', vaccineId, doseNumber: 2, scheduledDate: '2025-01-01' }));
const range = { from: '2026-11-01', to: '2026-11-12' };

test('vaccination status remains separate from overdue child and appointment counts', () => {
  const result = reportOverview(children, records, appointments, range);
  assert.equal(result.fully, 1);
  assert.equal(result.partial, 2);
  assert.equal(result.fully + result.partial, result.registry.length);
  assert.equal(result.overdue.length, 2);
  assert.equal(result.purokSummary.find((row) => row.purok === 'Purok 2').overdueChildren, 1);
  assert.equal(result.purokSummary.find((row) => row.purok === 'Unassigned').total, 1);
  assert.equal(result.purokSummary.reduce((sum, row) => sum + row.total, 0), 3);
});

test('purok filters apply to registry and period, while dates apply only to period doses', () => {
  const result = reportOverview(children, records, appointments, { ...range, purok: 'Purok 2' });
  assert.deepEqual(result.registry.map((row) => row.id), ['a']);
  assert.equal(result.registryRecords.length, 2);
  assert.deepEqual(result.periodRecords.map((row) => row.id), ['period']);
  assert.equal(result.perVaccine.reduce((sum, row) => sum + row.count, 0), 1);
  const earlier = reportOverview(children, records, appointments, { ...range, from: '2026-10-01' });
  assert.equal(earlier.periodRecords.length, 2);
  assert.equal(earlier.fully, 1);
  assert.deepEqual(records.slice(0, 3).map((row) => row.id), ['older', 'period', 'orphan']);
});

test('invalid ranges block period figures without discarding current registry counts', () => {
  for (const from of ['2026-11-13', '2026-02-30', '']) {
    const result = reportOverview(children, records, appointments, { ...range, from });
    assert.equal(result.periodValid, false);
    assert.equal(result.periodRecords.length, 0);
    assert.equal(result.registry.length, 3);
  }
  const empty = reportOverview([], [], [], range);
  assert.equal(empty.fully + empty.partial, 0);
  assert.deepEqual(empty.perVaccine, []);
});

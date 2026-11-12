import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { filterSchedule, validScheduleDate } = await server.ssrLoadModule('/src/utils/scheduleDirectory.ts');
const child = { id: 'fictional', firstName: 'Fictional', lastName: 'Child', guardian: 'Example Guardian', purok: 'Purok 2' };
const appointment = (id, scheduledDate, status, extra = {}) => ({ id, child, scheduledDate, status, ...extra });
const rows = [
  appointment('future', '2026-11-18', 'upcoming'),
  appointment('done', '2026-11-11', 'completed'),
  appointment('old', '2026-11-11', 'overdue'),
  appointment('today', '2026-11-12', 'due-today'),
];

test('appointment filters preserve completed and pending distinctions', () => {
  const ids = (filter) => filterSchedule(rows, { filter }, '2026-11-12').map((row) => row.id);
  assert.deepEqual(ids('today'), ['today']);
  assert.deepEqual(ids('week'), ['old', 'today']);
  assert.deepEqual(ids('upcoming'), ['today', 'future']);
  assert.deepEqual(ids('overdue'), ['old']);
  assert.deepEqual(ids('completed'), ['done']);
});

test('calendar date selection includes completed appointments and combines search and purok', () => {
  assert.deepEqual(filterSchedule(rows, { date: '2026-11-11', query: ' GUARDIAN ', purok: 'Purok 2' }).map((row) => row.id), ['done', 'old']);
  assert.equal(filterSchedule(rows, { query: 'fictional child' }).length, 4);
  assert.equal(filterSchedule(rows, { purok: 'Purok 3' }).length, 0);
  assert.equal(filterSchedule(rows, { date: '2026-11-10' }).length, 0);
  assert.deepEqual(rows.map((row) => row.id), ['future', 'done', 'old', 'today']);
});

test('invalid calendar URLs are rejected instead of rolling over dates', () => {
  for (const value of [null, '', '2026-02-30', '2026-13-01', 'not-a-date']) assert.equal(validScheduleDate(value), null);
  assert.equal(validScheduleDate('2024-02-29'), '2024-02-29');
});

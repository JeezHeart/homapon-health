import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { smsDirectory } = await server.ssrLoadModule('/src/utils/smsDirectory.ts');
const children = [{ id: 'a', firstName: 'Ana', lastName: 'Fictional', guardian: 'Example Guardian', purok: 'Purok 2' }];
const appointments = [
  { id: 'tomorrow', childId: 'a', child: children[0], scheduledDate: '2026-11-13', status: 'upcoming' },
  { id: 'old', childId: 'a', child: children[0], scheduledDate: '2026-11-11', status: 'overdue' },
  { id: 'today', childId: 'a', child: children[0], scheduledDate: '2026-11-12', status: 'due-today' },
  { id: 'done', childId: 'a', child: children[0], scheduledDate: '2026-11-12', status: 'completed' },
];
const log = [
  { id: 'old-log', childId: 'a', sentAt: '2026-11-10', status: 'Accepted', message: 'Fictional message' },
  { id: 'new-log', childId: 'a', sentAt: '2026-11-12', status: 'Unknown', message: 'Fictional message' },
  { id: 'unlinked', childId: 'missing', sentAt: '2026-11-11', status: 'Demo sent', message: 'Fictional message' },
];
const directory = (filters) => smsDirectory(children, appointments, log, filters, '2026-11-12', '2026-11-13');

test('reminder filters exclude completed appointments and preserve each appointment identity', () => {
  assert.deepEqual(directory({}).reminders.map((row) => row.id), ['old', 'today', 'tomorrow']);
  for (const filter of ['today', 'tomorrow']) assert.deepEqual(directory({ filter }).reminders.map((row) => row.id), [filter]);
  assert.deepEqual(directory({ filter: 'overdue' }).reminders.map((row) => row.id), ['old']);
});

test('search and purok apply to both views, without losing unlinked history by default', () => {
  assert.equal(directory({ query: ' EXAMPLE GUARDIAN ', purok: 'Purok 2' }).history.length, 2);
  assert.equal(directory({ query: 'ana fictional' }).reminders.length, 3);
  assert.equal(directory({ purok: 'Purok 3' }).reminders.length, 0);
  assert.equal(directory({}).history.length, 3);
});

test('latest SMS is per child, retains uncertainty, and does not alter input history', () => {
  const result = directory({ filter: 'tomorrow' });
  assert.equal(result.latest.get('a').id, 'new-log');
  assert.equal(result.latest.get('a').status, 'Unknown');
  assert.equal(result.history.find((row) => row.id === 'old-log').status, 'Accepted');
  assert.deepEqual(log.map((row) => row.id), ['old-log', 'new-log', 'unlinked']);
});

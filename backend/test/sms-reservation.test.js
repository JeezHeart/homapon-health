const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/db');
const calls = [];
let rpcError = null;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: rpcError }; } },
} };

test('logical keys survive booking duplication and mutable contact/provider details', () => {
  const { reminderKeys } = require('../src/lib/smsReservations');
  const appt = { child_id: 'child', id: 'booking-1', vaccine_id: 'bcg', dose_number: 1, scheduled_date: '2026-11-01', scheduled_time: '09:00' };
  const first = reminderKeys(appt);
  assert.deepEqual(reminderKeys({ ...appt, id: 'booking-2', guardian_mobile: 'changed', name: 'Changed', provider: 'changed', scheduled_time: '09:00:00' }), first);
  assert.equal(first.key.length, 64);
  assert.notEqual(reminderKeys({ ...appt, scheduled_date: '2026-11-02' }).key, first.key);
  assert.equal(reminderKeys({ ...appt, scheduled_date: '2026-11-02' }).scope, first.scope);
  assert.notEqual(reminderKeys({ ...appt, dose_number: 2 }).scope, first.scope);
  assert.equal(reminderKeys({ ...appt, scheduled_time: null }).key, reminderKeys({ ...appt, scheduled_time: '' }).key);
});

test('RPC helpers use server-generated ownership and never fall back when persistence fails', async () => {
  const reservations = require('../src/lib/smsReservations');
  const appt = { child_id: 'child', id: 'booking', vaccine_id: 'bcg', dose_number: 1, scheduled_date: '2026-11-01' };
  await reservations.reserveSms(appt, 'staff', '09000000000', 'Fictional', 'semaphore');
  assert.equal(calls.at(-1).name, 'claim_sms_send');
  assert.match(calls.at(-1).args.p_attempt_id, /^[0-9a-f-]{36}$/);
  rpcError = { message: 'Sensitive database details' };
  await assert.rejects(reservations.reserveSms(appt, 'staff', '09000000000', 'Fictional', 'semaphore'), (error) => {
    assert.match(error.message, /Could not persist/);
    assert.doesNotMatch(error.message, /Sensitive database details/);
    return true;
  });
});

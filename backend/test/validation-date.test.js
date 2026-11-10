const test = require('node:test');
const assert = require('node:assert/strict');
const { todayLocalISO, validateChild, validateDose, validateAppointment } = require('../src/lib/validate');

function setServerTimezone(t, timezone) {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

for (const timezone of ['UTC', 'Asia/Manila', 'America/Los_Angeles']) {
  test(`clinic date follows Manila midnight on a ${timezone} server`, (t) => {
    setServerTimezone(t, timezone);
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    for (const [instant, expected] of [
      ['2026-10-29T15:59:59.999Z', '2026-10-29'],
      ['2026-10-29T16:00:00.000Z', '2026-10-30'],
      ['2026-12-31T16:00:00.000Z', '2027-01-01'],
      ['2028-02-28T16:00:00.000Z', '2028-02-29'],
    ]) {
      t.mock.timers.setTime(Date.parse(instant));
      assert.equal(todayLocalISO(), expected, instant);
    }
  });
}

test('date validation uses the clinic day for births, doses, and appointments', (t) => {
  setServerTimezone(t, 'UTC');
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-29T17:00:00Z') });
  const dose = {
    childId: '00000000-0000-4000-8000-000000000001',
    vaccineId: 'bcg', doseNumber: 1,
    dateAdministered: '2026-10-30', healthWorker: 'Fictional Worker',
  };
  assert.equal(validateChild({ birthDate: '2026-10-30' }, true), null);
  assert.equal(validateChild({ birthDate: '2026-10-31' }, true), 'Date of birth cannot be in the future.');
  assert.equal(validateDose(dose), null);
  assert.equal(validateDose({ ...dose, dateAdministered: '2026-10-31' }), 'Date administered cannot be in the future.');
  assert.equal(validateAppointment({ ...dose, scheduledDate: '2026-10-30' }), null);
  assert.equal(validateAppointment({ ...dose, scheduledDate: '2026-10-29' }), 'Appointment date cannot be in the past.');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewIntervals } = require('../src/lib/vaccinationIntervals');

function dose(doseNumber, date, vaccineId = 'penta') {
  return { id: `${vaccineId}-${doseNumber}`, dose_number: doseNumber, vaccine_id: vaccineId, date_administered: date };
}

test('computes calendar-day gaps per vaccine and flags a short primary pentavalent interval', () => {
  const result = reviewIntervals([
    dose(3, '2024-03-28'), dose(1, '2024-02-02'), dose(2, '2024-02-29'),
    dose(1, '2024-02-02', 'pcv'), dose(2, '2024-02-03', 'pcv'),
  ], '2024-03-28');
  assert.deepEqual(result.intervals.map(({ days }) => days), [27, 28, 1]);
  assert.deepEqual(result.flags.map(({ code }) => code), ['below_minimum_interval']);
  assert.equal(result.flags[0].minimumDays, 28);
  assert.deepEqual(result.flags[0].recordIds, ['penta-1', 'penta-2']);
});

test('flags unusable dates and dose gaps without bridging them', () => {
  const result = reviewIntervals([
    dose(1, '2024-01-01'), dose(2, null), dose(3, '2024-03-01'),
    dose(4, '03/04/2024; 04/04/2024'), dose(5, '2024-02-30'),
    dose(6, '2024-04-02'), dose(8, '2024-03-30'),
  ], '2024-04-01');
  assert.deepEqual(result.intervals, []);
  assert.deepEqual(result.flags.map(({ code }) => code), [
    'missing_date', 'ambiguous_date', 'invalid_date', 'future_date', 'prior_dose_not_recorded',
  ]);
});

test('flags reversed and same-day records and preserves the observed zero-day gap', () => {
  const result = reviewIntervals([
    dose(1, '2024-03-02'), dose(2, '2024-03-01'), dose(3, '2024-03-01'),
  ], '2024-04-01');
  assert.deepEqual(result.intervals.map(({ days }) => days), [0]);
  assert.deepEqual(result.flags.map(({ code }) => code), ['reversed_dates', 'same_day_doses']);
});

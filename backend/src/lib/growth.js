const { todayLocalISO } = require('./validate');

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateGrowth(body, birthDate) {
  if (!validDate(body.measuredOn) || body.measuredOn < birthDate || body.measuredOn > todayLocalISO())
    return 'Measurement date must be between birth and today.';
  const weight = body.weightKg !== undefined;
  const height = body.heightCm !== undefined;
  if (!weight && !height) return 'Enter a weight or length/height measurement.';
  if (weight && (typeof body.weightKg !== 'number' || !Number.isFinite(body.weightKg) || body.weightKg <= 0 || body.weightKg > 200))
    return 'Enter a numeric weight above 0 and at most 200 kg. Check the units.';
  if (height && (typeof body.heightCm !== 'number' || !Number.isFinite(body.heightCm) || body.heightCm <= 0 || body.heightCm > 250))
    return 'Enter a numeric length/height above 0 and at most 250 cm. Check the units.';
  if (height ? !['lying', 'standing'].includes(body.position) : body.position !== undefined)
    return 'Specify lying or standing for a length/height measurement only.';
  if (!['unknown', 'no', 'yes'].includes(body.oedema)) return 'Select the swelling assessment status.';
  if (typeof body.notes !== 'string' || body.notes.length > 500) return 'Notes must be text with at most 500 characters.';
  return '';
}

module.exports = { validateGrowth };

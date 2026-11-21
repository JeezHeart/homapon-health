/*
 * FILE GUIDE: Child Growth Measurement Validation (backend/src/lib/growth.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Server-side validation rules para sa dated growth measurements ng bata
 *   (weight in kg, length/height in cm, lying/standing position, oedema status,
 *   measurement date, at notes). Gamit 'to pareho sa child registration at growth routes.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - 422 validation error kapag nagse-save ng growth record o nagre-register ng bata
 *   - Na-reject na date dahil mas maaga sa birthDate o lagpas sa today (Philippine time)
 *   - Position field na required kapag may heightCm, pero bawal kapag weight-only lang
 */
const { todayLocalISO } = require('./validate');

// Chine-check kung totoong YYYY-MM-DD calendar date yung string (bawal yung imbento gaya ng 2025-02-30).
// Input: value (kahit ano). Output: true kung valid ISO calendar date, false kung hindi.
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Bina-validate yung growth measurement payload laban sa clinic bounds bago i-save sa DB.
// Inputs:
//   - body: request object na may measuredOn, weightKg?, heightCm?, position?, oedema, notes
//   - birthDate: YYYY-MM-DD birthday ng bata
// Output: Empty string '' kapag goods, o user-friendly error message ng unang maling field.
// Debugging tip: pang-harang 'to sa maling units (hal. grams ang na-type imbes na kg) at maling dates.
function validateGrowth(body, birthDate) {
  // Dapat valid calendar date na nasa pagitan ng birthDate at today (PH time).
  if (!validDate(body.measuredOn) || body.measuredOn < birthDate || body.measuredOn > todayLocalISO())
    return 'Measurement date must be between birth and today.';
  // Dapat may kahit isa man lang: weight o length/height.
  const weight = body.weightKg !== undefined;
  const height = body.heightCm !== undefined;
  if (!weight && !height) return 'Enter a weight or length/height measurement.';
  // Range check para mahuli agad yung maling unit encoding (hal. grams o meters).
  if (weight && (typeof body.weightKg !== 'number' || !Number.isFinite(body.weightKg) || body.weightKg <= 0 || body.weightKg > 200))
    return 'Enter a numeric weight above 0 and at most 200 kg. Check the units.';
  if (height && (typeof body.heightCm !== 'number' || !Number.isFinite(body.heightCm) || body.heightCm <= 0 || body.heightCm > 250))
    return 'Enter a numeric length/height above 0 and at most 250 cm. Check the units.';
  // Kapag may height, required yung 'lying' o 'standing' (para tama ang WHO LMS length/height check); kapag wala, dapat undefined.
  if (height ? !['lying', 'standing'].includes(body.position) : body.position !== undefined)
    return 'Specify lying or standing for a length/height measurement only.';
  // Dapat laging may malinaw na oedema (pamamaga) status para accurate yung nutrition screening.
  if (!['unknown', 'no', 'yes'].includes(body.oedema)) return 'Select the swelling assessment status.';
  // Hanggang 500 characters lang ang allowed sa notes field.
  if (typeof body.notes !== 'string' || body.notes.length > 500) return 'Notes must be text with at most 500 characters.';
  return '';
}

module.exports = { validateGrowth };

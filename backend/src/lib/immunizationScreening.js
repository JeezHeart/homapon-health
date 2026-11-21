/*
 * FILE GUIDE: Immunization Record Screening & Priority Rules (backend/src/lib/immunizationScreening.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Ini-scan yung lahat ng dose records ng mga bata para makita yung documentation
 *   anomalies (pinapasa muna yung date/interval check sa vaccinationIntervals.js tapos
 *   dinadagdagan ng potential duplicate check), at naglalagay ng triage priority
 *   ('high' o 'standard') sa bawat finding para sa staff review worklist.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - May lumalabas o nawawalang finding sa immunization review worklist
 *   - Potential duplicate false positive/negative kapag dalawang dose ang magkapareho ng date
 *   - Kapag gustong baguhin kung aling issue ang 'high' vs 'standard' priority
 */
const { todayLocalISO } = require('./validate');
const { reviewIntervals } = require('./vaccinationIntervals');

// Yung mga record na may ganitong date problem ay hindi muna isinasali sa same-date duplicate check.
const UNUSABLE_DATE_CODES = new Set([
  'missing_date', 'ambiguous_date', 'invalid_date', 'future_date',
]);

// Ini-screen yung listahan ng dose_records ng lahat ng bata at gumagawa ng review findings.
// Inputs:
//   - records: array ng DB rows ({ id, child_id, vaccine_id, dose_number, date_administered })
//   - today: optional YYYY-MM-DD clinic date (default: current Asia/Manila date)
// Output: Array ng finding objects ({ childId, vaccineId, recordIds, doses, issueType, explanationCode, message, ... }).
// Debugging tip: pure deterministic logic 'to (walang DB o AI call), kaya madaling i-reproduce gamit sample rows.
function screenDoseRecords(records, today = todayLocalISO()) {
  // Ginu-group muna per child_id para hiwalay na ma-check yung immunization history ng bawat bata.
  const histories = new Map();
  for (const record of records) {
    if (!histories.has(record.child_id)) histories.set(record.child_id, []);
    histories.get(record.child_id).push(record);
  }

  const findings = [];
  for (const [childId, history] of histories) {
    // Step 1: Patakbuhin yung date at interval rules per bata galing sa vaccinationIntervals.js.
    const { flags } = reviewIntervals(history, today);
    const unusableDates = new Set();
    for (const { code, ...flag } of flags) {
      findings.push({ childId, issueType: code, explanationCode: code, ...flag });
      if (UNUSABLE_DATE_CODES.has(code)) unusableDates.add(flag.recordIds[0]);
    }

    // Step 2: Chine-check kung may potential duplicate entry (parehong vaccine at parehong
    // valid date pero ibang dose number — baka nadoble lang ng encode yung isang turok).
    const sameDayGroups = new Map();
    for (const record of history) {
      if (unusableDates.has(record.id)) continue;
      const key = JSON.stringify([record.vaccine_id, record.date_administered]);
      if (!sameDayGroups.has(key)) sameDayGroups.set(key, []);
      sameDayGroups.get(key).push(record);
    }
    for (const group of sameDayGroups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.dose_number - b.dose_number);
      findings.push({
        childId,
        vaccineId: group[0].vaccine_id,
        recordIds: group.map((record) => record.id),
        doses: group.map((record) => record.dose_number),
        issueType: 'potential_duplicate',
        explanationCode: 'same_vaccine_same_administration_date',
        message: 'Multiple entries for this vaccine share an administration date. Check whether one administration was recorded more than once.',
      });
    }
  }
  return findings;
}

// Static lookup table para sa triage priority ('high' vs 'standard') at dahilan ng bawat issueType.
const PRIORITY = {
  invalid_date: ['high', 'Correct an invalid date before relying on this record.'],
  future_date: ['high', 'Verify a future date on a completed dose record.'],
  reversed_dates: ['high', 'Resolve conflicting dates before comparing dose intervals.'],
  same_day_doses: ['high', 'Verify the dates of doses recorded on the same day.'],
  potential_duplicate: ['high', 'Verify whether the entries document the same administration.'],
  below_minimum_interval: ['high', 'Verify the entries against the referenced minimum interval.'],
  ambiguous_date: ['standard', 'Check the source for one clear administration date.'],
  missing_date: ['standard', 'Check the source for the missing administration date.'],
  prior_dose_not_recorded: ['standard', 'Check whether the earlier dose was documented elsewhere.'],
};

// Dinadagdagan yung finding object ng priority ('high' | 'standard') at priorityReason.
// Input: finding object na may issueType. Output: bagong finding object na may priority fields.
// Debugging tip: kapag may bagong issueType na wala pa sa PRIORITY map, safe fallback siya sa 'standard'.
function prioritizeFinding(finding) {
  const [priority, priorityReason] = PRIORITY[finding.issueType] ??
    ['standard', 'Check the source documentation.'];
  return { ...finding, priority, priorityReason };
}

module.exports = { screenDoseRecords, prioritizeFinding };

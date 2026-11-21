/*
 * FILE GUIDE: Immunization Review State & Snapshot Tracking (backend/src/lib/reviewTracking.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Nagbabasa ng paginated dose_records at immunization_review_latest rows mula sa
 *   Supabase, gumagawa ng SHA-256 findingKey at evidence version hashes, at pinagme-merge
 *   yung live screening findings sa naka-save na review statuses (pending, verified,
 *   escalated, resolved). Pinapanatili ring visible yung na-fix nang escalations hanggang
 *   i-close mismo ng midwife.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - 409 "The finding or review changed" (dahil nag-shift yung revision o version hash)
 *   - Escalated finding na nasa worklist pa rin kahit inayos na yung date (normal: screeningCleared: true)
 *   - Pagination issue kapag lumagpas sa 1,000 rows yung Supabase table
 */
const { createHash } = require('node:crypto');
const { supabase } = require('../db');
const { screenDoseRecords, prioritizeFinding } = require('./immunizationScreening');

const FIELD_LIST = 'id, child_id, vaccine_id, dose_number, date_administered';
const PAGE_SIZE = 500;
// Deterministic SHA-256 hex hash helper para sa findingKey at evidence version.
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Nagbabasa ng lahat ng rows mula sa Supabase query nang tig-500 rows per page para walang maputol.
// Input: query — factory function na nagbabalik ng fresh ordered Supabase query.
// Output: Promise ng buong array ng rows; nag-t-throw kapag may DB error.
async function readPages(query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await query().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

// Nagfe-fetch ng dose_records (pwedeng naka-filter sa isang childId at may kasamang child revision).
// Input: { childId?, tracking = false }. Output: Promise ng array ng dose_records na naka-order by id.
// Debugging tip: kapag tracking=true, kasama sa join yung children(dose_review_revision) para mahuli kung may nag-edit habang nagbabasa.
function readDoseRecords({ childId, tracking = false } = {}) {
  return readPages(() => {
    const fields = tracking ? FIELD_LIST + ', children(dose_review_revision)' : FIELD_LIST;
    const query = supabase.from('dose_records').select(fields).order('id');
    return childId ? query.eq('child_id', childId) : query;
  });
}

// Pinagsasama yung fresh screening findings at latest saved review events para makuha yung current state ng bawat finding.
// Inputs: records (dose rows na may children.dose_review_revision), events (immunization_review_latest rows), today (YYYY-MM-DD).
// Output: Array ng { finding, revision } objects para sa API at concurrency check.
// Debugging tip:
//   - Nag-t-throw ng code 'review_snapshot_changed' kapag nagbago yung revision ng isang bata habang nagpa-paginate.
//   - Nagse-set ng reassessed: true kapag nabago yung dates ng dati nang na-review na finding.
//   - Gumagawa ng 'screening_cleared' item para sa open escalations na na-fix na para midwife pa rin ang mag-close.
function trackedStates(records, events, today) {
  const dates = new Map(records.map((row) => [row.id, row.date_administered]));
  const latest = new Map(events.map((event) => [event.finding_key, event]));
  // Snapshot consistency check: dapat pare-pareho yung dose_review_revision ng lahat ng rows ng isang bata.
  const revisions = new Map();
  for (const row of records) {
    const revision = row.children.dose_review_revision;
    if (revisions.has(row.child_id) && revisions.get(row.child_id) !== revision)
      throw Object.assign(new Error('Dose history changed during screening.'), { code: 'review_snapshot_changed' });
    revisions.set(row.child_id, revision);
  }
  // I-match bawat active finding sa pinakahuling saved review event niya.
  const states = screenDoseRecords(records, today).map((finding) => {
    const { childId, vaccineId, issueType, doses } = finding;
    const revision = revisions.get(childId);
    const findingKey = digest([childId, vaccineId, issueType, doses]);
    // Child revision ay pang-transaction lock lang; yung review decision naka-tie sa actual evidence dates na 'to.
    const version = digest([findingKey, finding.recordIds.map((id) => [id, dates.get(id)])]);
    const current = latest.get(findingKey);
    latest.delete(findingKey);
    const matches = current?.version === version;
    // Panatilihin yung dating status kapag hindi nagbago yung evidence O kapag open escalation pa siya.
    const retain = matches || current?.status === 'escalated';
    return { finding: {
      ...prioritizeFinding(finding), findingKey, version,
      reviewStatus: retain ? current.status : 'pending',
      eventId: retain ? current.event_id : null,
      reassessed: Boolean(current && !matches),
    }, revision };
  });
  // Yung natirang 'escalated' events ay wala na sa bagong screening (malamang na-correct na yung record).
  // Ipakita pa rin sila na may screeningCleared: true para ma-review at ma-close ng midwife.
  for (const event of latest.values()) {
    if (event.status !== 'escalated') continue;
    const revision = revisions.get(event.child_id) ?? event.dose_review_revision;
    const version = digest(['cleared', event.finding_key, event.record_ids.map((id) => [id, dates.get(id)])]);
    states.push({ revision, finding: {
      findingKey: event.finding_key, version, childId: event.child_id, vaccineId: event.vaccine_id,
      issueType: event.issue_type, explanationCode: 'screening_cleared', recordIds: event.record_ids,
      doses: [], reviewStatus: 'escalated', eventId: event.event_id, screeningCleared: true,
      message: 'The original issue is no longer detected. A midwife must review the correction and close the escalation.',
      priority: 'high', priorityReason: 'An earlier escalation still requires a midwife decision.',
    } });
  }
  return states;
}

// Kinukuha yung latest review events at dose records sa Supabase tapos binabalik yung tracked review states.
// Inputs: today (YYYY-MM-DD), optional childId + findingKey kapag single-finding transition check lang.
// Output: Promise ng trackedStates(records, events, today).
// Debugging tip: gamit 'to ng GET /review-findings (buong clinic) at POST /review-transition (isang finding).
async function getTrackingStates(today, childId, findingKey) {
  const events = await readPages(() => {
    const query = supabase.from('immunization_review_latest')
      .select('finding_key, version, status, event_id, child_id, vaccine_id, issue_type, record_ids, dose_review_revision')
      .order('finding_key');
    return childId ? query.eq('child_id', childId).eq('finding_key', findingKey) : query;
  });
  const records = await readDoseRecords({ childId, tracking: true });
  return trackedStates(records, events, today);
}

module.exports = { getTrackingStates, readDoseRecords };

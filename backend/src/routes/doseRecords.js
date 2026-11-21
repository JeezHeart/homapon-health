/*
 * GABAY SA FILE: Immunization Dose Records & Review Worklist API (backend/src/routes/doseRecords.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Naka-mount sa /api/dose-records (may requireAuth). Dalawang magkakabit na area ang hawak nito:
 *   1. Completed immunization dose CRUD (GET /, POST /, PUT /:id, DELETE /:id) na may
 *      duplicate-dose prevention at bawal baguhin ang record identity (hindi pwedeng
 *      palitan ang child, vaccine, o dose number sa PUT).
 *   2. Immunization screening at review workflow endpoints:
 *      - GET  /intervals          (per-child interval analysis)
 *      - GET  /review-findings    (clinic worklist + optional tracking at daily summary)
 *      - GET  /review-history     (naka-page na audit history ng isang finding)
 *      - POST /review-transition  (verified / escalated / resolved status changes na may optimistic locking)
 *      - POST /review-guidance    (AI-assisted o reference checklist/preparation worksheet)
 *
 * Mga madalas na bug / feature na dapat bantayan dito sa defense:
 *   - HTTP 409 sa POST / kapag may existing record na yung bata para sa same vaccine + doseNumber
 *   - HTTP 400 sa PUT /:id kapag sinubukan ng client na baguhin ang childId, vaccineId, o doseNumber
 *   - HTTP 409 sa POST /review-transition kapag nagbago na pala yung petsa o previous event mula nung ni-load sa screen
 *   - HTTP 403 kapag BHW ang nag-try mag-resolve o gumalaw ng escalated finding (Midwife-only kasi yun)
 */
const express = require('express');
const { supabase } = require('../db');
const { audit, requireMidwife } = require('../lib/auth');
const { reviewIntervals } = require('../lib/vaccinationIntervals');
const { screenDoseRecords, prioritizeFinding } = require('../lib/immunizationScreening');
const { getGuidance, isGuidanceIssue, prepareReview } = require('../lib/reviewGuidance');
const { getTrackingStates, readDoseRecords } = require('../lib/reviewTracking');
const { buildDailySummary } = require('../lib/dailyReviewSummary');
const {
  validateDose,
  todayLocalISO,
  isPlainObject,
  isUuid,
  isUniqueViolation,
  isForeignKeyViolation,
  isNotFoundError,
  asyncHandler,
} = require('../lib/validate');

const router = express.Router();
const DUPLICATE_MSG =
  'This dose is already recorded as completed for this child.';
// Mahigpit na hex/numeric regex para sa SHA-256 findingKey/version hashes at BIGINT review event IDs.
const REVIEW_KEY = /^[a-f0-9]{64}$/;
const REVIEW_EVENT_ID = /^[1-9][0-9]{0,18}$/;
const isReviewKey = (value) => typeof value === 'string' && REVIEW_KEY.test(value);
// Mga PostgreSQL/PostgREST error codes na nagsasabing hindi pa naka-migrate yung optional review-tracking tables/columns.
const isTrackingMissing = (error) => ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code);

// Security guard / RBAC + privacy middleware para sa review endpoints: Midwife o BHW lang ang pwede,
// at naka-Cache-Control: no-store para hindi ma-cache ng browser o proxy yung sensitibong clinical findings.
function requireReviewStaff(req, res, next) {
  if (!['midwife', 'bhw'].includes(req.staff?.role))
    return res.status(403).json({ ok: false, error: 'Staff access only.' });
  res.set('Cache-Control', 'no-store');
  next();
}

// Taga-convert ng snake_case `dose_records` DB row papuntang camelCase API format.
function toApi(r) {
  return {
    id: r.id,
    childId: r.child_id,
    vaccineId: r.vaccine_id,
    doseNumber: r.dose_number,
    dateAdministered: r.date_administered,
    healthWorker: r.health_worker,
    batchLot: r.batch_lot ?? undefined,
    remarks: r.remarks ?? undefined,
  };
}

// Kinukuha LANG yung mga editable correction fields (date, health worker, batch/lot, remarks) para sa PUT updates.
// Bakit mahalaga sa debugging: sinadyang tanggalin dito ang child_id, vaccine_id, at dose_number para
// hindi kailanman ma-overwrite yung clinical identity ng existing dose record kapag nag-edit.
function toCorrectionDb(b) {
  const row = {};
  if (b.dateAdministered !== undefined)
    row.date_administered = b.dateAdministered.trim();
  if (b.healthWorker !== undefined) row.health_worker = b.healthWorker.trim();
  if (b.batchLot !== undefined)
    row.batch_lot =
      b.batchLot && b.batchLot.trim() ? b.batchLot.trim() : null;
  if (b.remarks !== undefined)
    row.remarks = b.remarks && b.remarks.trim() ? b.remarks.trim() : null;
  return row;
}

// Kinukuha lahat ng fields ng dose record (identity + correction fields) para sa POST insert lang.
function toDb(b) {
  return {
    ...(b.childId !== undefined ? { child_id: b.childId.trim() } : {}),
    ...(b.vaccineId !== undefined ? { vaccine_id: b.vaccineId.trim() } : {}),
    ...(b.doseNumber !== undefined ? { dose_number: b.doseNumber } : {}),
    ...toCorrectionDb(b),
  };
}

// Duplicate guard bago mag-insert: chine-check kung may existing na (child_id, vaccine_id, dose_number) sa dose_records.
// Input: childId, vaccineId, doseNumber.
// Output: Promise<boolean> (true kapag may kapareho nang dose record).
// Bakit mahalaga sa debugging: para makapagbalik agad ng malinaw na HTTP 409 bago pa tumama sa DB unique constraint.
async function clash(childId, vaccineId, doseNumber) {
  const { count, error } = await supabase
    .from('dose_records')
    .select('id', { count: 'exact', head: true })
    .eq('child_id', childId.trim())
    .eq('vaccine_id', vaccineId.trim())
    .eq('dose_number', doseNumber);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// GET /api/dose-records — Kinukuha ang listahan ng dose records mula pinakabago (pwede i-filter gamit ?childId=<uuid>).
// Output: HTTP 200 { ok: true, records: [...] } o HTTP 400 kapag invalid ang childId.
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    let q = supabase
      .from('dose_records')
      .select('*')
      .order('date_administered', { ascending: false });
    if (req.query.childId !== undefined) {
      if (!isUuid(req.query.childId))
        return res.status(400).json({ ok: false, error: 'Invalid child ID.' });
      q = q.eq('child_id', req.query.childId.trim());
    }
    const { data, error } = await q;
    if (error) return next(error);
    res.json({ ok: true, records: data.map(toApi) });
  }),
);

// GET /api/dose-records/intervals?childId=<uuid> — Tinitingnan yung date at dose-interval checks para sa isang bata.
// Input: required na childId query param.
// Output: HTTP 200 { ok: true, intervals: [...], flags: [...] } o HTTP 400 kapag kulang/invalid ang childId.
router.get(
  '/intervals',
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.query.childId))
      return res.status(400).json({ ok: false, error: 'A valid child ID is required.' });
    const records = [];
    // Naka-paginate na stable order ang pagkuha para sigurado na buong history ng bata ang mare-review.
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('dose_records')
        .select('id, vaccine_id, dose_number, date_administered')
        .eq('child_id', req.query.childId.trim())
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (error) return next(error);
      records.push(...data);
      if (data.length < pageSize) break;
    }
    res.json({ ok: true, ...reviewIntervals(records) });
  }),
);

// GET /api/dose-records/review-findings — Clinic-wide na immunization screening worklist.
// Query flags: ?tracking=1 para isama ang naka-save na review statuses (may safe fallback kung wala pa yung DB migration);
//              ?summary=1 para isama ang daily review summary galing sa buildDailySummary().
// Output: HTTP 200 { ok: true, trackingAvailable?, findings: [...], summary? }.
router.get(
  '/review-findings',
  requireReviewStaff,
  asyncHandler(async (req, res, next) => {
    const today = todayLocalISO();
    const respond = async (findings, trackingAvailable) => res.json({
      ok: true,
      ...(req.query.tracking === '1' ? { trackingAvailable } : {}),
      findings,
      // Huwag isama sa daily active-findings count yung mga na-clear nang escalations.
      ...(req.query.summary === '1' ? { summary: await buildDailySummary(findings.filter((row) => !row.screeningCleared), trackingAvailable, today) } : {}),
    });
    let tracked;
    if (req.query.tracking === '1') {
      try {
        tracked = (await getTrackingStates(today)).map(({ finding }) => finding);
      } catch (error) {
        // Kapag wala pa yung tracking tables sa DB, mag-fallback sa untracked screening imbes na mag-crash ng HTTP 500.
        if (!isTrackingMissing(error)) return next(error);
      }
    }
    if (tracked) return respond(tracked, true);
    const records = await readDoseRecords();
    return respond(screenDoseRecords(records, today).map(prioritizeFinding), false);
  }),
);

// GET /api/dose-records/review-history — Kinukuha ang naka-page na review decision events (20 bawat page) para sa isang finding.
// Input: query params childId (UUID), findingKey (64-hex SHA-256), page (default '1').
// Output: HTTP 200 { ok: true, events: [...], hasMore: boolean } o HTTP 400 kapag invalid params.
router.get(
  '/review-history',
  requireReviewStaff,
  asyncHandler(async (req, res, next) => {
    const { childId, findingKey, page = '1' } = req.query;
    if (!isUuid(childId) || !isReviewKey(findingKey) ||
        typeof page !== 'string' || !/^[1-9][0-9]{0,4}$/.test(page))
      return res.status(400).json({ ok: false, error: 'Invalid review history request.' });
    const offset = (Number(page) - 1) * 20;
    // Kumuha ng 21 rows (offset..offset+20) para malaman agad kung may next page pa nang hindi na nagra-run ng hiwalay na COUNT query.
    const { data, error } = await supabase.from('immunization_review_events')
      .select('id::text, reviewer_name, reviewer_role, from_status, status, remarks, created_at')
      .eq('child_id', childId.trim()).eq('finding_key', findingKey)
      .order('id', { ascending: false }).range(offset, offset + 20);
    if (error) return next(error);
    res.json({ ok: true, events: data.slice(0, 20), hasMore: data.length > 20 });
  }),
);

// POST /api/dose-records/review-transition — Nagse-save ng staff review decision ('verified', 'escalated', o 'resolved').
// Input: { childId, findingKey, version, eventId (string | null), status, remarks? }.
// Output: HTTP 200 { ok: true, eventId, status }, HTTP 403 kapag bawal sa BHW (midwife-only), HTTP 409 kapag stale/luma na, HTTP 422 kapag bawal yung transition.
// Bakit mahalaga sa debugging: double-check sa evidence version, prior eventId, at child revision sa Node at sa
// `transition_immunization_review` PostgreSQL RPC para hindi magka-overwrite kapag sabay nag-edit ang dalawang staff.
router.post(
  '/review-transition',
  requireReviewStaff,
  asyncHandler(async (req, res, next) => {
    // Validation guard para sa body format, hashes, eventId, allowed status values, at haba/null-bytes ng remarks.
    if (!isPlainObject(req.body))
      return res.status(400).json({ ok: false, error: 'Invalid review request.' });
    const { childId, findingKey, version, eventId, status, remarks = '' } = req.body;
    if (!isUuid(childId) || !isReviewKey(findingKey) || !isReviewKey(version) ||
        (eventId !== null && (typeof eventId !== 'string' || !REVIEW_EVENT_ID.test(eventId))) ||
        !['verified', 'escalated', 'resolved'].includes(status) ||
        typeof remarks !== 'string' || remarks.length > 500 || remarks.includes('\0'))
      return res.status(400).json({ ok: false, error: 'Invalid review request.' });
    // Security guard / RBAC check: Midwife lang ang pwedeng mag-resolve ng escalation.
    if (status === 'resolved' && req.staff.role !== 'midwife')
      return res.status(403).json({ ok: false, error: 'Only midwives can resolve an escalation.' });

    const stale = () => res.status(409).json({ ok: false, error: 'The finding or review changed. Reload the worklist and try again.' });
    const id = childId.trim().toLowerCase();
    const today = todayLocalISO();
    // Basahin ulit yung current tracking state ng bata/finding para sure na fresh pa yung data na ginagalawan ng client.
    let match;
    try {
      match = (await getTrackingStates(today, id, findingKey))
        .find(({ finding }) => finding.findingKey === findingKey && finding.childId === id);
    } catch (error) {
      if (error.code === 'review_snapshot_changed') return stale();
      return next(error);
    }
    if (!match || match.finding.version !== version) return stale();
    const { finding, revision } = match;
    if (finding.eventId !== eventId) return stale();
    // Security guard / RBAC check: kapag escalated na yung finding, Midwife na lang ang pwedeng mag-transition nito.
    if (finding.reviewStatus === 'escalated' && req.staff.role !== 'midwife')
      return res.status(403).json({ ok: false, error: 'An escalated review requires a midwife.' });
    // I-run yung atomic state transition sa PostgreSQL na may optimistic locking sa revision at expected eventId.
    const { data, error } = await supabase.rpc('transition_immunization_review', {
      p_child: id, p_vaccine: finding.vaccineId, p_finding: findingKey, p_version: version,
      p_issue: finding.issueType, p_records: finding.recordIds, p_revision: revision,
      p_actor: req.staff.id, p_expected: eventId, p_status: status, p_remarks: remarks.trim(),
      p_clinic_date: today,
    });
    if (error) return next(error);
    if (data?.error === 'stale') return stale();
    if (data?.error === 'forbidden') return res.status(403).json({ ok: false, error: 'Review action is not authorized.' });
    if (data?.error === 'transition') return res.status(422).json({ ok: false, error: 'That status change is not available.' });
    if (!data?.eventId) return next(new Error('Review transition returned no event'));
    res.json({ ok: true, eventId: data.eventId, status: data.status });
  }),
);

// POST /api/dose-records/review-guidance — Nagbabalik ng review checklist o preparation worksheet para sa generic issueCode.
// Input: body na { issueCode, mode?: 'preparation' } LANG at walang query params (bawal magpasa ng patient data dito).
// Output: HTTP 200 { ok: true, guidance }, HTTP 403 kapag hindi staff, o HTTP 400 kapag may extra fields o invalid issue code.
router.post(
  '/review-guidance',
  asyncHandler(async (req, res) => {
    if (!['midwife', 'bhw'].includes(req.staff.role))
      return res.status(403).json({ ok: false, error: 'Staff access only.' });
    // Mahigpit na allowlist check: i-reject agad kapag may query string o ibang body keys para siguradong walang child/PII data na makakalusot.
    if (Object.keys(req.query).length || !isPlainObject(req.body) ||
        !Object.keys(req.body).every((key) => key === 'issueCode' || key === 'mode') ||
        (Object.hasOwn(req.body, 'mode') && req.body.mode !== 'preparation') || !isGuidanceIssue(req.body.issueCode))
      return res.status(400).json({ ok: false, error: 'Send a supported issue code and optional preparation mode.' });

    res.set('Cache-Control', 'no-store');
    const guidance = req.body.mode === 'preparation' ? prepareReview : getGuidance;
    res.json({ ok: true, guidance: await guidance(req.body.issueCode) });
  }),
);

// POST /api/dose-records — Nagre-record ng bagong naibigay na immunization dose.
// Input: JSON body na may childId, vaccineId, doseNumber, dateAdministered, healthWorker, optional batchLot/remarks.
// Output: HTTP 201 { ok: true, record }, HTTP 409 kapag meron na nung child+vaccine+dose na yun, o HTTP 400 kapag validation error / walang bata.
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const err = validateDose(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });
    if (
      await clash(req.body.childId, req.body.vaccineId, req.body.doseNumber)
    ) {
      return res.status(409).json({ ok: false, error: DUPLICATE_MSG });
    }
    const { data, error } = await supabase
      .from('dose_records')
      .insert(toDb(req.body))
      .select()
      .single();
    if (error) {
      if (isUniqueViolation(error))
        return res.status(409).json({ ok: false, error: DUPLICATE_MSG });
      if (isForeignKeyViolation(error))
        return res.status(400).json({ ok: false, error: 'Child not found.' });
      return next(error);
    }
    audit(req, 'create', 'dose_record', data.id);
    res.status(201).json({ ok: true, record: toApi(data) });
  }),
);

// PUT /api/dose-records/:id — Nag-aapply ng corrections sa non-identity fields lang ng existing dose record.
// Input: :id (UUID) at mga editable fields (dateAdministered, healthWorker, batchLot, remarks).
// Output: HTTP 200 { ok: true, record }, HTTP 400 kapag tinangkang palitan yung identity o invalid data, HTTP 404 kapag hindi mahanap.
// Bakit mahalaga sa debugging: pinoprotektahan nito ang immunization record integrity — bawal baguhin ang
// childId, vaccineId, o doseNumber sa existing record (i-delete na lang at gawa ng bago kung maling dose ang nai-log).
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.params.id))
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    if (!isPlainObject(req.body))
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid request body.' });
    const { data: current, error: fetchError } = await supabase
      .from('dose_records')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchError && !isNotFoundError(fetchError)) return next(fetchError);
    if (!current)
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    // Identity lock guard: i-reject agad kapag may nagtangkang magbago ng child, vaccine, o dose number.
    const changingChild =
      req.body.childId !== undefined &&
      (typeof req.body.childId !== 'string' ||
        req.body.childId.trim() !== current.child_id);
    const changingVaccine =
      req.body.vaccineId !== undefined &&
      (typeof req.body.vaccineId !== 'string' ||
        req.body.vaccineId.trim() !== current.vaccine_id);
    const changingDose =
      req.body.doseNumber !== undefined &&
      req.body.doseNumber !== current.dose_number;
    if (changingChild || changingVaccine || changingDose) {
      return res.status(400).json({
        ok: false,
        error:
          'Child, vaccine, and dose number cannot be changed on an existing dose record.',
      });
    }
    // I-validate yung merged record habang naka-lock yung original identity, tapos correction fields lang ang i-save sa DB.
    const merged = {
      ...toApi(current),
      ...req.body,
      id: current.id,
      childId: current.child_id,
      vaccineId: current.vaccine_id,
      doseNumber: current.dose_number,
    };
    const err = validateDose(merged);
    if (err) return res.status(400).json({ ok: false, error: err });
    const patch = toCorrectionDb(req.body);
    if (Object.keys(patch).length === 0)
      return res
        .status(400)
        .json({ ok: false, error: 'No fields provided to update.' });
    const { data, error } = await supabase
      .from('dose_records')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (isUniqueViolation(error))
        return res.status(409).json({ ok: false, error: DUPLICATE_MSG });
      if (isForeignKeyViolation(error))
        return res.status(400).json({ ok: false, error: 'Child not found.' });
      if (isNotFoundError(error))
        return res.status(404).json({ ok: false, error: 'Record not found.' });
      return next(error);
    }
    audit(req, 'update', 'dose_record', req.params.id);
    res.json({ ok: true, record: toApi(data) });
  }),
);

// DELETE /api/dose-records/:id — Nagde-delete ng dose record (Security guard / RBAC check: Midwife lang pwede).
// Output: HTTP 200 { ok: true }, HTTP 403 kapag hindi Midwife, o HTTP 404 kapag wala yung record.
router.delete(
  '/:id',
  requireMidwife,
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.params.id))
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    const { error, count } = await supabase
      .from('dose_records')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);
    if (error) return next(error);
    if (count === 0)
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    audit(req, 'delete', 'dose_record', req.params.id);
    res.json({ ok: true });
  }),
);

module.exports = router;

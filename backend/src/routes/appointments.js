/*
 * GABAY SA FILE: Vaccination Appointments CRUD API (backend/src/routes/appointments.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Naka-mount ito sa /api/appointments (may requireAuth muna bago makapasok).
 *   Dito naka-handle lahat ng route para sa pag-list, pag-schedule, pag-update
 *   (kasama ang rescheduling at follow-up status/notes), at pag-delete ng
 *   vaccination appointments ng bata sa `appointments` table, na may server-side
 *   validation at audit logging.
 *
 * Mga madalas na bug / feature na dapat bantayan dito sa defense:
 *   - HTTP 422 "Appointment date cannot be in the past" kapag gumawa o nag-move ng schedule sa nakaraang petsa
 *   - Pwedeng mag-update ng follow-up notes kahit lumipas na yung appointment date (lusot 'to kasi false ang isDateChange)
 *   - Palitan ng snake_case DB columns <-> camelCase API fields sa toApi() / toDb()
 */
const express = require('express');
const { supabase } = require('../db');
const { audit } = require('../lib/auth');
const {
  validateAppointment,
  isPlainObject,
  isUuid,
  isForeignKeyViolation,
  isNotFoundError,
  asyncHandler,
} = require('../lib/validate');

const router = express.Router();

// Taga-convert ng snake_case row galing Supabase `appointments` table papuntang camelCase JSON na inaasahan ng frontend.
// Input: r (DB row). Output: API appointment object (ginagawang undefined yung mga null na optional fields).
function toApi(r) {
  return {
    id: r.id,
    childId: r.child_id,
    vaccineId: r.vaccine_id,
    doseNumber: r.dose_number,
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time ?? undefined,
    scheduleExceptionReason: r.schedule_exception_reason ?? undefined,
    followUpStatus: r.follow_up_status ?? undefined,
    followUpNotes: r.follow_up_notes ?? undefined,
    followUpDate: r.follow_up_date ?? undefined,
  };
}

// Taga-convert ng camelCase req.body papuntang partial snake_case payload para sa DB insert/update.
// Input: b (validated req.body). Output: object na yung mga pinasa lang na fields ang laman, at null ang empty optional strings.
// Bakit mahalaga sa debugging: yung mga naka-lista lang na columns ang sina-save, para hindi makapag-inject ng kung anu-anong DB column ang client.
function toDb(b) {
  const row = {};
  if (b.childId !== undefined) row.child_id = b.childId.trim();
  if (b.vaccineId !== undefined) row.vaccine_id = b.vaccineId.trim();
  if (b.doseNumber !== undefined) row.dose_number = b.doseNumber;
  if (b.scheduleExceptionReason !== undefined)
    row.schedule_exception_reason = b.scheduleExceptionReason?.trim() || null;
  if (b.scheduledDate !== undefined)
    row.scheduled_date = b.scheduledDate.trim();
  if (b.scheduledTime !== undefined)
    row.scheduled_time =
      b.scheduledTime && b.scheduledTime.trim()
        ? b.scheduledTime.trim()
        : null;
  if (b.followUpStatus !== undefined)
    row.follow_up_status =
      b.followUpStatus && b.followUpStatus.trim()
        ? b.followUpStatus.trim()
        : null;
  if (b.followUpNotes !== undefined)
    row.follow_up_notes =
      b.followUpNotes && b.followUpNotes.trim()
        ? b.followUpNotes.trim()
        : null;
  if (b.followUpDate !== undefined)
    row.follow_up_date =
      b.followUpDate && b.followUpDate.trim() ? b.followUpDate.trim() : null;
  return row;
}

// GET /api/appointments — Kinukuha lahat ng appointments na naka-sort by scheduled_date (pwede i-filter gamit ?childId=<uuid>).
// Output: HTTP 200 { ok: true, appointments: [...] } o HTTP 400 kapag hindi valid UUID yung childId.
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    let q = supabase.from('appointments').select('*').order('scheduled_date');
    // Check muna kung valid UUID yung optional childId filter bago ipasa sa PostgreSQL.
    if (req.query.childId !== undefined) {
      if (!isUuid(req.query.childId))
        return res.status(400).json({ ok: false, error: 'Invalid child ID.' });
      q = q.eq('child_id', req.query.childId.trim());
    }
    const { data, error } = await q;
    if (error) return next(error);
    res.json({ ok: true, appointments: data.map(toApi) });
  }),
);

// POST /api/appointments — Nagse-schedule ng bagong vaccination appointment.
// Input: JSON body na may childId, vaccineId, doseNumber, scheduledDate, at optional time/follow-up fields.
// Output: HTTP 201 { ok: true, appointment }, HTTP 422 kapag past date, o HTTP 400 kapag may validation error / walang bata sa DB.
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const err = validateAppointment(req.body);
    if (err)
      return res
        .status(err === 'Appointment date cannot be in the past.' ? 422 : 400)
        .json({ ok: false, error: err });
    const { data, error } = await supabase
      .from('appointments')
      .insert(toDb(req.body))
      .select()
      .single();
    if (error) {
      if (isForeignKeyViolation(error))
        return res.status(400).json({ ok: false, error: 'Child not found.' });
      return next(error);
    }
    audit(req, 'create', 'appointment', data.id);
    res.status(201).json({ ok: true, appointment: toApi(data) });
  }),
);

// PUT /api/appointments/:id — Nag-uupdate ng existing appointment (reschedule, oras, o follow-up tracking).
// Input: :id (UUID) at partial JSON body.
// Output: HTTP 200 { ok: true, appointment }, HTTP 404 kapag hindi mahanap, HTTP 422 kapag ni-resched sa past date, o HTTP 400 sa mali-maling input.
// Bakit mahalaga sa debugging: pinagsasama muna yung bagong fields sa current DB row bago mag-validate,
// at tsaka lang hinihigpitan yung "not in the past" rule kapag talagang binago yung scheduledDate.
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.params.id))
      return res
        .status(404)
        .json({ ok: false, error: 'Appointment not found.' });
    if (!isPlainObject(req.body))
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid request body.' });
    // Kunin muna yung current appointment sa DB para ma-validate yung merged data at ma-check kung nagbago ba yung petsa.
    const { data: current, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchError && !isNotFoundError(fetchError)) return next(fetchError);
    if (!current)
      return res
        .status(404)
        .json({ ok: false, error: 'Appointment not found.' });
    const merged = { ...toApi(current), ...req.body };
    const isDateChange =
      typeof req.body.scheduledDate === 'string' &&
      req.body.scheduledDate.trim() !== current.scheduled_date;
    const err = validateAppointment(merged, !isDateChange);
    if (err)
      return res
        .status(err === 'Appointment date cannot be in the past.' ? 422 : 400)
        .json({ ok: false, error: err });
    const patch = toDb(req.body);
    if (Object.keys(patch).length === 0)
      return res
        .status(400)
        .json({ ok: false, error: 'No fields provided to update.' });
    const { data, error } = await supabase
      .from('appointments')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (isForeignKeyViolation(error))
        return res.status(400).json({ ok: false, error: 'Child not found.' });
      if (isNotFoundError(error))
        return res
          .status(404)
          .json({ ok: false, error: 'Appointment not found.' });
      return next(error);
    }
    audit(req, 'update', 'appointment', req.params.id);
    res.json({ ok: true, appointment: toApi(data) });
  }),
);

// DELETE /api/appointments/:id — Nagde-delete ng appointment gamit ang UUID at naglo-log sa audit trail.
// Output: HTTP 200 { ok: true } o HTTP 404 kapag invalid UUID o walang nahanap na row.
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.params.id))
      return res
        .status(404)
        .json({ ok: false, error: 'Appointment not found.' });
    const { error, count } = await supabase
      .from('appointments')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);
    if (error) return next(error);
    if (count === 0)
      return res
        .status(404)
        .json({ ok: false, error: 'Appointment not found.' });
    audit(req, 'delete', 'appointment', req.params.id);
    res.json({ ok: true });
  }),
);

module.exports = router;

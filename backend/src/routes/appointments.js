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

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    let q = supabase.from('appointments').select('*').order('scheduled_date');
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

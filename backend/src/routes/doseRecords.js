const express = require('express');
const { supabase } = require('../db');
const { audit, requireMidwife } = require('../lib/auth');
const {
  validateDose,
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

function toDb(b) {
  return {
    ...(b.childId !== undefined ? { child_id: b.childId.trim() } : {}),
    ...(b.vaccineId !== undefined ? { vaccine_id: b.vaccineId.trim() } : {}),
    ...(b.doseNumber !== undefined ? { dose_number: b.doseNumber } : {}),
    ...toCorrectionDb(b),
  };
}

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

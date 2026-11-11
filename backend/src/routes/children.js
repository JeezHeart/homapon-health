const express = require('express');
const { supabase } = require('../db');
const { audit, requireMidwife } = require('../lib/auth');
const { validateGrowth } = require('../lib/growth');
const {
  validateChild,
  isUuid,
  isNotFoundError,
  asyncHandler,
} = require('../lib/validate');

const router = express.Router();

function toApi(r) {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    birthDate: r.birth_date,
    sex: r.sex,
    guardian: r.guardian,
    guardianMobile: r.guardian_mobile,
    purok: r.purok ?? '',
    weightKg:
      r.weight_kg === null || r.weight_kg === undefined
        ? undefined
        : Number(r.weight_kg),
    notes: r.notes ?? undefined,
  };
}

function toDb(b) {
  const row = {};
  if (b.firstName !== undefined) row.first_name = b.firstName.trim();
  if (b.lastName !== undefined) row.last_name = b.lastName.trim();
  if (b.birthDate !== undefined) row.birth_date = b.birthDate.trim();
  if (b.sex !== undefined) row.sex = b.sex;
  if (b.guardian !== undefined) row.guardian = b.guardian.trim();
  if (b.guardianMobile !== undefined)
    row.guardian_mobile = b.guardianMobile.trim();
  if (b.purok !== undefined) row.purok = b.purok ? b.purok.trim() : '';
  if (b.weightKg !== undefined)
    row.weight_kg =
      b.weightKg === null ||
      b.weightKg === '' ||
      (typeof b.weightKg === 'string' && b.weightKg.trim() === '')
        ? null
        : Number(b.weightKg);
  if (b.notes !== undefined)
    row.notes = b.notes && b.notes.trim() ? b.notes.trim() : null;
  return row;
}

router.get(
  '/',
  asyncHandler(async (_req, res, next) => {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .order('last_name')
      .order('first_name');
    if (error) return next(error);
    res.json({ ok: true, children: data.map(toApi) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const err = validateChild(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });
    const measurement = req.body.initialMeasurement;
    if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement) ||
      measurement.weightKg === undefined || measurement.heightCm === undefined)
      return res.status(400).json({ ok: false, error: 'The first dated weight and length/height measurement is required.' });
    const growthError = validateGrowth(measurement, req.body.birthDate.trim());
    if (growthError) return res.status(422).json({ ok: false, error: growthError });
    const { data: result, error } = await supabase.rpc('register_child_with_growth', {
      p_child: { ...toDb(req.body), weight_kg: measurement.weightKg },
      p_measurement: measurement,
      p_staff: req.staff.id,
    });
    if (error && ['PGRST202', 'PGRST205'].includes(error.code))
      return res.status(503).json({ ok: false, error: 'Growth registration is not enabled yet. Complete the database setup before registering a child.' });
    if (error) return next(error);
    const data = result.child;
    audit(req, 'create', 'child', data.id);
    audit(req, 'create', 'growth-measurement', result.measurementId);
    res.status(201).json({ ok: true, child: toApi(data) });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.params.id))
      return res.status(404).json({ ok: false, error: 'Child not found.' });
    const err = validateChild(req.body, true);
    if (err) return res.status(400).json({ ok: false, error: err });
    const patch = toDb(req.body);
    if (Object.keys(patch).length === 0)
      return res
        .status(400)
        .json({ ok: false, error: 'No fields provided to update.' });
    const { data, error } = await supabase
      .from('children')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (isNotFoundError(error))
        return res.status(404).json({ ok: false, error: 'Child not found.' });
      return next(error);
    }
    audit(req, 'update', 'child', req.params.id);
    res.json({ ok: true, child: toApi(data) });
  }),
);

router.delete(
  '/:id',
  requireMidwife,
  asyncHandler(async (req, res, next) => {
    if (!isUuid(req.params.id))
      return res.status(404).json({ ok: false, error: 'Child not found.' });
    const { error, count } = await supabase
      .from('children')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);
    if (error) return next(error);
    if (count === 0)
      return res.status(404).json({ ok: false, error: 'Child not found.' });
    audit(req, 'delete', 'child', req.params.id);
    res.json({ ok: true });
  }),
);

module.exports = router;

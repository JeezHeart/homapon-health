const express = require('express');
const { supabase } = require('../db');
const { audit, requireMidwife } = require('../lib/auth');
const { isUuid, isPlainObject, isNotFoundError, isUniqueViolation, asyncHandler } = require('../lib/validate');
const { validateGrowth } = require('../lib/growth');
const router = express.Router();
const toApi = (r) => ({ id: r.id, childId: r.child_id, measuredOn: r.measured_on,
  weightKg: r.weight_kg == null ? undefined : Number(r.weight_kg),
  heightCm: r.height_cm == null ? undefined : Number(r.height_cm),
  position: r.position ?? undefined, oedema: r.oedema, notes: r.notes });

// Paginate to avoid silently truncating the dashboard at the default row cap.
router.get('/latest', asyncHandler(async (_req, res, next) => {
  const latest = new Map();
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from('growth_measurements').select('*')
      .order('id').range(start, start + pageSize - 1);
    if (error) return next(error);
    for (const row of data) {
      const previous = latest.get(row.child_id);
      if (!previous || row.measured_on > previous.measured_on) latest.set(row.child_id, row);
    }
    if (data.length < pageSize) break;
  }
  res.json({ ok: true, measurements: [...latest.values()].map(toApi) });
}));

// Mounted behind requireAuth. No direct browser table access.
router.get('/', asyncHandler(async (req, res, next) => {
  if (!isUuid(req.query.childId)) return res.status(400).json({ ok: false, error: 'Valid child ID required.' });
  const { data, error } = await supabase.from('growth_measurements').select('*')
    .eq('child_id', req.query.childId).order('measured_on');
  if (error) return next(error);
  res.json({ ok: true, measurements: data.map(toApi) });
}));

router.post('/', asyncHandler(async (req, res, next) => {
  const b = req.body;
  if (!isPlainObject(b) || !isUuid(b.childId)) return res.status(400).json({ ok: false, error: 'Valid child and measurement details required.' });
  const { data: child, error: childError } = await supabase.from('children').select('id, birth_date').eq('id', b.childId).single();
  if (childError && !isNotFoundError(childError)) return next(childError);
  if (!child) return res.status(404).json({ ok: false, error: 'Child not found.' });
  const invalid = validateGrowth(b, child.birth_date);
  if (invalid) return res.status(422).json({ ok: false, error: invalid });
  const { data, error } = await supabase.from('growth_measurements').insert({
    child_id: child.id, measured_on: b.measuredOn, weight_kg: b.weightKg ?? null,
    height_cm: b.heightCm ?? null, position: b.position ?? null, oedema: b.oedema,
    notes: b.notes.trim(), recorded_by: req.staff.id,
  }).select().single();
  if (isUniqueViolation(error)) return res.status(409).json({ ok: false, error: 'A measurement already exists for this child and date. Ask the midwife to review corrections.' });
  if (error) return next(error);
  audit(req, 'create', 'growth-measurement', data.id);
  res.status(201).json({ ok: true, measurement: toApi(data) });
}));

router.delete('/:id', requireMidwife, asyncHandler(async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid measurement ID.' });
  const { data, error } = await supabase.from('growth_measurements').delete().eq('id', req.params.id).select('id').single();
  if (isNotFoundError(error) || (!error && !data)) return res.status(404).json({ ok: false, error: 'Measurement not found.' });
  if (error) return next(error);
  audit(req, 'delete', 'growth-measurement', data.id);
  res.json({ ok: true });
}));
module.exports = router;

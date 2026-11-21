/*
 * GABAY SA FILE: Child Growth Measurements API (backend/src/routes/growth.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Naka-mount sa /api/growth-measurements (protected ng requireAuth). Dito kinukuha
 *   ang pinakabagong measurement per child para sa dashboard summary, buong growth
 *   timeline ng isang bata, pag-save ng bagong weight/height/oedema entry (isang
 *   measurement lang bawat bata kada petsa), at pag-delete (Midwife only).
 *
 * Mga madalas na bug / feature na dapat bantayan dito sa defense:
 *   - HTTP 422 validation errors (tinitingnan sa lib/growth.js laban sa birth_date ng bata)
 *   - HTTP 409 conflict kapag nag-save ng pangalawang measurement sa parehong bata at parehong petsa
 *   - HTTP 403 "Midwife access only" kapag BHW ang nag-try mag-delete ng growth measurement
 */
const express = require('express');
const { supabase } = require('../db');
const { audit, requireMidwife } = require('../lib/auth');
const { isUuid, isPlainObject, isNotFoundError, isUniqueViolation, asyncHandler } = require('../lib/validate');
const { validateGrowth } = require('../lib/growth');
const router = express.Router();

// Taga-convert ng snake_case `growth_measurements` DB row papuntang camelCase API object.
// Input: r (DB row). Output: measurement object na naka-number na yung weightKg/heightCm kapag meron.
const toApi = (r) => ({ id: r.id, childId: r.child_id, measuredOn: r.measured_on,
  weightKg: r.weight_kg == null ? undefined : Number(r.weight_kg),
  heightCm: r.height_cm == null ? undefined : Number(r.height_cm),
  position: r.position ?? undefined, oedema: r.oedema, notes: r.notes });

// GET /api/growth-measurements/latest — Kinukuha ang pinakabagong measurement ng bawat bata sa buong clinic.
// Output: HTTP 200 { ok: true, measurements: [...] }.
// Bakit mahalaga sa debugging: naka-paginate ito ng tig-500 rows para hindi maputol bigla yung dashboard data dahil sa row limit ng Supabase.
router.get('/latest', asyncHandler(async (_req, res, next) => {
  const latest = new Map();
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from('growth_measurements').select('*')
      .order('id').range(start, start + pageSize - 1);
    if (error) return next(error);
    // Itabi lang yung row na may pinakabagong measured_on ISO date para sa bawat child_id.
    for (const row of data) {
      const previous = latest.get(row.child_id);
      if (!previous || row.measured_on > previous.measured_on) latest.set(row.child_id, row);
    }
    if (data.length < pageSize) break;
  }
  res.json({ ok: true, measurements: [...latest.values()].map(toApi) });
}));

// GET /api/growth-measurements?childId=<uuid> — Kinukuha lahat ng measurements ng isang bata na naka-sort chronologically.
// Naka-mount sa likod ng requireAuth — walang direct browser access sa DB table.
// Output: HTTP 200 { ok: true, measurements: [...] } o HTTP 400 kapag kulang/invalid yung childId.
router.get('/', asyncHandler(async (req, res, next) => {
  if (!isUuid(req.query.childId)) return res.status(400).json({ ok: false, error: 'Valid child ID required.' });
  const { data, error } = await supabase.from('growth_measurements').select('*')
    .eq('child_id', req.query.childId).order('measured_on');
  if (error) return next(error);
  res.json({ ok: true, measurements: data.map(toApi) });
}));

// POST /api/growth-measurements — Nagre-record ng bagong growth measurement para sa existing na bata.
// Input: JSON body na may childId, measuredOn, weightKg?, heightCm?, position?, oedema, notes.
// Output: HTTP 201 { ok: true, measurement }, HTTP 400 sa maling childId, HTTP 404 kung wala yung bata, HTTP 422 sa invalid values, HTTP 409 sa same-day duplicate.
router.post('/', asyncHandler(async (req, res, next) => {
  const b = req.body;
  if (!isPlainObject(b) || !isUuid(b.childId)) return res.status(400).json({ ok: false, error: 'Valid child and measurement details required.' });
  // Kunin muna yung birth_date ng bata para ma-reject ng validateGrowth kung mas maaga pa sa kapanganakan yung petsa ng sukat.
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
  // Isang measurement lang bawat bata kada petsa — naka-enforce 'to ng DB unique constraint.
  if (isUniqueViolation(error)) return res.status(409).json({ ok: false, error: 'A measurement already exists for this child and date. Ask the midwife to review corrections.' });
  if (error) return next(error);
  audit(req, 'create', 'growth-measurement', data.id);
  res.status(201).json({ ok: true, measurement: toApi(data) });
}));

// DELETE /api/growth-measurements/:id — Nagde-delete ng growth measurement (Security guard / RBAC check: Midwife lang pwede).
// Output: HTTP 200 { ok: true }, HTTP 400 sa invalid UUID, HTTP 403 kapag hindi Midwife, o HTTP 404 kapag hindi mahanap.
router.delete('/:id', requireMidwife, asyncHandler(async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid measurement ID.' });
  const { data, error } = await supabase.from('growth_measurements').delete().eq('id', req.params.id).select('id').single();
  if (isNotFoundError(error) || (!error && !data)) return res.status(404).json({ ok: false, error: 'Measurement not found.' });
  if (error) return next(error);
  audit(req, 'delete', 'growth-measurement', data.id);
  res.json({ ok: true });
}));
module.exports = router;

/*
 * GABAY SA FILE: Child Registry CRUD API (backend/src/routes/children.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Naka-mount ito sa /api/children (protected ng requireAuth). Dito naka-handle
 *   ang pag-list ng mga rehistradong bata, pag-register ng bagong bata sabay ng
 *   una nilang growth measurement sa isang bagsakan/atomic transaction (gamit ang
 *   `register_child_with_growth` PostgreSQL RPC), pag-update ng child profile, at
 *   pag-delete ng bata (Midwife only).
 *
 * Mga madalas na bug / feature na dapat bantayan dito sa defense:
 *   - HTTP 400/422 sa registration kapag kulang o invalid yung initialMeasurement (dapat parehong may weightKg at heightCm)
 *   - HTTP 503 "Growth registration is not enabled yet" kapag nakalimutang i-run yung SQL migration para sa register_child_with_growth
 *   - HTTP 403 "Midwife access only" kapag BHW ang nag-try mag-DELETE ng bata
 */
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

// Taga-convert ng snake_case row galing Supabase `children` table papuntang camelCase JSON para sa frontend.
// Input: r (DB row). Output: API child object na naka-number na yung weightKg kapag meron.
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

// Taga-convert ng camelCase req.body papuntang partial snake_case payload para sa DB insert/update.
// Input: b (validated req.body). Output: object na puro allowlisted child columns lang ang laman.
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

// GET /api/children — Kinukuha lahat ng bata na naka-sort alphabetically by last_name, tapos first_name.
// Output: HTTP 200 { ok: true, children: [...] }.
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

// POST /api/children — Nagre-register ng bagong bata kasabay ng required nilang unang growth measurement.
// Input: JSON child profile + initialMeasurement ({ measuredOn, weightKg, heightCm, position, oedema, notes }).
// Output: HTTP 201 { ok: true, child }, HTTP 400/422 kapag bagsak sa validation, o HTTP 503 kapag wala pa yung DB RPC.
// Bakit mahalaga sa debugging: isang atomic PostgreSQL RPC lang ang gamit para sure na walang batang mare-register nang walang baseline growth row.
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const err = validateChild(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });
    // Kailangan parehong may weight at length/height sa unang baseline measurement.
    const measurement = req.body.initialMeasurement;
    if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement) ||
      measurement.weightKg === undefined || measurement.heightCm === undefined)
      return res.status(400).json({ ok: false, error: 'The first dated weight and length/height measurement is required.' });
    const growthError = validateGrowth(measurement, req.body.birthDate.trim());
    if (growthError) return res.status(422).json({ ok: false, error: growthError });
    // Sabay na ise-save yung child row at initial growth_measurements row sa iisang DB transaction.
    const { data: result, error } = await supabase.rpc('register_child_with_growth', {
      p_child: { ...toDb(req.body), weight_kg: measurement.weightKg },
      p_measurement: measurement,
      p_staff: req.staff.id,
    });
    // Magbalik ng malinaw na HTTP 503 kapag hindi pa naka-apply sa DB yung SQL migration ng register_child_with_growth.
    if (error && ['PGRST202', 'PGRST205'].includes(error.code))
      return res.status(503).json({ ok: false, error: 'Growth registration is not enabled yet. Complete the database setup before registering a child.' });
    if (error) return next(error);
    const data = result.child;
    audit(req, 'create', 'child', data.id);
    audit(req, 'create', 'growth-measurement', result.measurementId);
    res.status(201).json({ ok: true, child: toApi(data) });
  }),
);

// PUT /api/children/:id — Partial update ng profile details ng existing na bata.
// Input: :id (UUID) at mga child fields na babaguhin sa req.body.
// Output: HTTP 200 { ok: true, child }, HTTP 400 kapag invalid o walang field na pinasa, o HTTP 404 kapag wala yung bata.
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

// DELETE /api/children/:id — Permanenteng nagde-delete ng child record (Security guard / RBAC check: Midwife lang pwede).
// Output: HTTP 200 { ok: true }, HTTP 403 kapag hindi Midwife, o HTTP 404 kapag hindi mahanap.
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

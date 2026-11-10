const express = require('express');
const { supabase } = require('../db');
const { audit } = require('../lib/auth');
const { composeMessage, normalizeNumber, prepareSmsSend } = require('../lib/sms');
const { createSmsRateLimit } = require('../lib/smsRateLimit');
const { reserveSms, beginDispatch, finishReservation } = require('../lib/smsReservations');
const {
  validateSms,
  todayLocalISO,
  isPlainObject,
  isBlank,
  isUuid,
  isForeignKeyViolation,
  isNotFoundError,
  asyncHandler,
} = require('../lib/validate');

const router = express.Router();
const consumeLiveSend = createSmsRateLimit();

function toApi(r) {
  return {
    id: r.id,
    childId: r.child_id,
    message: r.message,
    sentAt: r.sent_at,
    status: r.status,
    provider: r.provider ?? null,
    providerId: r.provider_id ?? null,
    deliveryStatus: r.delivery_status ?? (r.status.startsWith('Demo') ? 'demo' : 'legacy_unknown'),
  };
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    let q = supabase
      .from('sms_log')
      .select('*')
      .order('sent_at', { ascending: false });
    if (req.query.childId !== undefined) {
      if (!isUuid(req.query.childId))
        return res.status(400).json({ ok: false, error: 'Invalid child ID.' });
      q = q.eq('child_id', req.query.childId.trim());
    }
    const { data, error } = await q;
    if (error) return next(error);
    res.json({ ok: true, log: data.map(toApi) });
  }),
);

// Real send via the protected backend (Phase 5). The server composes
// the fixed template itself — the client only names child+appointment.
// Live sends require a durable reservation before external submission.
router.post(
  '/send',
  asyncHandler(async (req, res, next) => {
    if (!isPlainObject(req.body))
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid request body.' });
    const { childId, appointmentId } = req.body;
    if (isBlank(childId))
      return res.status(400).json({ ok: false, error: 'Child is required.' });
    if (!isUuid(childId))
      return res.status(400).json({ ok: false, error: 'Invalid child ID.' });
    if (isBlank(appointmentId))
      return res.status(400).json({
        ok: false,
        error: 'Appointment is required to compose the reminder.',
      });
    if (!isUuid(appointmentId))
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid appointment ID.' });

    const cleanChildId = childId.trim();
    const cleanApptId = appointmentId.trim();

    const { data: child, error: childError } = await supabase
      .from('children')
      .select('*')
      .eq('id', cleanChildId)
      .single();
    if (childError && !isNotFoundError(childError)) return next(childError);
    if (!child)
      return res.status(404).json({ ok: false, error: 'Child not found.' });

    const { data: appt, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', cleanApptId)
      .single();
    if (apptError && !isNotFoundError(apptError)) return next(apptError);
    if (!appt || appt.child_id !== cleanChildId)
      return res
        .status(404)
        .json({ ok: false, error: 'Appointment not found for this child.' });

    const message = composeMessage(
      `${child.first_name} ${child.last_name}`,
      appt.scheduled_date,
      appt.scheduled_time,
    );
    const to = normalizeNumber(child.guardian_mobile);
    const prepared = prepareSmsSend();
    async function logAttempt(status, deliveryStatus) {
      const { data, error } = await supabase
        .from('sms_log')
        .insert({
          child_id: cleanChildId,
          message,
          sent_at: todayLocalISO(),
          status,
          delivery_status: deliveryStatus,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      audit(req, 'send-sms', 'sms', data.id);
      return data;
    }

    if (!to) {
      const entry = await logAttempt(prepared.dryRun ? 'Demo failed' : 'Not sent', prepared.dryRun ? 'demo' : 'not_sent');
      return res.status(422).json({
        ok: false,
        error: 'Guardian mobile number is invalid. Fix it in the child record.',
        entry: toApi(entry),
      });
    }

    if (prepared.dryRun) {
      const entry = await logAttempt('Demo sent', 'demo');
      return res.status(201).json({
        ok: true, entry: toApi(entry),
        provider: { name: prepared.provider, dryRun: true, providerId: null },
      });
    }
    if (prepared.error) return res.status(503).json({
      ok: false, code: 'SMS_NOT_CONFIGURED', error: prepared.error,
    });

    try {
      const claim = await reserveSms(appt, req.staff.id, to, message, prepared.provider);
      if (claim.kind === 'replayed') return res.status(200).json({
        ok: true, replayed: true, entry: toApi(claim.entry),
        provider: { name: claim.provider, dryRun: false, providerId: claim.providerId },
      });
      if (claim.kind === 'blocked') return res.status(409).json({
        ok: false, code: 'SMS_ALREADY_RESERVED', reservationState: claim.state,
        error: 'This reminder is already accepted or reserved. Check its outcome before sending again.',
      });
      if (claim.kind !== 'claimed' || !claim.reservation) throw new Error('Invalid claim result');
      const reservation = claim.reservation;
      const retryAfter = consumeLiveSend(req.staff.id);
      if (retryAfter) {
        await finishReservation(reservation, 'not_sent');
        res.set('Retry-After', String(retryAfter));
        res.append('Access-Control-Expose-Headers', 'Retry-After');
        return res.status(429).json({
          ok: false,
          error: 'Too many SMS attempts. Please wait before trying again.',
        });
      }
      // A lost/ambiguous marker response must not authorize a provider call.
      if (await beginDispatch(reservation) !== true) throw new Error('Dispatch not authorized');
      let result;
      try {
        result = await prepared.send({ to: reservation.recipient, message: reservation.message });
      } catch {
        result = { outcome: 'unknown' };
      }
      const accepted = result.outcome === 'accepted' && !!result.providerId;
      const entry = await finishReservation(reservation, accepted ? 'accepted' : 'unknown', result.providerId, result.providerStatus);
      audit(req, 'send-sms', 'sms', entry.id);
      if (!accepted) return res.status(502).json({
        ok: false, code: 'SMS_OUTCOME_UNKNOWN', entry: toApi(entry),
        error: 'SMS delivery is uncertain. Manual reconciliation is required; do not resend.',
      });
      return res.status(201).json({
        ok: true, entry: toApi(entry),
        provider: { name: reservation.provider, dryRun: false, providerId: result.providerId },
      });
    } catch {
      // Do not release here: the provider or a DB commit may already have succeeded.
      return res.status(503).json({
        ok: false, code: 'SMS_RESERVATION_UNCERTAIN',
        error: 'Could not confirm the SMS reservation outcome. Check its state before resending.',
      });
    }
  }),
);

// Client-supplied demo log only. Real delivery must go through /send.
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!isPlainObject(req.body))
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid request body.' });
    const body = {
      ...req.body,
      sentAt:
        req.body.sentAt === undefined ? todayLocalISO() : req.body.sentAt,
    };
    const err = validateSms(body);
    if (err) return res.status(400).json({ ok: false, error: err });
    const { data, error } = await supabase
      .from('sms_log')
      .insert({
        child_id: body.childId.trim(),
        message: body.message.trim(),
        sent_at: body.sentAt.trim(),
        status: body.status.trim(),
        delivery_status: 'demo',
      })
      .select()
      .single();
    if (error) {
      if (isForeignKeyViolation(error))
        return res.status(400).json({ ok: false, error: 'Child not found.' });
      return next(error);
    }
    audit(req, 'log', 'sms', data.id);
    res.status(201).json({ ok: true, entry: toApi(data) });
  }),
);

module.exports = router;

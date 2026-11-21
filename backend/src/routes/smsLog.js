/*
 * GABAY SA FILE: SMS Reminder Dispatch & SMS Log API (backend/src/routes/smsLog.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Naka-mount sa /api/sms-log (protected ng requireAuth). Dito chine-check kung
 *   naka-enable ba ang SMS sending, nagli-list ng sent/demo SMS history, nagha-handle
 *   ng protected server-side SMS reminder dispatch (POST /send na may template composition,
 *   dry-run mode, durable DB reservations, per-staff rate limiting, at iProg SMS delivery),
 *   at tumatanggap ng demo-only log entries sa POST /.
 *
 * Mga madalas na bug / feature na dapat bantayan dito sa defense:
 *   - HTTP 503 SMS_DISABLED (kapag SMS_ENABLED=false) o SMS_NOT_CONFIGURED (kulang ng IPROG_API_TOKEN)
 *   - HTTP 422 SMS_MESSAGE_INVALID (lampas 160 GSM-7 units) o mali yung mobile number ng guardian
 *   - HTTP 409 SMS_ALREADY_RESERVED (hinaharang ng smsReservations.js ang dobleng live reminder)
 *   - HTTP 429 rate limit (lagpas 10 live SMS attempts/minute bawat staff member)
 *   - HTTP 502 SMS_OUTCOME_UNKNOWN / HTTP 503 SMS_RESERVATION_UNCERTAIN (bawal i-auto-resend; i-check muna manually)
 */
const express = require('express');
const { supabase } = require('../db');
const { audit } = require('../lib/auth');
const { composeMessage, smsMessageError, normalizeNumber, prepareSmsSend } = require('../lib/sms');
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
// Shared per-process sliding-window rate limiter (hanggang 10 live SMS attempts/min lang kada staff ID).
const consumeLiveSend = createSmsRateLimit();

// GET /api/sms-log/availability — Sinasabi sa frontend kung naka-enable ba ang SMS sending sa server config.
// Output: HTTP 200 { ok: true, enabled: boolean } (enabled maliban na lang kung SMS_ENABLED === 'false').
router.get('/availability', (_req, res) => {
  res.json({ ok: true, enabled: process.env.SMS_ENABLED !== 'false' });
});

// Taga-convert ng snake_case `sms_log` DB row papuntang camelCase API object.
// Input: r (DB row). Output: SMS log object na may legacy deliveryStatus fallback para sa mga lumang rows.
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

// GET /api/sms-log — Kinukuha ang SMS history mula pinakabago (pwede i-filter gamit ?childId=<uuid>).
// Output: HTTP 200 { ok: true, log: [...] } o HTTP 400 kapag hindi valid UUID ang childId.
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

// POST /api/sms-log/send — Server-composed appointment reminder send (demo dry-run o live iProg SMS).
// Real send na dumadaan sa protected backend (Phase 5). Server mismo ang bumubuo ng
// fixed template — childId at appointmentId lang ang pinapasa ng client.
// Kailangan muna ng durable DB reservation bago mag-call sa external provider kapag live send.
// Input: { childId, appointmentId }.
// Output: HTTP 201 (demo/accepted), HTTP 200 (idempotent replay), HTTP 400/404/409/422/429/502/503 sa mga guard/errors.
router.post(
  '/send',
  asyncHandler(async (req, res, next) => {
    // Global kill-switch guard: naka-block lahat ng sending habang pending pa ang approval ng sender name.
    if (process.env.SMS_ENABLED === 'false') return res.status(503).json({
      ok: false, code: 'SMS_DISABLED', error: 'SMS sending is disabled while sender-name approval is pending.',
    });
    // I-validate yung body shape at UUID format ng childId at appointmentId.
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

    // Kunin yung child record at i-verify kung nag-eexist yung appointment at talagang sa batang yun nakakabit.
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

    // Buuin at i-validate sa server yung fixed clinic reminder message, tapos i-normalize yung phone number at SMS config.
    const transactionDate = todayLocalISO();
    const message = composeMessage(
      child.guardian,
      `${child.first_name} ${child.last_name}`,
      appt.scheduled_date,
      appt.scheduled_time,
      transactionDate,
    );
    const messageError = smsMessageError(message);
    if (messageError) return res.status(422).json({ ok: false, code: 'SMS_MESSAGE_INVALID', error: messageError });
    const to = normalizeNumber(child.guardian_mobile);
    const prepared = prepareSmsSend();
    // Helper pang-log ng mga non-reserved attempts (demo sends at invalid-number failures) sa sms_log + audit trail.
    async function logAttempt(status, deliveryStatus) {
      const { data, error } = await supabase
        .from('sms_log')
        .insert({
          child_id: cleanChildId,
          message,
          sent_at: transactionDate,
          status,
          delivery_status: deliveryStatus,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      audit(req, 'send-sms', 'sms', data.id);
      return data;
    }

    // I-reject kapag invalid yung mobile number ng guardian, pero i-log pa rin yung failed attempt sa sms_log.
    if (!to) {
      const entry = await logAttempt(prepared.dryRun ? 'Demo failed' : 'Not sent', prepared.dryRun ? 'demo' : 'not_sent');
      return res.status(422).json({
        ok: false,
        error: 'Guardian mobile number is invalid. Fix it in the child record.',
        entry: toApi(entry),
      });
    }

    // Dry-run (demo) mode: i-log lang as 'Demo sent' nang hindi tumatawag sa paid external SMS gateway.
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

    // Flow ng live SMS: Mag-reserve muna -> Check rate limit -> Begin Dispatch -> Tawag sa iProg -> Tapusin ang Reservation.
    try {
      const claim = await reserveSms(appt, req.staff.id, to, message, prepared.provider);
      // Kapag na-accept na pala dati 'tong eksaktong reminder, ibalik na lang yung naka-save na result (idempotent replay).
      if (claim.kind === 'replayed') return res.status(200).json({
        ok: true, replayed: true, entry: toApi(claim.entry),
        provider: { name: claim.provider, dryRun: false, providerId: claim.providerId },
      });
      // Kapag may kasalukuyang nagse-send o alanganin ang state, i-block muna yung resend hanggang ma-check manually.
      if (claim.kind === 'blocked') return res.status(409).json({
        ok: false, code: 'SMS_ALREADY_RESERVED', reservationState: claim.state,
        error: 'This reminder is already accepted or reserved. Check its outcome before sending again.',
      });
      if (claim.kind !== 'claimed' || !claim.reservation) throw new Error('Invalid claim result');
      const reservation = claim.reservation;
      // I-check ang per-staff rate limit; kapag na-throttle, bitawan yung reservation as 'not_sent'.
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
      // Ilipat sa dispatching state yung reservation bago tumawag sa iProg.
      // Kapag malabo o nawala yung marker response, bawal tumuloy sa provider call.
      if (await beginDispatch(reservation) !== true) throw new Error('Dispatch not authorized');
      let result;
      try {
        result = await prepared.send({ to: reservation.recipient, message: reservation.message });
      } catch {
        result = { outcome: 'unknown' };
      }
      // I-save yung final outcome ('accepted' vs 'unknown') at isulat sa audit trail.
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
      // Huwag i-release dito: baka kasi pumasok na pala sa provider o na-commit na sa DB.
      return res.status(503).json({
        ok: false, code: 'SMS_RESERVATION_UNCERTAIN',
        error: 'Could not confirm the SMS reservation outcome. Check its state before resending.',
      });
    }
  }),
);

// POST /api/sms-log — Nagse-save ng client-supplied demo SMS log entry LANG ('Demo sent' / 'Demo failed').
// Ang totoong delivery dapat sa /send dumaan; naka-hardcode sa 'demo' yung delivery_status dito.
// Input: { childId, message, status, sentAt? }. Output: HTTP 201 { ok: true, entry } o HTTP 400.
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

/*
 * GABAY SA FILE: Pagbuo ng SMS Template, Validation, at iProg Gateway Client (backend/src/lib/sms.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Dito binubuo yung standard na Barangay Homapon appointment reminder text,
 *   tsine-check yung GSM-7 character at 160-unit single-SMS limit, nililinis yung
 *   Philippine mobile number (09XXXXXXXXX), binabasa yung SMS_DRY_RUN at IPROG_*
 *   config sa env, at dito nagpapadala ng live SMS request papuntang iProg SMS API
 *   nang walang automatic retry para iwas double-text.
 *
 * Madalas na bugs o features na dapat silipin dito (pang-debug sa defense):
 *   - Kung naka-demo/dry-run mode pa rin yung SMS sending (i-check kung SMS_DRY_RUN=false sa backend/.env)
 *   - 422 "Message exceeds the one-SMS limit" kapag lumagpas sa 160 GSM-7 units dahil mahaba pangalan ng guardian + bata
 *   - 422 invalid mobile number (dapat mag-normalize sa 11-digit na 09XXXXXXXXX)
 *   - 502 "SMS delivery is uncertain" kapag nag-timeout si iProg o nagbalik ng kakaibang status
 */
// iProg SMS sending (Phase 5). Sa backend/.env lang naka-save yung API keys — wag ilalagay sa frontend.
// Naka-DRY-RUN by default (log lang, walang totoong send) hangga't hindi pa approved yung live test.

// Reference template lang 'to para sa docs at tests (dapat kasya lagi sa 1 GSM-7 SMS).
const SMS_TEMPLATE = 'Good day [Guardian]! Brgy Homapon HC: [Child] has a vaccination on [Appt Date]. Bring the Brgy. Booklet. Thank you. (Ref: [Transaction Date])';

// Nililinis yung mga may accent (tulad ng ñ -> n), smart quotes, mahahabang dash, at kakaibang characters para maging plain ASCII.
// Input: value (string).
// Output: Malinis na single-line ASCII string na safe sa GSM-7 SMS encoding.
// Pang-debug tip: Importante 'to para hindi biglang mag-switch sa UCS-2 encoding yung SMS (kapag nag-UCS-2, babagsak sa 70 chars yung limit imbes na 160).
function normalizeSmsText(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ').replace(/[^\x20-\x7e]|`/gu, '?').trim();
}

// Binibilang kung ilang GSM-7 septet units ang kakainin ng message.
// Input: message (string).
// Output: Bilang ng GSM-7 units (basic chars = 1, extended chars = 2), o Infinity kapag may character na hindi pasok sa GSM-7.
// Pang-debug tip: Sinisigurado nito na hindi biglang mahahati sa 2 bayad na SMS segments yung reminder natin.
function smsUnits(message) {
  const basic = "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0";
  const extended = '^{}\\[~]|\u20ac\f';
  let units = 0;
  for (const char of message) {
    if (basic.includes(char)) units++;
    else if (extended.includes(char)) units += 2;
    else return Infinity;
  }
  return units;
}

// Chine-check kung hindi blanko yung SMS body, pasok sa GSM-7, at kasya sa isang 160-unit na SMS lang.
// Input: message (string).
// Output: Empty string '' kapag goods, o error message kung bakit naka-block yung pag-send.
function smsMessageError(message) {
  if (typeof message !== 'string' || !message.trim()) return 'Guardian name, child name, and valid dates/time are required.';
  const units = smsUnits(message);
  if (!Number.isFinite(units)) return 'Message contains unsupported SMS characters.';
  if (message.length > 160 || units > 160) return 'Message exceeds the one-SMS limit. Sending is blocked; full names will not be shortened.';
  return '';
}

// Gino-format yung strict YYYY-MM-DD na petsa para maging mas madaling basahin sa text (halimbawa: "May 5, 2026").
// Input: iso (string).
// Output: Short US-English date na naka-UTC, o '' kapag sablay o peke yung calendar date.
function smsDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Dito binubuo yung fixed na clinic reminder SMS mula sa details ng bata at appointment.
// Inputs: guardian, child, appointmentISO (YYYY-MM-DD), time (optional na HH:MM o HH:MM:00), transactionISO (YYYY-MM-DD).
// Output: Normalized reminder string, o '' kapag kulang o sablay yung required fields/date/time.
// Pang-debug tip: Sa server lang 'to tinatawag para hindi makapag-inject ng kung anu-anong custom SMS text galing sa client.
function composeMessage(guardian, child, appointmentISO, time, transactionISO) {
  let appointment = smsDate(appointmentISO);
  const transaction = smsDate(transactionISO);
  if (!guardian?.trim() || !child?.trim() || !appointment || !transaction) return '';
  if (time?.trim()) {
    // Kino-convert yung 24-hour time sa 12-hour AM/PM para madaling basahin ng magulang.
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time.trim())) return '';
    const [h, m] = time.trim().split(':').map(Number);
    appointment += ` at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return normalizeSmsText(`Good day ${guardian}! Brgy Homapon HC: ${child} has a vaccination on ${appointment}. Bring the Brgy. Booklet. Thank you. (Ref: ${transaction})`);
}

// Nililinis yung Philippine mobile number para maging standard 11-digit 09XXXXXXXXX format.
// Tumatanggap ng 09XXXXXXXXX, +639XXXXXXXXX, o kahit may spaces/dashes pa.
// Input: raw (string | number).
// Output: '09XXXXXXXXX' na string, o null kapag invalid yung number.
function normalizeNumber(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  if (n.startsWith('63') && n.length === 12) n = `0${n.slice(2)}`;
  if (!/^09\d{9}$/.test(n)) return null;
  return n;
}

// Kinukuha yung SMS provider credentials at dry-run setting mula sa environment variables (.env).
// Output: { key, configured, smsProvider, dryRun }.
// Pang-debug tip: Default ng SMS_DRY_RUN ay true maliban na lang kung explicitly naka-set sa "false".
function smsConfig() {
  const key = process.env.IPROG_API_TOKEN || process.env.IPROG_API_KEY || '';
  const rawRoute = process.env.IPROG_SMS_PROVIDER;
  const smsProvider = rawRoute !== undefined && String(rawRoute).trim() !== ''
    ? Number(rawRoute)
    : undefined;
  return {
    key,
    configured: !!key && !key.includes('paste-'),
    smsProvider: Number.isInteger(smsProvider) ? smsProvider : undefined,
    dryRun:
      String(process.env.SMS_DRY_RUN || 'true').toLowerCase() !== 'false',
  };
}

// Ibinabalik yung active na SMS gateway name ('iprog').
// Kapag SMS_DRY_RUN=true (default), naglo-log lang at hindi tatawag sa totoong iProg SMS gateway.
function activeProvider() {
  return 'iprog';
}

// Kino-convert yung local Philippine number (09XXXXXXXXX) papuntang international E.164 format (+639XXXXXXXXX).
function toIntlFormat(local09) {
  return `+63${local09.slice(1)}`;
}

// Kina-capture muna yung SMS config at nagbabalik ng ready-to-call sender object bago pa mag-reserve sa DB.
// Input: provider (default galing sa activeProvider()).
// Output: { provider, dryRun, send } O { provider, dryRun: false, error } kapag live mode pero walang API token.
// Pang-debug tip: Fini-freeze nito yung credentials bago mag-claim ng SMS reservation. Kapag nag-network error,
// timeout, walang message_id, o kakaibang status, outcome: 'unknown' agad (walang retry!) para hindi ma-spam ng
// duplicate text yung guardian.
function prepareSmsSend(provider = activeProvider()) {
  const config = smsConfig();
  if (config.dryRun) return {
    provider, dryRun: true,
    send: async () => ({ ok: true, outcome: 'demo', dispatched: false, dryRun: true, provider }),
  };
  if (!config.configured) return {
    provider, dryRun: false, error: 'SMS provider not configured.',
  };
  // Wag galawin basta-basta: naka-freeze na yung provider/credentials bago mag-reserve, at bawal i-retry 'tong POST.
  return {
    provider, dryRun: false,
    send: async ({ to, message }) => {
      // Huling safety check sa message bago natin i-hit yung paid SMS gateway.
      const error = smsMessageError(message);
      if (error) return { ok: false, outcome: 'not_sent', dispatched: false, dryRun: false, provider, error };
      let httpStatus = null;
      let providerId = null;
      let providerStatus = null;
      try {
        const payload = {
          api_token: config.key,
          phone_number: to,
          message,
          ...(config.smsProvider !== undefined ? { sms_provider: config.smsProvider } : {}),
        };
        const res = await fetch('https://sms.iprogtech.com/api/v1/sms_messages', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        httpStatus = res.status;
        const body = await res.json();
        // Sinasalo yung iba-ibang shape ng response ni iProg (pwedeng top-level object, body.data, o array[0]).
        const item = body && typeof body.data === 'object' && body.data !== null && !Array.isArray(body.data)
          ? body.data
          : Array.isArray(body) ? body[0] : body;
        const reference = body?.message_id ?? body?.messageId ?? item?.message_id ?? item?.messageId ?? item?.reference_id ?? item?.id;
        if (typeof reference === 'string' || typeof reference === 'number')
          providerId = String(reference).trim() || null;
        const rawStatus = item?.status ?? body?.status;
        providerStatus = typeof rawStatus === 'string'
          ? rawStatus.slice(0, 50)
          : typeof rawStatus === 'number'
            ? String(rawStatus)
            : null;
        // Hindi porket HTTP 200 o may reference ID ay sigurado nang tanggap yung text.
        // Yung documented non-failure statuses lang ang pasado; lahat ng iba kailangan ng manual check/reconciliation.
        const status = providerStatus?.trim().toLowerCase();
        const acceptable = ['200', 'success', 'queued', 'pending', 'sent'].includes(status);
        if (res.ok && providerId && acceptable) return {
          ok: true, outcome: 'accepted', dispatched: true, dryRun: false,
          provider, providerId, httpStatus, deliveryStatus: 'unconfirmed',
          providerStatus,
        };
      } catch {
        // Kahit nag-timeout o na-abort yung request, hindi natin sure kung natanggap pa rin ni iProg yung SMS.
      }
      return {
        ok: false, outcome: 'unknown', dispatched: true, dryRun: false,
        provider, providerId, providerStatus, httpStatus,
        error: 'SMS delivery is uncertain. Manual reconciliation is required; do not resend.',
      };
    },
  };
}

// Shortcut wrapper na nagpe-prepare at nagse-send ng SMS sa isang tawagan lang (madalas gamitin sa scripts at tests).
// Inputs: args ({ to, message }), optional provider name.
// Output: Standard result object na may { ok, outcome, dispatched, dryRun, provider, ... }.
async function sendSms(args, provider) {
  const prepared = prepareSmsSend(provider);
  if (prepared.error) return {
    ok: false, outcome: 'not_sent', dispatched: false, dryRun: false,
    provider: prepared.provider, error: prepared.error,
  };
  return prepared.send(args);
}

// Shorthand helper na rekta kay iProg SMS provider tumatawag.
const sendViaIprog = (args) => sendSms(args, 'iprog');

module.exports = {
  SMS_TEMPLATE,
  normalizeSmsText,
  smsUnits,
  smsMessageError,
  composeMessage,
  normalizeNumber,
  toIntlFormat,
  smsConfig,
  activeProvider,
  prepareSmsSend,
  sendViaIprog,
  sendSms,
};

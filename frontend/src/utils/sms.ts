/**
 * SMS reminder template builder, GSM-7 unit counter, at message validator.
 *
 * Dito binubuo yung official Barangay Homapon reminder text, nililinis sa GSM-7 safe
 * characters, chine-check kung pasok pa sa 160 GSM units para hindi ma-block o mag-split
 * sa dalawang text (hindi nito pinuputol yung full name), at kinukuha yung `Asia/Manila`
 * date para tugma sa backend.
 *
 * Tinatawag ito ng: `SmsDialog.tsx`, `BatchSmsDialog.tsx`, `ChildForm.tsx`,
 * `GrowthPanel.tsx`, at nire-re-export ng `data/mockData.ts`.
 */

/** Standard Barangay Homapon vaccination reminder template na pinapakita sa Settings at previews. */
export const SMS_TEMPLATE = 'Good day [Guardian]! Brgy Homapon HC: [Child] has a vaccination on [Appt Date]. Bring the Brgy. Booklet. Thank you. (Ref: [Transaction Date])';

/**
 * Nililinis yung raw text papuntang plain ASCII na safe sa GSM-7 SMS network.
 *
 * Input: kahit anong string (pwedeng may `ñ`, smart quotes, em-dash, o sobrang spaces).
 * Output: malinis at single-spaced na ASCII string.
 *
 * Edge cases na hawak nito:
 * - Tinatanggal yung accent marks via NFKD (hal. `ñ` -> `n`, `é` -> `e`).
 * - Pinapalitan yung curly quotes, en/em dashes, at ellipsis ng plain ASCII characters.
 * - Ginagawang `?` yung ibang non-ASCII chars at backticks para hindi biglang maging
 *   70-character Unicode (UCS-2) SMS na dobleng gastos.
 */
export function normalizeSmsText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ').replace(/[^\x20-\x7e]|`/gu, '?').trim();
}

/**
 * Binibilang kung ilang GSM units ang nagagamit ng isang SMS message.
 *
 * Input: SMS message string.
 * Output: total GSM units (`1` per basic character, `2` per extended character gaya ng `{`, `}`, `[`, `]`, `€`),
 * o `Infinity` kapag may character na wala sa GSM-7 alphabet.
 */
export function smsUnits(message: string): number {
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

/**
 * Chine-check nito kung valid at pasok pa sa 160 SMS units yung text bago i-send para hindi ma-block.
 *
 * Input: candidate SMS message string.
 * Output: `''` kapag okay na i-send, o error message na nagsasabi kung bakit naka-block.
 *
 * Business rules na pinapatupad:
 * - Bawal ang blank/empty text (kadalasan kulang yung pangalan o mali yung petsa).
 * - Bawal ang unsupported non-GSM-7 characters (`!Number.isFinite(units)`).
 * - Bina-block kapag lampas sa 160 chars o 160 GSM units—hindi nito shortcut-in yung pangalan ng bata/guardian.
 */
export function smsMessageError(message: string): string {
  if (typeof message !== 'string' || !message.trim()) return 'Guardian name, child name, and valid dates/time are required.';
  const units = smsUnits(message);
  if (!Number.isFinite(units)) return 'Message contains unsupported SMS characters.';
  if (message.length > 160 || units > 160) return 'Message exceeds the one-SMS limit. Sending is blocked; full names will not be shortened.';
  return '';
}

/**
 * Vina-validate yung ISO date (`YYYY-MM-DD`) at fino-format para sa SMS text gaya ng `"Nov 21, 2026"`.
 *
 * Input: `iso` date string.
 * Output: formatted UTC date string, o `''` kapag mali yung format o pekeng petsa (hal. `2026-02-30`).
 */
function smsDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Binubuo yung final normalized reminder SMS mula sa pangalan ng guardian, bata, appointment date/time, at ref date.
 *
 * Inputs:
 * - `guardian`: full name ng guardian.
 * - `child`: full name ni baby.
 * - `appointmentISO`: scheduled clinic ISO date (`YYYY-MM-DD`).
 * - `time`: optional 24-hour time (`HH:mm` o `HH:mm:00`).
 * - `transactionISO`: clinic reference ISO date (galing kadalasan sa `smsTodayISO()`).
 *
 * Output: normalized SMS text, o `''` kapag may kulang na required field o mali yung date/time format.
 *
 * Edge cases na hawak nito:
 * - Mahigpit na chine-check yung optional `time` (`00:00`–`23:59`, may optional `:00`) bago gawing 12-hour `AM/PM`.
 * - Pinapadaan sa `normalizeSmsText` para siguradong GSM-7 safe yung buong text.
 */
export function renderSmsMessage(guardian: string, child: string, appointmentISO: string, time: string | undefined, transactionISO: string): string {
  let appointment = smsDate(appointmentISO);
  const transaction = smsDate(transactionISO);
  if (!guardian?.trim() || !child?.trim() || !appointment || !transaction) return '';
  if (time?.trim()) {
    // I-reject agad yung maling time format para hindi magulo yung oras na matatanggap ng guardian.
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time.trim())) return '';
    const [h, m] = time.trim().split(':').map(Number);
    appointment += ` at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return normalizeSmsText(`Good day ${guardian}! Brgy Homapon HC: ${child} has a vaccination on ${appointment}. Bring the Brgy. Booklet. Thank you. (Ref: ${transaction})`);
}

/**
 * Kinukuha yung petsa ngayon (`YYYY-MM-DD`) sa Philippine time (`Asia/Manila`).
 * Sinisiguro nitong tugma yung clinic transaction date sa backend kahit anong timezone pa naka-set sa device.
 *
 * Output: ISO date string (`YYYY-MM-DD`) gamit ang `en-CA` locale dahil YYYY-MM-DD yung format nito.
 */
export function smsTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

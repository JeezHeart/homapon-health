/*
 * GABAY SA FILE: Per-Child Dose Date at Minimum-Interval Checker (backend/src/lib/vaccinationIntervals.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Sinisipat nito yung mga immunization dose records ng isang bata para i-check
 *   yung petsa ng bakuna (kulang, hindi ISO format, pekeng calendar date, o future date)
 *   at kino-compute yung pagitan ng araw sa magkasunod na dose ng parehong vaccine —
 *   nagfa-flag ito kapag nawawala yung naunang dose, baliktad yung petsa, sabay sa
 *   iisang araw, o mas maikli sa DOH 4-week (28-day) minimum para sa primary pentavalent series.
 *
 * Madalas na bugs o features na dapat silipin dito (pang-debug sa defense):
 *   - Unexpected flags sa GET /api/dose-records/intervals o sa screening worklist
 *   - Timezone edge cases malapit sa hatinggabi (naka-base sa Asia/Manila today yung comparison)
 *   - Kapag mag-a-update ng DOH minimum-interval rules (sa ngayon 'penta' doses 2 at 3 < 28 days ang chine-check)
 */
const { todayLocalISO } = require('./validate');

const DAY_MS = 86_400_000;
// Public reference URLs na naka-attach sa clinical interval flags para may mabasa agad yung health worker.
const DOH_REFERENCE =
  'https://doh.gov.ph/wp-content/uploads/2023/08/Booklet-4-Conducting-Immunization-Sessions.pdf#page=6';
const PENTA_REFERENCE =
  'https://hta.dost.gov.ph/wp-content/uploads/2025/05/Evidence-Considered-Tdap-Booster-Vaccine.pdf';
// Philippine DOH minimum interval para sa primary pentavalent doses 2 at 3 (4 weeks = 28 days).
const PENTA_MINIMUM_DAYS = 4 * 7;

// Chine-check yung dose_records ng isang bata kung tama yung petsa at tamang pagitan yung magkasunod na doses.
// Inputs:
//   - records: array ng dose rows para sa isang bata ({ id, vaccine_id, dose_number, date_administered })
//   - today: optional na YYYY-MM-DD clinic date (default yung petsa ngayon sa Pilipinas)
// Output: { intervals: [...], flags: [...] } kung saan nakalista sa intervals yung valid day gaps at sa flags yung mga sablay/anomalies.
// Pang-debug tip: Pure deterministic rule engine 'to na shared ng single-child /intervals endpoint at ng clinic-wide screening pipeline sa immunizationScreening.js.
function reviewIntervals(records, today = todayLocalISO()) {
  const intervals = [];
  const flags = [];
  const vaccines = new Map();

  // Pass 1: I-validate muna yung administration date ng bawat record tapos i-group yung doses by vaccine_id -> dose_number.
  for (const row of records) {
    const { id, vaccine_id: vaccineId, dose_number: dose, date_administered: date } = row;
    const missing = date == null || (typeof date === 'string' && !date.trim());
    const iso = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
    const timestamp = iso ? Date.parse(`${date}T00:00:00Z`) : NaN;
    let issue;
    if (missing) issue = ['missing_date', 'No administration date is recorded.'];
    else if (!iso) issue = ['ambiguous_date', 'Verify the administration date and record one date in YYYY-MM-DD format.'];
    else if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date)
      issue = ['invalid_date', 'The administration date is not a valid calendar date.'];
    else if (date > today) issue = ['future_date', 'The administration date is after today in Philippine time.'];

    if (issue) flags.push({ vaccineId, recordIds: [id], doses: [dose], code: issue[0], message: issue[1] });
    if (!vaccines.has(vaccineId)) vaccines.set(vaccineId, new Map());
    // Ginagawang null yung timestamp kapag sablay yung date para hindi mag-compute ng interval sa Pass 2 gamit ang maling petsa.
    vaccines.get(vaccineId).set(dose, { id, date, timestamp: issue ? null : timestamp });
  }

  // Pass 2: Sa bawat vaccine, i-sort yung doses mula pinakamababa pataas tapos ikumpara si dose N kay dose N-1.
  for (const [vaccineId, doses] of vaccines) {
    for (const [dose, current] of [...doses].sort(([a], [b]) => a - b)) {
      if (dose === 1) continue;
      const previous = doses.get(dose - 1);
      // Mag-flag kapag nawawala sa history ng bata yung mas naunang dose number.
      if (!previous) {
        flags.push({
          vaccineId, recordIds: [current.id], doses: [dose - 1, dose],
          code: 'prior_dose_not_recorded', message: `No record for dose ${dose - 1} was found in this history.`,
        });
        continue;
      }
      // Hindi pwedeng i-compute yung agwat ng araw kapag sablay yung petsa ng kahit alin sa dalawang dose.
      if (previous.timestamp === null || current.timestamp === null) continue;
      const days = (current.timestamp - previous.timestamp) / DAY_MS;
      const pair = { vaccineId, recordIds: [previous.id, current.id], doses: [dose - 1, dose] };
      // Mag-flag kapag baliktad yung petsa (mas maaga yung petsa ni dose N kaysa kay dose N-1).
      if (days < 0) {
        flags.push({ ...pair, code: 'reversed_dates', message: 'The later dose number has an earlier administration date.' });
        continue;
      }
      intervals.push({ ...pair, dates: [previous.date, current.date], days });
      // Mag-flag kapag binigay sa parehong araw yung magkasunod na dose, o kulang sa 28 days yung primary pentavalent doses.
      if (days === 0) {
        flags.push({
          ...pair, code: 'same_day_doses', message: 'Two consecutive doses of the same vaccine share an administration date. Verify both entries.',
          reference: DOH_REFERENCE,
        });
      } else if (vaccineId === 'penta' && dose <= 3 && days < PENTA_MINIMUM_DAYS) {
        flags.push({
          ...pair, code: 'below_minimum_interval', minimumDays: PENTA_MINIMUM_DAYS,
          message: 'The recorded gap is shorter than the DOH four-week minimum for the primary pentavalent series. Verify both entries.',
          reference: PENTA_REFERENCE,
        });
      }
    }
  }
  return { intervals, flags };
}

module.exports = { reviewIntervals };

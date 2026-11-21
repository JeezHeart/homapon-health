/**
 * WHO Child Growth Standards (0–60 months) z-score at indicator calculations.
 *
 * Ito yung nag-co-compute ng WHO weight/height z-score ni baby gamit ang WHO LMS
 * tables (Weight-for-Age, Length/Height-for-Age, at Weight-for-Length/Height).
 * Decision-support indicators at staff-review flags lang ito (hindi clinical diagnosis).
 *
 * Tinatawag ito ng: `GrowthPanel.tsx`, `GrowthSummary.tsx`, `utils/growthSummary.ts`,
 * `data/api.ts`, `data/mockData.ts`, `state/store.tsx`, `state/store-context.ts`.
 */
import reference from '../data/who-growth/reference.json';

/** Isang naka-record na weight/height measurement ng bata sa health center. */
export interface GrowthMeasurement {
  id: string;
  childId: string;
  measuredOn: string;
  weightKg?: number;
  heightCm?: number;
  position?: 'lying' | 'standing';
  oedema: 'unknown' | 'no' | 'yes';
  notes: string;
}

/** Payload kapag magsa-save ng bagong growth measurement bago bigyan ng `id` ng server. */
export type NewGrowthMeasurement = Omit<GrowthMeasurement, 'id'>;

/** Tatlong WHO indicators na suportado: weight-for-age, height-for-age, at weight-for-length/height (`proportion`). */
export type GrowthMetric = 'weight' | 'height' | 'proportion';

/** WHO LMS parameters: Box-Cox power (`l`), median (`m`), at coefficient of variation (`s`). */
type LMS = { l: number; m: number; s: number };

// I-index agad bawat WHO reference table sa Map gamit yung key na "<sexId>:<daysOrCm>" para mabilis (O(1)) yung lookup.
const tables = Object.fromEntries(Object.entries(reference).map(([name, rows]) => [
  name, new Map(rows.map(([sex, key, l, m, s]) => [`${sex}:${key}`, { l, m, s }])),
]));

/**
 * Kino-compute yung eksaktong edad ni baby sa bilang ng araw mula birth date hanggang measurement date.
 *
 * Inputs: `birth` at `measured` sa ISO date (`YYYY-MM-DD`) format.
 * Output: bilang ng araw (negative kapag mas maaga yung `measured` sa `birth`; NaN kung invalid).
 *
 * Edge case: naka-UTC midnight (`T00:00:00Z`) pareho para hindi magka-decimal dahil sa DST.
 */
export function ageDays(birth: string, measured: string): number {
  return (Date.parse(`${measured}T00:00:00Z`) - Date.parse(`${birth}T00:00:00Z`)) / 86400000;
}

/**
 * Nag-a-apply ng official WHO 0.7 cm posture adjustment kapag hindi tugma sa edad yung sukat (nakahiga vs nakatayo).
 *
 * Rule ng WHO: nakahiga (lying) dapat kapag below 24 months (< 731 days), at nakatayo (standing)
 * kapag 24 months pataas (>= 731 days):
 * - Nakatayo pero < 731 days -> dagdag ng 0.7 cm para maging lying length equivalent.
 * - Nakahiga pero >= 731 days -> bawas ng 0.7 cm para maging standing height equivalent.
 *
 * Inputs: `row` measurement at edad ni baby sa `days`.
 * Output: adjusted height sa cm, o `undefined` kung walang naka-encode na `heightCm`.
 */
export function adjustedHeight(row: GrowthMeasurement, days: number): number | undefined {
  if (row.heightCm === undefined) return undefined;
  if (days < 731 && row.position === 'standing') return row.heightCm + 0.7;
  if (days >= 731 && row.position === 'lying') return row.heightCm - 0.7;
  return row.heightCm;
}

/**
 * Hinahanap (o ini-interpolate) yung WHO LMS reference parameters para sa isang metric.
 *
 * Inputs:
 * - `metric`: `'weight'`, `'height'`, o `'proportion'`.
 * - `sex`: `'Male'` o `'Female'`.
 * - `days`: whole-number age in days (dapat 0 hanggang < 60 WHO months, where 1 month = 30.4375 days).
 * - `height`: adjusted height sa cm (kailangan lang kapag `metric === 'proportion'`).
 *
 * Output: `{ l, m, s }` WHO LMS parameters, o `undefined` kapag labas sa 0–60 month WHO range.
 *
 * Edge cases na hawak nito:
 * - `wflanthro` (45–110 cm) yung gamit kapag < 731 days at `wfhanthro` (65–120 cm) kapag >= 731 days.
 * - Dahil by 0.1 cm yung step sa WHO table, nili-linear interpolate yung L, M, S kapag nasa gitna ng 0.1 cm yung height.
 */
export function growthReference(metric: GrowthMetric, sex: string, days: number, height?: number): LMS | undefined {
  // I-reject kapag hindi whole number yung days, negative, 60+ months na si baby, o invalid yung sex.
  if (!Number.isInteger(days) || days < 0 || days / 30.4375 >= 60 || !['Female', 'Male'].includes(sex)) return;
  const sexId = sex === 'Male' ? 1 : 2;
  if (metric !== 'proportion') return tables[metric === 'weight' ? 'weianthro' : 'lenanthro'].get(`${sexId}:${days}`);
  // Weight-for-length (< 2 yrs) ay 45–110 cm; weight-for-height (>= 2 yrs) ay 65–120 cm.
  if (height === undefined || height < (days < 731 ? 45 : 65) || height > (days < 731 ? 110 : 120)) return;
  const table = tables[days < 731 ? 'wflanthro' : 'wfhanthro'];
  // I-snap pababa sa pinakamalapit na 0.1 cm key (may maliit na epsilon laban sa floating-point glitch).
  const lower = Math.floor((height + 1e-8) * 10) / 10;
  const fraction = (height - lower) / 0.1;
  const a = table.get(`${sexId}:${lower}`);
  if (!a) return;
  if (Math.abs(fraction) < 1e-7) return a;
  // I-interpolate yung L, M, at S sa pagitan ng lower at upper 0.1 cm row.
  const b = table.get(`${sexId}:${Number((lower + 0.1).toFixed(1))}`);
  if (!b) return;
  return { l: a.l + fraction * (b.l - a.l), m: a.m + fraction * (b.m - a.m), s: a.s + fraction * (b.s - a.s) };
}

/**
 * Binaligtad na WHO LMS formula: kino-convert yung target z-score pabalik sa actual kg o cm.
 * Ginagamit ito pang-drawing ng reference curves sa chart at pang-compute ng ±3 SD tail adjustment.
 *
 * Inputs: `ref` WHO LMS parameters at target standard-deviation score `z`.
 * Output: expected weight (kg) o height (cm) sa z-score na iyon.
 */
export function referenceValue(ref: LMS, z: number): number {
  return ref.l === 0 ? ref.m * Math.exp(ref.s * z) : ref.m * (1 + ref.l * ref.s * z) ** (1 / ref.l);
}

/**
 * Kino-compute yung raw WHO LMS z-score para sa isang sukat, na may optional WHO outer-tail
 * adjustment para sa mga weight metrics na lampas sa ±3 SD.
 *
 * Inputs:
 * - `value`: naka-record na weight (kg) o adjusted height (cm).
 * - `ref`: WHO LMS parameters ng edad/height at sex ni baby.
 * - `adjusted`: `true` para sa weight-for-age at proportion (base sa WHO method, linear ang
 *   extrapolation kapag labas sa [-3, +3] SD gamit ang 2 SD–3 SD distance); `false` para sa height.
 *
 * Output: raw (hindi pa naka-round) z-score.
 */
export function growthScore(value: number, ref: LMS, adjusted: boolean): number {
  const z = ref.l === 0 ? Math.log(value / ref.m) / ref.s : ((value / ref.m) ** ref.l - 1) / (ref.l * ref.s);
  if (!adjusted || Math.abs(z) <= 3) return z;
  // WHO restricted tail formula para sa sobrang taas o sobrang babang timbang lampas ±3 SD.
  return z > 3
    ? 3 + (value - referenceValue(ref, 3)) / (referenceValue(ref, 3) - referenceValue(ref, 2))
    : -3 + (value - referenceValue(ref, -3)) / (referenceValue(ref, -2) - referenceValue(ref, -3));
}

/**
 * Sinusuri yung isang growth measurement laban sa WHO standards at nagbabalik ng rounded
 * z-score, guidance label, at `needsReview` flag para sa health worker.
 *
 * Inputs: `row` measurement, `birth` ISO date ng bata, `sex`, at `metric`.
 * Output: `{ label, score?, needsReview? }`.
 *
 * Edge cases na hawak nito:
 * - Hindi muna kino-compute yung weight at proportion kapag hindi confirmed `'no'` yung oedema
 *   (nakakadaya sa timbang yung pamamanas/swelling).
 * - Nagbibigay ng clear notice kapag kulang yung sukat, <= 0, o labas sa WHO reference range.
 * - Pina-flag yung imposible/implausible scores (`weight`: < -6 o > 5; `height`: |z| > 6; `proportion`: |z| > 5)
 *   para ma-double-check ng staff kung typo o maling unit yung na-encode.
 * - Pina-flag ng `needsReview: true` kapag valid pero nasa labas ng `[-2, +2]` SD range.
 */
export function growthIndicator(row: GrowthMeasurement, birth: string, sex: string, metric: GrowthMetric) {
  const days = ageDays(birth, row.measuredOn);
  const height = adjustedHeight(row, days);
  const value = metric === 'height' ? height : row.weightKg;
  // Kapag may pamamanas (o hindi pa na-assess yung oedema), hindi pwedeng pagkatiwalaan yung weight score.
  if (metric !== 'height' && row.oedema !== 'no') return { label: 'Weight indicator unavailable: swelling assessment needed.' };
  const ref = growthReference(metric, sex, days, height);
  if (!ref || value === undefined || value <= 0) return { label: 'Not available: missing measurements or outside reference range.' };
  // I-round sa 2 decimal places; naka-tail-adjusted yung WHO scoring kapag weight-based metric.
  const score = Math.round(growthScore(value, ref, metric !== 'height') * 100) / 100;
  // WHO plausibility bounds check para mahuli agad yung maling encode (hal. nagkapalit na digits).
  const suspect = metric === 'weight' ? score < -6 || score > 5 : Math.abs(score) > (metric === 'height' ? 6 : 5);
  if (!Number.isFinite(score) || suspect) return { needsReview: true, label: 'Check measurement: outside WHO plausibility limits.' };
  // I-map yung valid z-score sa decision-support bands (kapag labas sa ±2 SD, kailangan ng staff review).
  const label = score < -3 ? 'Very low compared with reference; staff review needed.'
    : score < -2 ? 'Below reference range; staff review needed.'
    : score > 2 ? 'Above reference range; staff review needed.' : 'Within reference range.';
  return { score, label, needsReview: score < -2 || score > 2 };
}

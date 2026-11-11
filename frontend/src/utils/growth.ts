import reference from '../data/who-growth/reference.json';

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
export type NewGrowthMeasurement = Omit<GrowthMeasurement, 'id'>;
export type GrowthMetric = 'weight' | 'height' | 'proportion';
type LMS = { l: number; m: number; s: number };
const tables = Object.fromEntries(Object.entries(reference).map(([name, rows]) => [
  name, new Map(rows.map(([sex, key, l, m, s]) => [`${sex}:${key}`, { l, m, s }])),
]));

export function ageDays(birth: string, measured: string): number {
  return (Date.parse(`${measured}T00:00:00Z`) - Date.parse(`${birth}T00:00:00Z`)) / 86400000;
}

export function adjustedHeight(row: GrowthMeasurement, days: number): number | undefined {
  if (row.heightCm === undefined) return undefined;
  if (days < 731 && row.position === 'standing') return row.heightCm + 0.7;
  if (days >= 731 && row.position === 'lying') return row.heightCm - 0.7;
  return row.heightCm;
}

export function growthReference(metric: GrowthMetric, sex: string, days: number, height?: number): LMS | undefined {
  if (!Number.isInteger(days) || days < 0 || days / 30.4375 >= 60 || !['Female', 'Male'].includes(sex)) return;
  const sexId = sex === 'Male' ? 1 : 2;
  if (metric !== 'proportion') return tables[metric === 'weight' ? 'weianthro' : 'lenanthro'].get(`${sexId}:${days}`);
  if (height === undefined || height < (days < 731 ? 45 : 65) || height > (days < 731 ? 110 : 120)) return;
  const table = tables[days < 731 ? 'wflanthro' : 'wfhanthro'];
  const lower = Math.floor((height + 1e-8) * 10) / 10;
  const fraction = (height - lower) / 0.1;
  const a = table.get(`${sexId}:${lower}`);
  if (!a) return;
  if (Math.abs(fraction) < 1e-7) return a;
  const b = table.get(`${sexId}:${Number((lower + 0.1).toFixed(1))}`);
  if (!b) return;
  return { l: a.l + fraction * (b.l - a.l), m: a.m + fraction * (b.m - a.m), s: a.s + fraction * (b.s - a.s) };
}

export function referenceValue(ref: LMS, z: number): number {
  return ref.l === 0 ? ref.m * Math.exp(ref.s * z) : ref.m * (1 + ref.l * ref.s * z) ** (1 / ref.l);
}

export function growthScore(value: number, ref: LMS, adjusted: boolean): number {
  const z = ref.l === 0 ? Math.log(value / ref.m) / ref.s : ((value / ref.m) ** ref.l - 1) / (ref.l * ref.s);
  if (!adjusted || Math.abs(z) <= 3) return z;
  return z > 3
    ? 3 + (value - referenceValue(ref, 3)) / (referenceValue(ref, 3) - referenceValue(ref, 2))
    : -3 + (value - referenceValue(ref, -3)) / (referenceValue(ref, -2) - referenceValue(ref, -3));
}

export function growthIndicator(row: GrowthMeasurement, birth: string, sex: string, metric: GrowthMetric) {
  const days = ageDays(birth, row.measuredOn);
  const height = adjustedHeight(row, days);
  const value = metric === 'height' ? height : row.weightKg;
  if (metric !== 'height' && row.oedema !== 'no') return { label: 'Weight indicator unavailable: swelling assessment needed.' };
  const ref = growthReference(metric, sex, days, height);
  if (!ref || value === undefined || value <= 0) return { label: 'Not available: missing measurements or outside reference range.' };
  const score = Math.round(growthScore(value, ref, metric !== 'height') * 100) / 100;
  const suspect = metric === 'weight' ? score < -6 || score > 5 : Math.abs(score) > (metric === 'height' ? 6 : 5);
  if (!Number.isFinite(score) || suspect) return { needsReview: true, label: 'Check measurement: outside WHO plausibility limits.' };
  const label = score < -3 ? 'Very low compared with reference; staff review needed.'
    : score < -2 ? 'Below reference range; staff review needed.'
    : score > 2 ? 'Above reference range; staff review needed.' : 'Within reference range.';
  return { score, label, needsReview: score < -2 || score > 2 };
}

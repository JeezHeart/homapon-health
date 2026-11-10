import model from '../data/recordReviewModel.json';
import type { DoseRecord } from '../data/mockData';

export const REVIEW_SERIES = ['penta', 'opv', 'pcv'] as const;
const averagePath = (n: number): number => n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + 0.5772156649015329) - 2 * (n - 1) / n;

// Exact Isolation Forest path-length scoring; parity checked against scikit-learn.
export function reviewScore(gaps: number[]): number {
  if (gaps.length !== 6 || gaps.some(x => !Number.isFinite(x) || x < 0)) throw new Error('Six valid date intervals are required.');
  let total = 0;
  for (const [left, right, feature, threshold, samples] of model.trees) {
    let node = 0, depth = 0;
    while (left[node] !== -1) {
      node = Math.fround(gaps[feature[node]]) <= threshold[node] ? left[node] : right[node];
      depth++;
    }
    total += depth + averagePath(samples[node]);
  }
  return 2 ** (-total / model.trees.length / averagePath(model.maxSamples));
}

export function reviewInputs(records: DoseRecord[], today: string) {
  const dates: string[] = [], problems: string[] = [];
  for (const vaccine of REVIEW_SERIES) for (const dose of [1, 2, 3]) {
    const matches = records.filter(r => r.vaccineId === vaccine && r.doseNumber === dose);
    const date = matches[0]?.dateAdministered ?? '';
    dates.push(date);
    if (matches.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > today) {
      problems.push(`${vaccine.toUpperCase()} dose ${dose}: missing, repeated, invalid, or future date.`);
    }
  }
  const gaps: number[] = [];
  for (let i = 0; i < 9; i += 3) for (let j = 0; j < 2; j++) {
    const gap = (Date.parse(dates[i+j+1]) - Date.parse(dates[i+j])) / 86400000;
    gaps.push(gap);
    if (gap < 0) problems.push(`${REVIEW_SERIES[i/3].toUpperCase()}: dose dates are out of order.`);
  }
  return { dates, gaps, problems };
}

export const reviewThreshold = -model.offset;
export const parityExamples = model.parityExamples;

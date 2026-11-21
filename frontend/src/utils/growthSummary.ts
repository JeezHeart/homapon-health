/**
 * Group summary ng growth screening para sa buong listahan ng mga bata.
 *
 * Dito kinukuha yung pinakabagong growth measurement ng bawat bata, chine-check
 * lahat ng tatlong WHO indicators, at pinapangkat sila sa malinaw na follow-up
 * buckets (`review`, `within`, `incomplete`, o `missing`).
 *
 * Tinatawag ito ng: `GrowthSummary.tsx`.
 */
import type { Child } from '../data/mockData';
import { growthIndicator } from './growth';
import type { GrowthMeasurement } from './growth';

/**
 * Screening bucket ng pinakabagong growth check ni baby:
 * - `review`: may kahit isang WHO indicator na labas sa [-2, +2] SD o lampas sa plausibility limits.
 * - `within`: lahat ng tatlong WHO indicators ay may valid score at pasok sa reference range.
 * - `incomplete`: may measurement at walang review flag, pero may metric na hindi ma-compute (hal. kulang sukat).
 * - `missing`: wala pang kahit anong growth measurement si baby.
 */
export type GrowthGroup = 'review' | 'within' | 'incomplete' | 'missing';

/**
 * Pina-partner bawat bata sa pinakabagong measurement nila at overall growth screening bucket.
 *
 * Inputs: listahan ng `children` at lahat ng naka-save na `measurements`.
 * Output: array ng `{ child, measurement, group }` na kapareho ng ayos ng `children`.
 *
 * Edge cases na hawak nito:
 * - Pinipili yung pinakabagong sukat per child gamit ang comparison ng ISO date (`measuredOn`).
 * - Inuuna yung `review` kaysa `incomplete` para hindi matabunan yung kailangan i-follow-up kahit kulang ibang metric.
 */
export function summarizeGrowth(children: Child[], measurements: GrowthMeasurement[]) {
  // Kunin lang yung pinakabagong measurement ng bawat bata (chronological yung ISO date strings).
  const latest = new Map<string, GrowthMeasurement>();
  for (const row of measurements) {
    const previous = latest.get(row.childId);
    if (!previous || row.measuredOn > previous.measuredOn) latest.set(row.childId, row);
  }
  return children.map((child) => {
    const measurement = latest.get(child.id);
    if (!measurement) return { child, measurement, group: 'missing' as GrowthGroup };
    // I-check yung weight-for-age, height-for-age, at proportion sa latest record ni baby.
    const indicators = (['weight', 'height', 'proportion'] as const).map((metric) => growthIndicator(measurement, child.birthDate, child.sex, metric));
    // Priority order: review flag muna, sunod incomplete, tapos within range kapag okay lahat.
    const group: GrowthGroup = indicators.some((i) => i.needsReview) ? 'review'
      : indicators.some((i) => i.score === undefined) ? 'incomplete' : 'within';
    return { child, measurement, group };
  });
}

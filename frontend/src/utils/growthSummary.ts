import type { Child } from '../data/mockData';
import { growthIndicator } from './growth';
import type { GrowthMeasurement } from './growth';

export type GrowthGroup = 'review' | 'within' | 'incomplete' | 'missing';
export function summarizeGrowth(children: Child[], measurements: GrowthMeasurement[]) {
  const latest = new Map<string, GrowthMeasurement>();
  for (const row of measurements) {
    const previous = latest.get(row.childId);
    if (!previous || row.measuredOn > previous.measuredOn) latest.set(row.childId, row);
  }
  return children.map((child) => {
    const measurement = latest.get(child.id);
    if (!measurement) return { child, measurement, group: 'missing' as GrowthGroup };
    const indicators = (['weight', 'height', 'proportion'] as const).map((metric) => growthIndicator(measurement, child.birthDate, child.sex, metric));
    const group: GrowthGroup = indicators.some((i) => i.needsReview) ? 'review'
      : indicators.some((i) => i.score === undefined) ? 'incomplete' : 'within';
    return { child, measurement, group };
  });
}

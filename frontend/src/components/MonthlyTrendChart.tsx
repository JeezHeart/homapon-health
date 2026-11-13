import { useState } from 'react';
import type { Appointment, DoseRecord } from '../data/mockData';
import { overviewMonths } from '../utils/dashboardOverview';
import { useChartWidth } from '../utils/useChartWidth';

export default function MonthlyTrendChart({ records, appointments }: { records: DoseRecord[]; appointments: Appointment[] }) {
  const buckets = overviewMonths(records, appointments);
  const [active, setActive] = useState<number | null>(null);
  const { ref: chartRef, width } = useChartWidth(720);
  const step = Math.max(1, Math.ceil(Math.max(1, ...buckets.flatMap((bucket) => [bucket.doses, bucket.appointments])) / 5));
  const maximum = step * 5;
  const height = 285;
  const left = 36; const right = width - 14; const top = 16; const bottom = height - 35;
  const x = (index: number) => left + index * (right - left) / (buckets.length - 1);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  function curve(metric: 'doses' | 'appointments') {
    return buckets.map((bucket, index) => {
      if (index === 0) return `M ${x(index)} ${y(bucket[metric])}`;
      const midpoint = (x(index - 1) + x(index)) / 2;
      return `C ${midpoint} ${y(buckets[index - 1][metric])}, ${midpoint} ${y(bucket[metric])}, ${x(index)} ${y(bucket[metric])}`;
    }).join(' ');
  }
  const selected = active === null ? null : buckets[active];
  return <div ref={chartRef} className="overview-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recorded doses and scheduled appointments over the last six months">
      {Array.from({ length: 6 }, (_, index) => index * step).map((value) => <g key={value}><line x1={left} y1={y(value)} x2={right} y2={y(value)} stroke="var(--color-chart-grid)" /><text x={left - 13} y={y(value) + 4} textAnchor="end" fontSize="12" fill="var(--color-navy-soft)">{value}</text></g>)}
      {active !== null && <rect x={x(active) - 16} y={top} width="32" height={bottom - top} rx="8" fill="var(--color-chart-teal)" opacity="0.1" />}
      <path d={curve('appointments')} className="overview-line-lavender" />
      <path d={curve('doses')} className="overview-line-teal" />
      {buckets.map((bucket, index) => <g key={bucket.prefix}>
        <circle cx={x(index)} cy={y(bucket.appointments)} r="5" className="overview-dot-lavender" />
        <circle cx={x(index)} cy={y(bucket.doses)} r="5" className="overview-dot-teal" />
        <text x={x(index)} y={height - 8} textAnchor="middle" fontSize="12" fill="var(--color-navy-soft)">{bucket.label}</text>
      </g>)}
    </svg>
    <div className="chart-point-controls">
      {buckets.map((bucket, index) => <button type="button" key={bucket.prefix} className="chart-point-control" aria-label={`${bucket.fullLabel}: ${bucket.doses} doses, ${bucket.appointments} appointments`} aria-pressed={active === index}
        style={{ left: `${(index === 0 ? 0 : (x(index - 1) + x(index)) / 2) / width * 100}%`, width: `${((index === buckets.length - 1 ? width : (x(index) + x(index + 1)) / 2) - (index === 0 ? 0 : (x(index - 1) + x(index)) / 2)) / width * 100}%` }}
        onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} />)}
    </div>
    {selected && active !== null && <div className="overview-tooltip" role="status" style={{ left: width < 480 ? '50%' : `${Math.max(14, Math.min(82, x(active) / width * 100))}%`, top: `${Math.max(6, (y(Math.max(selected.doses, selected.appointments)) - 60) / height * 100)}%` }}>
      <span className="sr-only">{selected.fullLabel}</span><span><i className="legend-lavender" aria-hidden="true" />{selected.appointments} Appointments</span><span><i className="legend-teal" aria-hidden="true" />{selected.doses} Doses</span>
    </div>}
  </div>;
}

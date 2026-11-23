/**
 * MonthlyTrendChart.tsx
 * Guide: Grouped bar chart sa Dashboard na nagpapakita ng monthly totals ng
 * recorded doses (teal) vs. scheduled appointments (lavender) sa nakaraang 6 months.
 * May hover/focus tooltip din para makita yung exact counts per month.
 */
import { useId, useState } from 'react';
import type { Appointment, DoseRecord } from '../data/mockData';
import { overviewMonths } from '../utils/dashboardOverview';
import { useChartWidth } from '../utils/useChartWidth';

/** Responsive six-month grouped bar chart with exact counts on hover, focus, or tap. */
export default function MonthlyTrendChart({ records, appointments }: { records: DoseRecord[]; appointments: Appointment[] }) {
  const buckets = overviewMonths(records, appointments);
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const { ref: chartRef, width } = useChartWidth(720);
  const step = Math.max(1, Math.ceil(Math.max(1, ...buckets.flatMap((bucket) => [bucket.doses, bucket.appointments])) / 5));
  const maximum = step * 5;
  const height = 210;
  const left = 36; const right = width - 14; const top = 12; const bottom = height - 28;
  // Helper functions para i-convert ang month index at count value into SVG x/y pixel coordinates.
  const groupWidth = (right - left) / buckets.length;
  const barWidth = Math.min(22, groupWidth * 0.32);
  const barGap = Math.min(5, groupWidth * 0.12);
  const x = (index: number) => left + (index + 0.5) * groupWidth;
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  const selected = active === null ? null : buckets[active];
  return <div ref={chartRef} className="overview-chart">
    {/* Paired bars share the same zero baseline for every month. */}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recorded doses and scheduled appointments over the last six months">
      <defs>
        <linearGradient id={gradientId + '-doses'} x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-chart-teal)" />
          <stop offset="100%" stopColor="var(--color-chart-teal)" stopOpacity={0.55} />
        </linearGradient>
        <linearGradient id={gradientId + '-appointments'} x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-chart-lavender)" />
          <stop offset="100%" stopColor="var(--color-chart-lavender)" stopOpacity={0.55} />
        </linearGradient>
      </defs>
      {Array.from({ length: 6 }, (_, index) => index * step).map((value) => <g key={value}><line x1={left} y1={y(value)} x2={right} y2={y(value)} stroke="var(--color-chart-grid)" /><text x={left - 13} y={y(value) + 4} textAnchor="end" fontSize="12" fill="var(--color-navy-soft)">{value}</text></g>)}
      {active !== null && <rect x={x(active) - groupWidth / 2 + 2} y={top} width={groupWidth - 4} height={bottom - top} rx="8" fill="var(--color-accent-soft)" />}
      {buckets.map((bucket, index) => <g key={bucket.prefix}>
        <rect x={x(index) - barGap / 2 - barWidth} y={y(bucket.doses)} width={barWidth} height={bottom - y(bucket.doses)} rx={4} fill={`url(#${gradientId}-doses)`} />
        <rect x={x(index) + barGap / 2} y={y(bucket.appointments)} width={barWidth} height={bottom - y(bucket.appointments)} rx={4} fill={`url(#${gradientId}-appointments)`} />
        <text x={x(index)} y={height - 8} textAnchor="middle" fontSize="12" fill="var(--color-navy-soft)">{bucket.label}</text>
      </g>)}
    </svg>
    {/* Invisible keyboard/mouse hit zones per month para madaling mag-hover o mag-tab sa bawat data point */}
    <div className="chart-point-controls">
      {buckets.map((bucket, index) => <button type="button" key={bucket.prefix} className="chart-point-control" aria-label={`${bucket.fullLabel}: ${bucket.doses} doses, ${bucket.appointments} appointments`} aria-pressed={active === index}
        style={{ left: `${(left + index * groupWidth) / width * 100}%`, width: `${groupWidth / width * 100}%` }}
        onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} />)}
    </div>
    {/* Floating tooltip na lumalabas kapag may naka-hover o naka-select na month */}
    {selected && active !== null && <div className="overview-tooltip" role="status" style={{ left: width < 480 ? '50%' : `${Math.max(14, Math.min(82, x(active) / width * 100))}%`, top: `${Math.max(6, (y(Math.max(selected.doses, selected.appointments)) - 60) / height * 100)}%` }}>
      <strong className="border-b border-[var(--color-border)] pb-1">{selected.fullLabel}</strong>
      <span><i className="legend-teal" aria-hidden="true" />Recorded doses <strong className="ml-auto tabular-nums">{selected.doses}</strong></span>
      <span><i className="legend-lavender" aria-hidden="true" />Appointments <strong className="ml-auto tabular-nums">{selected.appointments}</strong></span>
    </div>}
  </div>;
}

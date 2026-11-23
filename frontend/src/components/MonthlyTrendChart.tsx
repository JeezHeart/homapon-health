import { useId, useState } from 'react';
import type { Appointment, DoseRecord } from '../data/mockData';
import { overviewMonths } from '../utils/dashboardOverview';
import { useChartWidth } from '../utils/useChartWidth';

export default function MonthlyTrendChart({ records, appointments, ready = true }: {
  records: DoseRecord[];
  appointments: Appointment[];
  ready?: boolean;
}) {
  const months = overviewMonths(records, appointments);
  const [active, setActive] = useState<number | null>(null);
  const fillId = useId();
  const { ref, width } = useChartWidth(720);
  const height = 230;
  const left = 40;
  const right = width - 24;
  const top = 18;
  const baseline = 200;
  const groupWidth = (right - left) / months.length;
  const peak = Math.max(1, ...months.flatMap(month => [month.doses, month.appointments]));
  const step = Math.max(1, Math.ceil(peak / 4));
  const x = (index: number) => left + (index + 0.5) * groupWidth;
  const y = (count: number) => baseline - count / (step * 4) * (baseline - top);
  const points = (series: 'doses' | 'appointments') => months.map((month, index) => x(index) + ',' + y(month[series])).join(' ');
  const selected = active === null ? null : months[active];

  return <figure className="min-w-0" aria-label="Monthly recorded doses and appointments">
    <div ref={ref} className="overview-chart">
      <svg viewBox={'0 0 ' + width + ' ' + height} aria-hidden="true">
        <defs>
          <linearGradient id={fillId} x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-teal)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-chart-teal)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, index) => index * step).map(count => (
          <g key={count}>
            <line x1={left} x2={right} y1={y(count)} y2={y(count)} stroke="var(--color-chart-grid)" strokeDasharray={count ? '2 5' : undefined} />
            <text x={left - 8} y={y(count) + 4} textAnchor="end" fontSize={11} fill="var(--color-navy-soft)">{count}</text>
          </g>
        ))}
        {active !== null && <g>
          <rect x={x(active) - groupWidth / 2 + 2} y={top} width={groupWidth - 4} height={baseline - top}
            rx={8} fill="var(--color-accent-soft)" opacity={0.45} />
          <line x1={x(active)} x2={x(active)} y1={top} y2={baseline} stroke="var(--color-navy-soft)" strokeDasharray="3 4" opacity={0.5} />
        </g>}
        <g className={ready ? 'overview-chart-reveal' : 'invisible'}>
          <polygon points={x(0) + ',' + baseline + ' ' + points('doses') + ' ' + x(months.length - 1) + ',' + baseline} fill={'url(#' + fillId + ')'} />
          <polyline points={points('doses')} className="overview-line-teal" />
          <polyline points={points('appointments')} className="overview-line-lavender" strokeDasharray="5 6" />
          {months.map((month, index) => (
            <g key={month.prefix}>
              {active === index && <circle cx={x(index)} cy={y(month.doses)} r={9} fill="var(--color-chart-teal)" opacity={0.2} />}
              <circle cx={x(index)} cy={y(month.doses)} r={active === index ? 5 : 3} fill="var(--color-chart-teal)" stroke="var(--color-surface)" strokeWidth={1.5} />
              <circle cx={x(index)} cy={y(month.appointments)} r={active === index ? 5 : 3} fill="var(--color-surface)" stroke="var(--color-chart-lavender)" strokeWidth={2} />
            </g>
          ))}
        </g>
        {months.map((month, index) => (
          <text key={month.prefix} x={x(index)} y={222} textAnchor="middle" fontSize={11} fontWeight={active === index ? 700 : 400} fill="var(--color-navy-soft)">{month.label}</text>
        ))}
      </svg>
      {ready && <div className="chart-point-controls">
        {months.map((month, index) => (
          <button key={month.prefix} type="button" className="chart-point-control"
            aria-label={month.fullLabel + ': ' + month.doses + ' recorded doses, ' + month.appointments + ' scheduled appointments'}
            style={{ left: (left + index * groupWidth) / width * 100 + '%', width: groupWidth / width * 100 + '%' }}
            onPointerEnter={() => setActive(index)} onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setActive(null); }}
            onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)}
            onKeyDown={event => { if (event.key === 'Escape') setActive(null); }} />
        ))}
      </div>}
      {selected && active !== null && <div className="overview-tooltip border border-[var(--color-border)]" style={{ left: width < 480 ? '50%' : Math.max(20, Math.min(80, x(active) / width * 100)) + '%', top: '0.25rem' }}>
        <strong>{selected.fullLabel}</strong>
        <span><i className="legend-teal" aria-hidden="true" />Recorded doses <strong className="ml-auto tabular-nums">{selected.doses}</strong></span>
        <span><i className="legend-lavender" aria-hidden="true" />Scheduled appointments <strong className="ml-auto tabular-nums">{selected.appointments}</strong></span>
      </div>}
    </div>
  </figure>;
}

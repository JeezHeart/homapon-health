import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import NavIcon from './NavIcon';

export const KPI_GRID = 'grid grid-cols-2 gap-2.5 lg:grid-cols-4';

export function KpiSparkline({
  counts,
  labels,
  color = 'var(--color-chart-teal)',
}: {
  counts: number[];
  labels?: string[];
  color?: string;
}) {
  if (!counts.length) return null;
  const peak = Math.max(1, ...counts);
  const points = counts.map((count, index) => {
    const x = counts.length === 1 ? 43 : 3 + (index * 80) / (counts.length - 1);
    const y = 29 - (count / peak) * 24;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lastX, lastY] = points[points.length - 1].split(',');
  const areaPoints = `3,32 ${points.join(' ')} ${lastX},32`;
  const title = labels
    ? counts.map((count, index) => `${labels[index] ?? ''}: ${count}`).join(' · ')
    : undefined;

  return (
    <span aria-hidden="true" title={title} className="sparkline-wrap shrink-0">
      <svg viewBox="0 0 86 34" className="h-9 w-[clamp(3rem,36%,5.5rem)] overflow-visible">
        {counts.length > 1 && (
          <>
            <polygon
              points={areaPoints}
              fill={color}
              className="sparkline-area chart-anim-fade"
              style={{ animation: 'spark-fade 450ms ease-out 180ms both' }}
            />
            <polyline
              points={points.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              className="sparkline-line chart-anim-line"
              style={{ animation: 'chart-draw 650ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
            />
          </>
        )}
        <circle
          cx={lastX}
          cy={lastY}
          r="5.5"
          fill={color}
          className="sparkline-halo chart-anim-fade"
          style={{ animation: 'spark-fade 320ms ease-out 420ms both' }}
        />
        <circle
          cx={lastX}
          cy={lastY}
          r="2.8"
          fill={color}
          className="sparkline-dot chart-anim-fade"
          style={{ animation: 'spark-fade 320ms ease-out 420ms both' }}
        />
      </svg>
    </span>
  );
}

type KpiProps = {
  label: string;
  count: number;
  description?: string;
  icon: ComponentProps<typeof NavIcon>['name'];
  alert?: boolean;
  visual?: ReactNode;
} & (
  { to: string; onSelect?: never; selected?: never } |
  { to?: never; onSelect?: () => void; selected?: boolean }
);

export default function KpiCard({ label, count, description, icon, alert, visual, to, onSelect, selected }: KpiProps) {
  const classes = 'summary-stat kpi-card' + (alert ? ' summary-stat-alert' : '') + (selected ? ' kpi-card-selected' : '');
  const content = <>
    <span className="flex items-center gap-2">
      <span className="summary-stat-icon" aria-hidden="true"><NavIcon name={icon} /></span>
      <span className="min-w-0 flex-1 text-sm font-medium leading-tight">{label}</span>
      {(to || onSelect) && <span aria-hidden="true" className="text-xs text-[var(--color-navy-soft)]">›</span>}
    </span>
    {visual ? (
      <span className="flex min-h-10 items-center justify-between gap-2">
        <strong className="summary-stat-value">{count}</strong>
        {visual}
      </span>
    ) : (
      <strong className="summary-stat-value">{count}</strong>
    )}
    {description && <span className="mt-auto text-xs text-[var(--color-navy-soft)]">{description}</span>}
  </>;
  if (to) return <Link to={to} className={classes}>{content}</Link>;
  if (onSelect) return <button type="button" className={classes} aria-pressed={selected} onClick={onSelect}>{content}</button>;
  return <div className={classes}>{content}</div>;
}

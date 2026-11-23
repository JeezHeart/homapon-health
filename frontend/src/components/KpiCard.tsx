import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import NavIcon from './NavIcon';

export const KPI_GRID = 'grid grid-cols-2 gap-2.5 lg:grid-cols-4';

type KpiProps = {
  label: string;
  count: number;
  description?: string;
  icon: ComponentProps<typeof NavIcon>['name'];
  alert?: boolean;
} & (
  { to: string; onSelect?: never; selected?: never } |
  { to?: never; onSelect?: () => void; selected?: boolean }
);

export default function KpiCard({ label, count, description, icon, alert, to, onSelect, selected }: KpiProps) {
  const classes = 'summary-stat kpi-card' + (alert ? ' summary-stat-alert' : '') + (selected ? ' kpi-card-selected' : '');
  const content = <>
    <span className="flex items-center gap-2">
      <span className="summary-stat-icon" aria-hidden="true"><NavIcon name={icon} /></span>
      <span className="min-w-0 flex-1 text-sm font-medium leading-tight">{label}</span>
      {(to || onSelect) && <span aria-hidden="true" className="text-xs text-[var(--color-navy-soft)]">›</span>}
    </span>
    <strong className="summary-stat-value">{count}</strong>
    {description && <span className="mt-auto text-xs text-[var(--color-navy-soft)]">{description}</span>}
  </>;
  if (to) return <Link to={to} className={classes}>{content}</Link>;
  if (onSelect) return <button type="button" className={classes} aria-pressed={selected} onClick={onSelect}>{content}</button>;
  return <div className={classes}>{content}</div>;
}

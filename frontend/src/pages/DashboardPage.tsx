/**
 * DashboardPage.tsx
 * Guide pang-defense: Ito yung main overview dashboard ng clinic (`/`).
 * Hawak nito yung compact KPI stat cards (children, fully immunized, overdue, doses this month),
 * vaccination trend chart, mini clinic calendar, upcoming/overdue appointments overview,
 * at lazy-loaded na WHO growth summary.
 */
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import { KpiSparkline } from '../components/KpiCard';
import MagicBento from '../components/MagicBento';
import CountUp from '../components/CountUp';
import FadeContent from '../components/FadeContent';
import { todayISO } from '../utils/dates';
import { AGE_GROUPS, infantAgeGroup } from '../utils/childDirectory';
import { dosesByDayThisMonth } from '../utils/dashboardOverview';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import DashboardCalendar from '../components/DashboardCalendar';
import DashboardAppointments from '../components/DashboardAppointments';
import {
  isFullyImmunized,
  overdueAppointments,
} from '../data/mockData';
import { useStore } from '../state/store-context';

// Naka-lazy load para hindi bumagal yung initial load ng dashboard dahil sa WHO growth helpers.
const GrowthSummary = lazy(() => import('../components/GrowthSummary'));

// Compact KPI stat card na buong card ay clickable papunta sa target page (Children, Schedule, o Records).
function TopStat({
  label,
  value,
  icon,
  description,
  to,
  alert = false,
  ready,
  visual,
  total,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  to: string;
  alert?: boolean;
  ready: boolean;
  visual?: React.ReactNode;
  total?: number;
}) {
  return (
    <Link
      to={to}
      aria-label={ready ? `${label}: ${value}${total === undefined ? '' : ' of ' + total} — ${description}` : label + ': loading'}
      className={`summary-stat${alert ? ' summary-stat-alert' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="summary-stat-icon">{icon}</span>
          <span className="min-w-0 text-sm font-medium">{label}</span>
        </span>
        <span aria-hidden="true" className="text-xs text-[var(--color-navy-soft)]">›</span>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <span className="summary-stat-value">
          <CountUp to={value} startWhen={ready} />
          {ready && total !== undefined && <span className="text-xs font-medium text-[var(--color-navy-soft)]"> / {total}</span>}
        </span>
        {ready && visual}
      </div>
      <p className="mt-auto text-xs text-[var(--color-navy-soft)]">{description}</p>
    </Link>
  );
}

function StatMiniBars({ label, bars, overdue = false }: {
  label: string;
  bars: { label: string; count: number }[];
  overdue?: boolean;
}) {
  const peak = Math.max(1, ...bars.map(bar => bar.count));
  return <span aria-hidden="true" title={bars.map(bar => bar.label + ': ' + bar.count).join(' · ')}
    className="flex min-w-0 shrink-0 flex-col items-end gap-1">
    <span className="flex h-6 items-end gap-1">
      {bars.map(bar => (
        <span key={bar.label} className="w-1.5 rounded-t-sm sm:w-2"
          style={{
            height: Math.max(2, Math.round(bar.count / peak * 24)),
            background: bar.count ? overdue ? 'var(--color-danger)' : 'var(--color-chart-teal)' : 'var(--color-border)',
          }} />
      ))}
    </span>
    <span className="text-[10px] leading-none text-[var(--color-navy-soft)]">{label}</span>
  </span>;
}

function ImmunizationRing({ count, total }: { count: number; total: number }) {
  const percentage = total ? count / total * 100 : 0;
  return <span className="relative grid size-11 shrink-0 place-items-center text-[10px] font-semibold tabular-nums" aria-hidden="true">
    <svg viewBox="0 0 44 44" className="absolute inset-0 size-full">
      <circle cx="22" cy="22" r="19" fill="none" stroke="var(--color-border)" strokeWidth="3" />
      {percentage > 0 && <circle cx="22" cy="22" r="19" pathLength="100" fill="none" stroke="var(--color-chart-teal)"
        strokeWidth="3" strokeLinecap="round" strokeDasharray={percentage + ' 100'} transform="rotate(-90 22 22)" />}
    </svg>
    {total ? Math.round(percentage) + '%' : '—'}
  </span>;
}

// Inline SVG icon para sa total registered children card.
function ChildrenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// Inline SVG icon para sa fully immunized at doses-this-month cards.
function ShieldCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// Inline SVG icon para sa overdue appointments alert card.
function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// Main Dashboard page component: compact overview ng KPIs, trends, calendar, appointments, at WHO growth summary.
export default function DashboardPage() {
  const { children, records, appointments, dataReady } = useStore();
  const overdue = overdueAppointments(appointments, children, records);
  const fullyImmunized = children.filter((child) => isFullyImmunized(records, child.id)).length;
  const today = todayISO();
  const dailyDoses = dosesByDayThisMonth(records, today);
  const monthShort = new Date(today + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' });
  const dailyLabels = dailyDoses.map((_, i) => `${monthShort} ${i + 1}`);
  const dosesThisMonth = dailyDoses.reduce((sum, count) => sum + count, 0);
  const infantsByAge = new Map<string, number>();
  for (const child of children) {
    const group = infantAgeGroup(child.birthDate, today);
    if (group) infantsByAge.set(group, (infantsByAge.get(group) ?? 0) + 1);
  }
  const overdueByAge = [
    { label: '1–7 days', count: overdue.filter(appointment => (appointment.daysOverdue ?? 0) <= 7).length },
    { label: '8–30 days', count: overdue.filter(appointment => (appointment.daysOverdue ?? 0) > 7 && (appointment.daysOverdue ?? 0) <= 30).length },
    { label: '31+ days', count: overdue.filter(appointment => (appointment.daysOverdue ?? 0) > 30).length },
  ];

  return (
    <MagicBento className="dashboard-compact flex flex-col gap-3.5" summaryOnly enableBorderGlow={false} enableSpotlight spotlightRadius={300}>
      {/* Hidden page heading pang-screen reader accessibility (a11y) */}
      <div className="sr-only">
        <h1 className="page-title">Immunization dashboard</h1>
      </div>

      {/* Apat na compact KPI summary cards sa taas ng dashboard */}
      <FadeContent className="dashboard-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TopStat ready={dataReady !== false} label="Children" value={children.length} icon={<ChildrenIcon />} description="Registered child records" to="/children"
          visual={<StatMiniBars label="Infant ages" bars={AGE_GROUPS.map(({ id, label }) => ({ label, count: infantsByAge.get(id) ?? 0 }))} />} />
        <TopStat ready={dataReady !== false} label="Doses this month" value={dosesThisMonth} icon={<ShieldCheckIcon />}
          description={new Date(today + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })} to="/records"
          visual={<KpiSparkline counts={dailyDoses} labels={dailyLabels} color="var(--color-chart-teal)" />} />
        <TopStat ready={dataReady !== false} label="Fully immunized" value={fullyImmunized} total={children.length} icon={<ShieldCheckIcon />}
          description="Among registered children" to="/children?status=Fully%20immunized"
          visual={<ImmunizationRing count={fullyImmunized} total={children.length} />} />
        <TopStat ready={dataReady !== false} label="Overdue" value={overdue.length} icon={<AlertIcon />} description="Appointments for follow-up" to="/schedule?filter=overdue" alert={overdue.length > 0}
          visual={<StatMiniBars label="Days overdue" bars={overdueByAge} overdue />} />
      </FadeContent>

      <FadeContent className="grid gap-3 lg:grid-cols-2 [&>.health-card]:!p-3 [&>.health-card>.health-card-header]:mb-1.5 [&>.health-card>.health-card-header]:min-h-6">
        <Suspense fallback={<Card title="Growth Monitoring Summary"><p role="status" className="text-sm text-[var(--color-navy-soft)]">Loading growth summary...</p></Card>}>
          <GrowthSummary />
        </Suspense>
        <Card title="Infants by age">
          <ul className="grid grid-cols-2 gap-1.5">
            {AGE_GROUPS.map(({ id, label }) => (
              <li key={id} className="min-w-0">
                <Link to={'/children?age=' + id}
                  className="flex h-full min-h-9 items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-2.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
                  <span className="text-xs text-[var(--color-navy-soft)]">{label}</span>
                  <span className="text-base font-semibold tabular-nums">{dataReady === false ? '—' : infantsByAge.get(id) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </FadeContent>

      {/* Magkatabing monthly vaccination trends chart at interactive clinic calendar */}
      <FadeContent className="dashboard-overview">
        <Card title="Vaccination overview" action={
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--color-navy-soft)]">
            <span className="inline-flex items-center gap-1"><i className="h-0.5 w-3 bg-[var(--color-chart-teal)]" aria-hidden="true" />Recorded doses</span>
            <span className="inline-flex items-center gap-1"><i className="w-3 border-t-2 border-dashed border-[var(--color-chart-lavender)]" aria-hidden="true" />Scheduled appointments</span>
          </div>
        }>
          <div className="my-auto w-full">
            <MonthlyTrendChart records={records} appointments={appointments} ready={dataReady !== false} />
          </div>
        </Card>
        <DashboardCalendar />
      </FadeContent>

      {/* Panel para sa upcoming at overdue appointments na may click-to-open detail card */}
      <DashboardAppointments />

    </MagicBento>
  );
}

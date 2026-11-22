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
import MagicBento from '../components/MagicBento';
import CountUp from '../components/CountUp';
import FadeContent from '../components/FadeContent';
import { todayISO } from '../utils/dates';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import DashboardCalendar from '../components/DashboardCalendar';
import DashboardAppointments from '../components/DashboardAppointments';
import {
  dosesThisMonth,
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
  highlighted = false,
  alert = false,
  ready,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  to: string;
  highlighted?: boolean;
  alert?: boolean;
  ready: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value} — ${description}`}
      className={`summary-stat ${highlighted ? 'summary-stat-highlight' : ''} ${alert ? 'summary-stat-alert' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="summary-stat-icon">{icon}</span>
          <span className="truncate text-sm font-medium">{label}</span>
        </span>
        <span aria-hidden="true" className="text-xs text-[var(--color-navy-soft)]">›</span>
      </div>
      <span className="summary-stat-value">
        <CountUp to={value} startWhen={ready} />
      </span>
      <p className="text-xs text-[var(--color-navy-soft)]">{description}</p>
    </Link>
  );
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

  return (
    <MagicBento className="dashboard-compact flex flex-col gap-3.5" summaryOnly enableBorderGlow={false} enableSpotlight spotlightRadius={300}>
      {/* Hidden page heading pang-screen reader accessibility (a11y) */}
      <div className="sr-only">
        <h1 className="page-title">Immunization dashboard</h1>
      </div>

      {/* Apat na compact KPI summary cards sa taas ng dashboard */}
      <FadeContent className="dashboard-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TopStat ready={dataReady !== false} label="Children" value={children.length} icon={<ChildrenIcon />} description="Registered child records" to="/children" />
        <TopStat ready={dataReady !== false} label="Fully immunized" value={fullyImmunized} icon={<ShieldCheckIcon />} description="All required doses recorded" to="/children?status=Fully%20immunized" highlighted />
        <TopStat ready={dataReady !== false} label="Overdue" value={overdue.length} icon={<AlertIcon />} description="Appointments for follow-up" to="/schedule?filter=overdue" alert={overdue.length > 0} />
        <TopStat ready={dataReady !== false} label="Doses this month" value={dosesThisMonth(records)} icon={<ShieldCheckIcon />} description={new Date(`${todayISO()}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })} to="/records" />
      </FadeContent>

      {/* Magkatabing monthly vaccination trends chart at interactive clinic calendar */}
      <FadeContent className="dashboard-overview">
        <Card title="Vaccination overview" action={<div className="overview-legend"><span><i className="legend-teal" aria-hidden="true" />Doses</span><span><i className="legend-lavender" aria-hidden="true" />Appointments</span></div>}>
          <MonthlyTrendChart records={records} appointments={appointments} />
        </Card>
        <DashboardCalendar />
      </FadeContent>

      {/* Panel para sa upcoming at overdue appointments na may click-to-open detail card */}
      <DashboardAppointments />

      {/* Lazy-loaded na compact WHO growth summary widget na may click-to-open detail card */}
      <Suspense fallback={<p role="status">Loading growth summary...</p>}><FadeContent><GrowthSummary /></FadeContent></Suspense>
    </MagicBento>
  );
}

import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import MagicBento from '../components/MagicBento';
import ChildForm from '../components/ChildForm';
import AppointmentDialog from '../components/AppointmentDialog';
import Dialog from '../components/Dialog';
import { useSmsAvailability } from '../utils/useSmsAvailability';
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

const GrowthSummary = lazy(() => import('../components/GrowthSummary'));

function TopStat({
  label,
  value,
  icon,
  description,
  to,
  highlighted = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  to: string;
  highlighted?: boolean;
}) {
  return (
    <article className={`summary-stat ${highlighted ? 'summary-stat-highlight' : ''}`}>
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-3">
        <span aria-hidden="true" className="summary-stat-icon">{icon}</span>
        <span className="text-base font-medium">{label}</span>
      </span><Link to={to} aria-label={`View ${label.toLowerCase()}`} className="stat-action">···</Link></div>
      <Link to={to} className="summary-stat-value" aria-label={`${label}: ${value}`}>{value.toLocaleString('en-PH')}</Link>
      <p className="mt-auto max-w-60 text-xs leading-relaxed text-[var(--color-navy-soft)]">{description}</p>
    </article>
  );
}

function ChildrenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default function DashboardPage() {
  const { children, records, appointments, addChild, addAppointment } = useStore();
  const overdue = overdueAppointments(appointments, children, records);
  const fullyImmunized = children.filter((child) => isFullyImmunized(records, child.id)).length;
  const [action, setAction] = useState<'child' | 'appointment' | null>(null);
  const sms = useSmsAvailability();
  const smsLabel = { checking: 'Checking...', enabled: 'Enabled', disabled: 'Disabled', unavailable: 'Unavailable', practice: 'Practice only' }[sms.status];

  return (
    <><MagicBento className="flex flex-col gap-5" enableBorderGlow enableSpotlight spotlightRadius={300}>
      <div className="dashboard-toolbar">
        <p role="status" aria-live="polite" className="text-sm text-[var(--color-navy-soft)]"><Link to="/sms">SMS: <strong className="font-medium">{smsLabel}</strong></Link></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-medium" onClick={() => setAction('child')}>Register child</button>
          <button type="button" className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!children.length} title={!children.length ? 'Register a child first' : undefined} onClick={() => setAction('appointment')}>Book appointment</button>
        </div>
      </div>
      <div className="sr-only">
        <div>
          <h1 className="page-title">
            Immunization dashboard
          </h1>
        </div>
      </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TopStat label="Children" value={children.length} icon={<ChildrenIcon />} description="Registered child records" to="/children" />
          <TopStat label="Fully immunized" value={fullyImmunized} icon={<ShieldCheckIcon />} description="All required doses recorded" to="/children?status=Fully%20immunized" highlighted />
          <TopStat label="Overdue" value={overdue.length} icon={<AlertIcon />} description="Appointments for follow-up" to="/schedule?filter=overdue" />
          <TopStat label="Doses this month" value={dosesThisMonth(records)} icon={<ShieldCheckIcon />} description={new Date(`${todayISO()}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })} to="/records" />
        </div>

      <div className="dashboard-overview">
        <Card title="Vaccination overview" action={<div className="overview-legend"><span><i className="legend-teal" aria-hidden="true" />Doses</span><span><i className="legend-lavender" aria-hidden="true" />Appointments</span></div>}>
          <MonthlyTrendChart records={records} appointments={appointments} />
        </Card>
        <DashboardCalendar />
      </div>

      <DashboardAppointments />



      <Suspense fallback={<p role="status">Loading growth summary...</p>}><GrowthSummary /></Suspense>
    </MagicBento>

      {action === 'child' && <Dialog title="Register child" onClose={() => setAction(null)}><ChildForm onSubmit={async (data) => { await addChild(data); setAction(null); }} onCancel={() => setAction(null)} /></Dialog>}
      {action === 'appointment' && <Dialog title="Book appointment" onClose={() => setAction(null)}><AppointmentDialog childList={children} records={records} onSave={async (data) => { await addAppointment(data); }} onClose={() => setAction(null)} /></Dialog>}
    </>
  );
}

import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import DosesChart from '../components/DosesChart';
import EmptyState from '../components/EmptyState';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import SmsDialog from '../components/SmsDialog';
import StatusBadge from '../components/StatusBadge';
import DashboardCalendar from '../components/DashboardCalendar';
import DashboardAppointments from '../components/DashboardAppointments';
import {
  childName,
  dosesThisMonth,
  isFullyImmunized,
  overdueAppointments,
  upcomingAppointments,
} from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate, formatTime, timeAgo, todayISO } from '../utils/dates';
import { isRegularClinicDay, nextClinicSession, nextRegularClinicDate } from '../utils/clinicScheduling';

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

function vaccineLabel(vaccineId: string, doseNumber: number): string {
  const v = vaccineById(vaccineId);
  return v ? `${v.shortName} · Dose ${doseNumber}` : `Dose ${doseNumber}`;
}

export default function DashboardPage() {
  const { children, records, appointments, smsLog } = useStore();
  const upcoming = upcomingAppointments(appointments, children, records);
  const session = nextClinicSession(upcoming);
  const overdue = overdueAppointments(appointments, children, records);
  const reminders = [...smsLog]
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 6);
  const fullyImmunized = children.filter((c) =>
    isFullyImmunized(records, c.id),
  ).length;
  const spotlight = overdue[0] ?? upcoming[0];
  const [smsOpen, setSmsOpen] = useState(false);


  return (
    <div className="flex flex-col gap-5">
      {/* Summary uses recorded counts, without inferred trend percentages. */}
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

      {/* Additional recorded activity. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="Doses overview"
          action={
            <span className="text-xs font-medium text-[var(--color-navy-soft)]">
              {dosesThisMonth(records)} this month
            </span>
          }
        >
          <DosesChart records={records} />
        </Card>
      <Card title="Next clinic session">
        {session ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xl font-bold text-[var(--color-navy)]">
                {new Date(`${session.date}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'long', timeZone: 'UTC' })}, {formatDate(session.date)}
              </p>
              <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
                {session.childCount} {session.childCount === 1 ? 'child' : 'children'} · {session.appointmentCount} {session.appointmentCount === 1 ? 'appointment' : 'appointments'} booked
              </p>
              <p className="mt-1 text-xs text-[var(--color-navy-soft)]">
                {isRegularClinicDay(session.date) ? 'Regular Wednesday clinic day.' : 'Bookings are on a different day from the regular Wednesday clinic.'}
              </p>
            </div>
            <Link
              to={`/schedule?date=${session.date}`}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
            >
              View session
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[var(--color-navy)]">No upcoming appointments booked</p>
              <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
                Next regular clinic day: {formatDate(nextRegularClinicDate())}. Confirm any holiday changes with the health center.
              </p>
            </div>
            <Link to="/schedule" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
              Open schedule
            </Link>
          </div>
        )}
      </Card>
      </div>

      {/* Upcoming appointments, follow-up, and reminders. */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title={`Upcoming · ${upcoming.length}`}
          action={
            <Link
              to="/schedule"
              className="text-sm font-semibold text-[var(--color-accent-dark)] hover:underline"
            >
              Schedule
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              message="New appointments will appear here."
            />
          ) : (
            <ul className="flex flex-col">
              {upcoming.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="font-medium text-[var(--color-navy)]">
                    {childName(a.child)} ·{' '}
                    {vaccineLabel(a.vaccineId, a.doseNumber)}
                    <span className="block text-xs font-normal text-[var(--color-navy-soft)]">
                      {formatDate(a.scheduledDate)}
                      {a.scheduledTime ? ` · ${formatTime(a.scheduledTime)}` : ''}{' '}
                      · {a.child.guardian}
                    </span>
                  </span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Needs attention">
          {!spotlight ? (
            <EmptyState
              title="All clear"
              message="No overdue or upcoming vaccinations right now."
            />
          ) : (
            <div className="flex h-full flex-col gap-2">
              <div>
                <StatusBadge status={spotlight.status} />
              </div>              <p className="text-lg font-bold text-[var(--color-navy)]">
                {childName(spotlight.child)}
              </p>
              <p className="text-sm">
                {vaccineLabel(spotlight.vaccineId, spotlight.doseNumber)} ·{' '}
                {formatDate(spotlight.scheduledDate)}
                {spotlight.scheduledTime
                  ? ` · ${formatTime(spotlight.scheduledTime)}`
                  : ''}
              </p>
              <p className="text-sm text-[var(--color-navy-soft)]">
                {spotlight.child.guardian} · {spotlight.child.guardianMobile}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/children/${spotlight.child.id}`}
                  className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                >
                  Open profile
                </Link>
                <Link
                  to="/schedule?filter=overdue"
                  className="rounded-xl bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-800 hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                >
                  View all overdue →
                </Link>
                {spotlight.status !== 'completed' ? (
                  <button
                    type="button"
                    onClick={() => setSmsOpen(true)}
                    className="rounded-xl bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  >
                    Prepare SMS
                  </button>
                ) : (
                  <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-[var(--color-navy-soft)]">
                    No reminder needed
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Reminders"
          action={
            <Link
              to="/sms"
              className="text-sm font-semibold text-[var(--color-accent-dark)] hover:underline"
            >
              View all
            </Link>
          }
        >
          {reminders.length === 0 ? (
            <EmptyState
              title="No reminders yet"
              message="SMS reminder history will appear here."
            />
          ) : (
            <ul className="flex flex-col">
              {reminders.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-3 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      s.status === 'Demo sent' || s.status === 'Sent'
                        ? 'bg-emerald-500'
                        : 'bg-red-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-navy)]">
                      {s.message}
                    </p>
                    <p className="text-xs text-[var(--color-navy-soft)]">
                      {s.status} · {timeAgo(s.sentAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>


      {spotlight && smsOpen && (
        <SmsDialog appointment={spotlight} onClose={() => setSmsOpen(false)} />
      )}
    </div>
  );
}

/**
 * Immunization Schedule page (`/schedule`).
 *
 * Hawak nito: monthly calendar picker na may per-day appointment counts, filterable at paginated appointment table,
 * overdue follow-up status tracking, at modals pang-book, pang-reschedule, pang-follow-up, at pang-prepare ng SMS reminder.
 * Dito kayo mag-check pag may bug sa calendar date selection, schedule filters, overdue follow-up actions, o appointment modals.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import KpiCard, { KPI_GRID, KpiSparkline } from '../components/KpiCard';
import AppointmentDialog from '../components/AppointmentDialog';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
import FadeContent from '../components/FadeContent';
import FollowUpDialog from '../components/FollowUpDialog';
import SmsDialog from '../components/SmsDialog';
import StatusBadge from '../components/StatusBadge';
import type { EnrichedAppointment, FollowUpStatus } from '../data/mockData';
import {
  childName,
  enrichedAppointments,
  extractPurok,
  PUROKS,
} from '../data/mockData';
import { VACCINES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import {
  formatDate,
  formatTime,
  monthCells,
  shiftMonthCursor,
  todayISO,
} from '../utils/dates';

import { filterSchedule, validScheduleDate } from '../utils/scheduleDirectory';
import type { ScheduleFilter } from '../utils/scheduleDirectory';
import { directoryPage } from '../utils/childDirectory';

// Mga options para sa status filter dropdown ng schedule.
const PAGE_SIZE = 8;

const FILTERS: { id: ScheduleFilter; label: string }[] = [
  { id: 'all', label: 'All appointments' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];



// Kulay ng badge depende sa follow-up status ng overdue appointment.
const FOLLOW_UP_BADGE: Record<FollowUpStatus, string> = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-200',
  Contacted: 'bg-sky-100 text-sky-800 border-sky-200',
  'Home Visited': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Rescheduled: 'bg-purple-100 text-purple-800 border-purple-200',
};

// Nagpapakita ng monthly calendar at listahan ng vaccination appointments na may URL-synced filters at actions.
export default function SchedulePage() {
  const { children, records, appointments, addAppointment, updateAppointment } =
    useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('appointment');
  function setSelectedId(id: string | null) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('appointment', id);
    else next.delete('appointment');
    setSearchParams(next, { replace: true });
  }
  // Binabasa dito lahat ng active schedule filters, selected date/month, at page size galing sa URL query params.
  const filter = FILTERS.find((item) => item.id === searchParams.get('filter'))?.id ?? 'upcoming';
  const query = searchParams.get('q') ?? '';
  const vaccine = VACCINES.find(item => item.id === searchParams.get('vaccine'))?.id ?? 'all';
  const puroks = [...new Set<string>([...PUROKS, ...children.map(child => extractPurok(child.purok))])];
  const purokFilter = puroks.find((purok) => purok === searchParams.get('purok')) ?? 'all';
  const selectedDay = validScheduleDate(searchParams.get('date'));
  const monthDate = validScheduleDate(`${searchParams.get('month')}-01`) ?? selectedDay ?? todayISO();
  const [year, month] = monthDate.split('-').map(Number);
  const monthCursor = { year, month: month - 1 };
  const directoryParams = new URLSearchParams(searchParams);
  directoryParams.delete('appointment');
  const returnTo = '/schedule' + (directoryParams.size ? '?' + directoryParams.toString() : '');
  // Ina-update yung URL query params pag nagbago ng filter, petsa, o page size, at nire-reset ang page sa 1.
  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(searchParams);
    next.delete('page');
    next.delete('size');
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === 'all' && key === 'purok' || key === 'page' && value === 1) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }
  // Local React modal states para sa SMS reminder, overdue follow-up, bagong booking, at rescheduling.
  const [smsFor, setSmsFor] = useState<EnrichedAppointment | null>(null);
  const [followUpFor, setFollowUpFor] = useState<EnrichedAppointment | null>(null);
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] =
    useState<EnrichedAppointment | null>(null);

  // Pinagsasama yung appointments, child info, at dose records via useMemo para malaman ang status (upcoming/overdue/completed).
  const all = useMemo(
    () => enrichedAppointments(appointments, children, records),
    [appointments, children, records],
  );

  // Hiwalay yung `calendarRows` (lahat ng statuses para sa count badges sa calendar) sa `filtered` (yung table sa kanan).
  const selected = all.find(a => a.id === selectedId);
  const vaccineAppointments = vaccine === 'all' ? all : all.filter(appointment => appointment.vaccineId === vaccine);
  const calendarRows = filterSchedule(vaccineAppointments, { query, purok: purokFilter, filter: 'all' });
  const filtered = filterSchedule(vaccineAppointments, { query, purok: purokFilter, filter, date: selectedDay });
  const countScope = selectedDay ? calendarRows.filter(appointment => appointment.scheduledDate === selectedDay) : calendarRows;
  // Real sparkline series para sa 4 KPI cards base sa actual scheduled dates/times ng naka-filter na appointments.
  const today = todayISO();
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);

  // 1. Upcoming: next 7 days (Today .. +6 days)
  const upcomingDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + i));
    const iso = date.toISOString().slice(0, 10);
    return {
      iso,
      label: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  });
  const upcomingSpark = {
    labels: upcomingDays.map(d => d.label),
    counts: upcomingDays.map(d =>
      countScope.filter(item => (item.status === 'upcoming' || item.status === 'due-today') && item.scheduledDate === d.iso).length,
    ),
  };

  // 2. Due today: 6 clinic time slots across the day
  const dueTodayItems = countScope.filter(item => item.status === 'due-today');
  const dueTodaySlots = [
    { label: 'Before 9 AM', match: (t?: string) => Boolean(t && t < '09:00') },
    { label: '9–10 AM', match: (t?: string) => Boolean(t && t >= '09:00' && t < '10:00') },
    { label: '10–11 AM', match: (t?: string) => Boolean(t && t >= '10:00' && t < '11:00') },
    { label: '11 AM–12 PM', match: (t?: string) => Boolean(t && t >= '11:00' && t < '12:00') },
    { label: 'Afternoon', match: (t?: string) => Boolean(t && t >= '12:00') },
    { label: 'No time set', match: (t?: string) => !t },
  ];
  const dueTodaySpark = {
    labels: dueTodaySlots.map(s => s.label),
    counts: dueTodaySlots.map(s => dueTodayItems.filter(item => s.match(item.scheduledTime)).length),
  };

  // 3 & 4. Overdue and Completed: last 6 months ending this month
  const recentMonths = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(todayYear, todayMonth - 6 + i, 1));
    return {
      prefix: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
    };
  });
  const overdueSpark = {
    labels: recentMonths.map(m => m.label),
    counts: recentMonths.map(m => countScope.filter(item => item.status === 'overdue' && item.scheduledDate.startsWith(m.prefix)).length),
  };
  const completedSpark = {
    labels: recentMonths.map(m => m.label),
    counts: recentMonths.map(m => countScope.filter(item => item.status === 'completed' && item.scheduledDate.startsWith(m.prefix)).length),
  };

  const scheduleTotals = [
    { filter: 'upcoming', label: 'Upcoming', count: countScope.filter(item => item.status === 'upcoming' || item.status === 'due-today').length, description: 'Includes appointments due today', spark: upcomingSpark, color: 'var(--color-secondary)' },
    { filter: 'today', label: 'Due today', count: dueTodayItems.length, description: 'Pending appointments today', spark: dueTodaySpark, color: 'var(--color-warning)' },
    { filter: 'overdue', label: 'Overdue', count: countScope.filter(item => item.status === 'overdue').length, description: 'Appointments for follow-up', spark: overdueSpark, color: 'var(--color-danger)' },
    { filter: 'completed', label: 'Completed', count: countScope.filter(item => item.status === 'completed').length, description: 'Appointments with a recorded dose', spark: completedSpark, color: 'var(--color-chart-teal)' },
  ] as const;
  const pagination = directoryPage(filtered, Number(searchParams.get('page') ?? 1), PAGE_SIZE);
  const activeFilters = Boolean(query || purokFilter !== 'all' || selectedDay || filter !== 'upcoming' || vaccine !== 'all');
  // Gini-group ang appointments per date string (`YYYY-MM-DD`) para mabilis makuha ang count ng bawat calendar cell.
  const byDay = new Map<string, EnrichedAppointment[]>();
  for (const appointment of calendarRows) {
    const day = byDay.get(appointment.scheduledDate) ?? [];
    day.push(appointment);
    byDay.set(appointment.scheduledDate, day);
  }

  const monthLabel = new Date(
    monthCursor.year,
    monthCursor.month,
    1,
  ).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const cells = monthCells(monthCursor.year, monthCursor.month);
  // Pang-lipat ng buwan sa calendar (-1 para previous month, +1 para next month).
  function shiftMonth(delta: number) {
    const cursor = shiftMonthCursor(monthCursor, delta);
    update({ month: `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` });
  }

  const selectClass =
    'clinic-control';

  return (
    <div className="flex flex-col gap-3.5 lg:h-[calc(100dvh-5.75rem)] lg:min-h-[39rem]">
      <h1 className="sr-only">Immunization Schedule</h1>
      <section aria-label="Appointment totals" className={KPI_GRID}>
        {scheduleTotals.map(item => <KpiCard key={item.filter} label={item.label} count={item.count}
          description={item.description} icon={item.filter === 'overdue' ? 'bell' : 'calendar'}
          alert={item.filter === 'overdue' && item.count > 0} selected={filter === item.filter}
          visual={<KpiSparkline counts={item.spark.counts} labels={item.spark.labels} color={item.color} />}
          onSelect={() => update({ filter: item.filter })} />)}
      </section>
      {/* Filter card: search bar, status dropdown, at purok selector */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" aria-label="Search appointments by child or guardian" placeholder="Search child or guardian" value={query} onChange={(event) => update({ q: event.target.value })} className="min-w-0 w-full flex-none rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-auto sm:flex-1" />
          <select aria-label="Appointment status filter" value={filter} onChange={(event) => update({ filter: event.target.value, date: '' })} className={selectClass}>{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select aria-label="Filter by purok" value={purokFilter} onChange={(event) => update({ purok: event.target.value })} className={selectClass}><option value="all">All puroks</option>{puroks.map((purok) => <option key={purok}>{purok}</option>)}</select>
          <select aria-label="Filter by vaccine" value={vaccine} onChange={event => update({ vaccine: event.target.value === 'all' ? '' : event.target.value })} className={selectClass}>
            <option value="all">All vaccines</option>
            {VACCINES.map(item => <option key={item.id} value={item.id}>{item.shortName}</option>)}
          </select>
          {activeFilters && <button type="button" onClick={() => update({ q: '', purok: '', date: '', filter: 'upcoming', vaccine: '' })} className={selectClass}>Clear filters</button>}
          <button type="button" onClick={() => setBooking(true)}
            className="ml-auto min-h-10 rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--color-on-accent)] hover:bg-[var(--color-accent-dark)]">
            Book Appointment
          </button>
        </div>
      </Card>

      {/* Main layout: kaliwa yung monthly calendar picker, kanan yung appointments table + pagination */}
      <FadeContent className="grid gap-3.5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(17rem,1fr)_minmax(0,2fr)]">
        {/* Monthly calendar card na may Today/Prev/Next controls at count badge per araw */}
          <Card title="Calendar" className="flex flex-col lg:min-h-0" action={
            <button type="button" onClick={() => update({ date: todayISO(), month: todayISO().slice(0, 7), filter: 'today' })}
              className="rounded-lg border border-[var(--color-control-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-elevated)]">Today</button>
          }>
            <div className="calendar-month-nav shrink-0">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="calendar-arrow">‹</button>
              <p aria-live="polite" className="text-sm">{monthLabel}</p>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="calendar-arrow">›</button>
            </div>
            <div className="dashboard-calendar lg:flex-1 lg:auto-rows-fr lg:items-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <span key={i} className="calendar-weekday" aria-hidden="true">{day}</span>
              ))}
              {cells.map((iso, i) => {
                if (!iso) {
                  return <span key={`empty-${i}`} aria-hidden="true" />;
                }
                const dayNumber = Number(iso.split('-')[2]);
                const dayAppointments = byDay.get(iso) ?? [];
                const count = dayAppointments.length;
                const isSelected = selectedDay === iso;
                const isToday = iso === todayISO();
                const hasOverdue = dayAppointments.some(a => a.status === 'overdue');
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => update({ date: iso, filter: 'all' })}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${formatDate(iso)}: ${count} appointment${count === 1 ? '' : 's'}${isToday ? ', Today' : ''}${isSelected ? ', Selected date' : ''}`}
                    className={`calendar-day lg:!h-9 lg:!w-9 ${isToday ? 'calendar-today font-semibold' : ''} ${
                      isSelected
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-navy)] ring-2 ring-inset ring-[var(--color-accent)]'
                        : ''
                    }`}
                  >
                    <span className={count > 0 ? '-translate-y-0.5' : undefined}>{dayNumber}</span>
                    {count > 0 && <span aria-hidden="true" className={`absolute bottom-px text-[0.5625rem] leading-none ${hasOverdue ? 'font-semibold text-[var(--color-danger)]' : 'text-[var(--color-navy-soft)]'}`}>{count}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 shrink-0 border-t border-[var(--color-border)] pt-3 lg:mt-auto">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-navy-soft)]">
                <span className="calendar-today rounded px-1.5 py-0.5 font-semibold">Today</span>
                <span className="rounded border border-[var(--color-accent)] px-1.5 py-0.5">Selected date</span>
                {selectedDay && <button type="button" onClick={() => update({ date: '' })} className="font-medium underline">Clear date</button>}
              </div>
              <p className="mt-1.5 text-xs text-[var(--color-navy-soft)]">Select a date to see its appointments.</p>
            </div>
          </Card>

        {/* On desktop both cards stretch cleanly to the bottom edge and the appointment list scrolls inside if needed. */}
        <section aria-labelledby="appointment-list-title" className="health-card flex min-w-0 flex-col overflow-hidden !p-0 lg:min-h-0">
          <h2 id="appointment-list-title" className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 text-base font-semibold">
            {selectedDay ? formatDate(selectedDay) : FILTERS.find((f) => f.id === filter)?.label} ({filtered.length})
          </h2>
        {filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <EmptyState
              title="No matching appointments"
              message="Try another date or clear the filters."
            />
          </div>
        ) : (
          <ul aria-label="Vaccination appointments" className={`grid auto-rows-max content-start gap-2.5 p-3.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${pagination.visible.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {pagination.visible.map(a => (
              <li key={a.id} className="clinic-entry overflow-hidden">
                <button type="button" aria-haspopup="dialog" onClick={() => setSelectedId(a.id)}
                  className="flex h-full w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-elevated)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]">
                  <span className="child-avatar shrink-0" aria-hidden="true">{a.child.firstName.charAt(0)}{a.child.lastName.charAt(0)}</span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center justify-between gap-1"><strong>{childName(a.child)}</strong><StatusBadge status={a.status} /></span>
                    <span className="block text-sm">{vaccineById(a.vaccineId)?.shortName ?? a.vaccineId} · Dose {a.doseNumber}</span>
                    <span className="block text-xs text-[var(--color-navy-soft)]">{formatDate(a.scheduledDate)}{a.scheduledTime && ' · ' + formatTime(a.scheduledTime)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {filtered.length > 0 && <nav aria-label="Schedule pagination" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
        <p role="status" aria-live="polite">{pagination.first}–{pagination.last} of {filtered.length} appointments</p>
        {pagination.pages > 1 && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${selectClass} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${selectClass} disabled:opacity-40`}>Next</button></div>}
      </nav>}
        </section>
      </FadeContent>

      {/* Mga modals pang-prepare ng SMS, pang-log ng overdue follow-up, pang-book, at pang-reschedule */}
      {selected && <Dialog title="Appointment details" onClose={() => setSelectedId(null)}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{childName(selected.child)}</h3>
            <StatusBadge status={selected.status} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt>Vaccination</dt><dd>{vaccineById(selected.vaccineId)?.shortName ?? selected.vaccineId} · Dose {selected.doseNumber}</dd>
            <dt>Schedule</dt><dd>{formatDate(selected.scheduledDate)}{selected.scheduledTime && ' · ' + formatTime(selected.scheduledTime)}</dd>
            <dt>Guardian</dt><dd>{selected.child.guardian}</dd>
            <dt>Contact</dt><dd>{selected.child.guardianMobile || 'No number recorded'}</dd>
            <dt>Purok</dt><dd>{extractPurok(selected.child.purok)}</dd>
          </dl>
          {selected.scheduleExceptionReason && <p>Schedule exception: {selected.scheduleExceptionReason}</p>}
          {selected.status === 'overdue' && <div>
            <p>{selected.daysOverdue} {selected.daysOverdue === 1 ? 'day' : 'days'} overdue · <span className={FOLLOW_UP_BADGE[selected.followUpStatus ?? 'Pending']}>{selected.followUpStatus ?? 'Pending'}</span></p>
            {selected.followUpNotes && <p className="break-words">{selected.followUpNotes}</p>}
          </div>}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
            <Link to={'/children/' + selected.child.id} state={{ directory: returnTo }} className="mr-auto font-medium underline">Open child profile</Link>
            {selected.status === 'overdue' && <button type="button" className={selectClass} onClick={() => { setSelectedId(null); setFollowUpFor(selected); }}>Follow-up</button>}
            {selected.status !== 'completed' && <>
              <button type="button" className={selectClass} onClick={() => { setSelectedId(null); setRescheduling(selected); }}>Reschedule</button>
              <button type="button" className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-white" onClick={() => { setSelectedId(null); setSmsFor(selected); }}>Prepare SMS</button>
            </>}
          </div>
        </div>
      </Dialog>}
      {smsFor && <SmsDialog appointment={smsFor} onClose={() => setSmsFor(null)} />}

      {followUpFor && (
        <FollowUpDialog
          appointment={followUpFor}
          onClose={() => setFollowUpFor(null)}
          onSave={async (status, notes) => {
            await updateAppointment(followUpFor.id, {
              followUpStatus: status,
              followUpNotes: notes,
              followUpDate: todayISO(),
            });
          }}
        />
      )}

      {booking && (
        <Dialog title="Schedule appointment" onClose={() => setBooking(false)}>
          <AppointmentDialog
            childList={children}
            records={records}
            onSave={async (data) => {
              await addAppointment(data);
            }}
            onClose={() => setBooking(false)}
          />
        </Dialog>
      )}

      {rescheduling && (
        <Dialog title="Reschedule appointment" onClose={() => setRescheduling(null)}>
          <AppointmentDialog
            childList={children}
            records={records}
            defaultChildId={rescheduling.childId}
            lockChild
            defaultVaccineId={rescheduling.vaccineId}
            initial={rescheduling}
            onSave={async (data, id) => {
              if (id) await updateAppointment(id, data);
            }}
            onClose={() => setRescheduling(null)}
          />
        </Dialog>
      )}
    </div>
  );
}

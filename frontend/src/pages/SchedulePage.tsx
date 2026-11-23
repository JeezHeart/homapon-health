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
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-4">
      {/* Header ng Schedule page na may Book Appointment button */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            Immunization Schedule
          </h1>
          <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
            Book vaccinations and manage follow-ups.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBooking(true)}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        >
          Book Appointment
        </button>
      </div>

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
        </div>
      </Card>

      {/* Main layout: kaliwa yung monthly calendar picker, kanan yung appointments table + pagination */}
      <FadeContent className="grid items-start gap-4 xl:grid-cols-[268px_minmax(0,1fr)] xl:items-stretch">
        {/* Monthly calendar card na may Today/Prev/Next controls at count badge per araw */}
        <div className="min-w-0 xl:[&>.health-card]:h-full">
          <Card title={monthLabel}>
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-medium text-[var(--color-navy-soft)]">
                Select a date
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => update({ date: todayISO(), month: todayISO().slice(0, 7), filter: 'today' })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-[var(--color-elevated)]">Today</button>
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1 font-semibold text-[var(--color-navy-soft)]">
                  {d}
                </div>
              ))}
              {cells.map((iso, i) => {
                if (!iso) {
                  return <div key={`empty-${i}`} className="p-2" />;
                }
                const dayNumber = Number(iso.split('-')[2]);
                const count = byDay.get(iso)?.length ?? 0;
                const isSelected = selectedDay === iso;
                const isToday = iso === todayISO();
                const hasOverdue = (byDay.get(iso) ?? []).some(
                  (a) => a.status === 'overdue',
                );
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => update({ date: iso, filter: 'all' })}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${formatDate(iso)}: ${count} appointment${count === 1 ? '' : 's'}${isToday ? ', Today' : ''}${isSelected ? ', Selected date' : ''}`}
                    className={`flex flex-col items-center rounded-xl p-2 transition-colors motion-reduce:transition-none ${isToday ? 'font-bold underline decoration-2 underline-offset-4' : ''} ${
                      isSelected
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-navy)] ring-2 ring-inset ring-[var(--color-accent)]'
                        : isToday
                          ? 'bg-amber-100 font-bold text-amber-900'
                          : 'hover:bg-slate-100'
                    }`}
                  >
                    <span>{dayNumber}</span>
                    <span className={`mt-1 text-[10px] ${hasOverdue ? 'font-semibold text-red-700' : 'text-[var(--color-navy-soft)]'}`}>{count > 0 ? count : '\u00a0'}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-navy-soft)]"><span className="font-bold underline decoration-2 underline-offset-4">Today</span><span className="rounded border border-[var(--color-accent)] px-1.5 py-0.5">Selected date</span></div>
            <p className="mt-3 text-xs text-[var(--color-navy-soft)]">Counts include all statuses matching search, purok, and vaccine. Select a date to view its appointments.</p>
            {selectedDay && <button type="button" onClick={() => update({ date: '' })} className="mt-3 text-xs font-medium underline">Clear selected date</button>}
          </Card>
        </div>

        {/* Appointments table card sa kanan kasama ang pagination footer */}
        <section aria-labelledby="appointment-list-title" className="health-card flex min-w-0 flex-col overflow-hidden !p-0">
          <h2 id="appointment-list-title" className="border-b border-[var(--color-border)] px-4 py-3 text-base font-semibold">
            {selectedDay ? formatDate(selectedDay) : FILTERS.find((f) => f.id === filter)?.label} ({filtered.length})
          </h2>
        {filtered.length === 0 ? (
          <EmptyState
            title="No matching appointments"
            message="Try another date or clear the filters."
          />
        ) : (
          <ul aria-label="Vaccination appointments" className="grid flex-1 auto-rows-fr gap-2 md:grid-cols-2">
            {pagination.visible.map(a => (
              <li key={a.id} className="min-w-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]">
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
      {filtered.length > 0 && <nav aria-label="Schedule pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
        <p role="status" aria-live="polite">{pagination.first}–{pagination.last} of {filtered.length} appointments</p>
        <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${selectClass} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${selectClass} disabled:opacity-40`}>Next</button></div>
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

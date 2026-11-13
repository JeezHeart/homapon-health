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
import { vaccineById } from '../data/vaccines';
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

const FILTERS: { id: ScheduleFilter; label: string }[] = [
  { id: 'all', label: 'All appointments' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];



const FOLLOW_UP_BADGE: Record<FollowUpStatus, string> = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-200',
  Contacted: 'bg-sky-100 text-sky-800 border-sky-200',
  'Home Visited': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Rescheduled: 'bg-purple-100 text-purple-800 border-purple-200',
};

export default function SchedulePage() {
  const { children, records, appointments, addAppointment, updateAppointment } =
    useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = FILTERS.find((item) => item.id === searchParams.get('filter'))?.id ?? 'upcoming';
  const query = searchParams.get('q') ?? '';
  const purokFilter = PUROKS.find((purok) => purok === searchParams.get('purok')) ?? 'all';
  const selectedDay = validScheduleDate(searchParams.get('date'));
  const monthDate = validScheduleDate(`${searchParams.get('month')}-01`) ?? selectedDay ?? todayISO();
  const [year, month] = monthDate.split('-').map(Number);
  const monthCursor = { year, month: month - 1 };
  const size = [5, 10, 25].find((value) => value === Number(searchParams.get('size'))) ?? 10;
  const returnTo = `/schedule${searchParams.size ? `?${searchParams.toString()}` : ''}`;
  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(searchParams);
    next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === 'all' && key === 'purok' || key === 'size' && value === 10 || key === 'page' && value === 1) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }
  const [smsFor, setSmsFor] = useState<EnrichedAppointment | null>(null);
  const [followUpFor, setFollowUpFor] = useState<EnrichedAppointment | null>(null);
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] =
    useState<EnrichedAppointment | null>(null);

  const all = useMemo(
    () => enrichedAppointments(appointments, children, records),
    [appointments, children, records],
  );

  const calendarRows = filterSchedule(all, { query, purok: purokFilter, filter: 'all' });
  const filtered = filterSchedule(all, { query, purok: purokFilter, filter, date: selectedDay });
  const pagination = directoryPage(filtered, Number(searchParams.get('page') ?? 1), size);
  const activeFilters = Boolean(query || purokFilter !== 'all' || selectedDay || filter !== 'upcoming');
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
  function shiftMonth(delta: number) {
    const cursor = shiftMonthCursor(monthCursor, delta);
    update({ month: `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` });
  }

  const selectClass =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-4">
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

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" aria-label="Search appointments by child or guardian" placeholder="Search child or guardian" value={query} onChange={(event) => update({ q: event.target.value })} className="min-w-0 w-full flex-none rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-auto sm:flex-1" />
          <select aria-label="Appointment status filter" value={filter} onChange={(event) => update({ filter: event.target.value, date: '' })} className={selectClass}>{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select aria-label="Filter by purok" value={purokFilter} onChange={(event) => update({ purok: event.target.value })} className={selectClass}><option value="all">All puroks</option>{PUROKS.map((purok) => <option key={purok}>{purok}</option>)}</select>
          {activeFilters && <button type="button" onClick={() => update({ q: '', purok: '', date: '', filter: 'upcoming' })} className={selectClass}>Clear filters</button>}
        </div>
      </Card>

      <FadeContent className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0">
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
            <p className="mt-3 text-xs text-[var(--color-navy-soft)]">Counts include all statuses matching search and purok. Select a date to view its appointments.</p>
            {selectedDay && <button type="button" onClick={() => update({ date: '' })} className="mt-3 text-xs font-medium underline">Clear selected date</button>}
          </Card>
        </div>

        <div className="min-w-0">
      <Card
        title={`${selectedDay ? formatDate(selectedDay) : FILTERS.find((f) => f.id === filter)?.label} (${filtered.length})`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No matching appointments"
            message="Try another date or clear the filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full min-w-[700px] text-left text-sm">
              <caption className="sr-only">Vaccination appointments</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                  <th scope="col" className="pb-2 pr-4 font-semibold">Child</th>
                  <th scope="col" className="pb-2 pr-4 font-semibold">Vaccination</th>
                  <th scope="col" className="pb-2 pr-4 font-semibold">Guardian</th>
                  <th scope="col" className="pb-2 pr-4 font-semibold">Status</th>
                  <th scope="col" className="pb-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.visible.map((a) => {
                  const v = vaccineById(a.vaccineId);
                  const followUp = a.followUpStatus ?? 'Pending';
                  return (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-[var(--color-elevated)] focus-within:bg-[var(--color-elevated)]">
                      <td className="py-2.5 pr-4"><span className="block font-medium">{childName(a.child)}</span><span className="block whitespace-nowrap text-xs text-[var(--color-navy-soft)]">{extractPurok(a.child.purok)}</span></td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{v?.shortName} · Dose {a.doseNumber}</span>
                          <span className="whitespace-nowrap text-xs">{formatDate(a.scheduledDate)}</span>
                          {a.scheduleExceptionReason && (
                            <span className="max-w-xs whitespace-normal break-words text-xs text-amber-950">
                              Schedule exception: {a.scheduleExceptionReason}
                            </span>
                          )}
                          {a.scheduledTime && (
                            <span className="text-xs text-[var(--color-navy-soft)]">
                              {formatTime(a.scheduledTime)}
                            </span>
                          )}
                          {a.status === 'overdue' && a.daysOverdue && (
                            <span className="text-xs font-semibold text-red-600">
                              {a.daysOverdue} day{a.daysOverdue === 1 ? '' : 's'} overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4"><span className="block">{a.child.guardian}</span><span className="block text-xs text-[var(--color-navy-soft)]">{a.child.guardianMobile}</span></td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={a.status} />
                        {a.status === 'overdue' && <div className="mt-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${FOLLOW_UP_BADGE[followUp]}`}>{followUp}</span>{a.followUpNotes && <p className="mt-1 max-w-[150px] break-words text-xs text-[var(--color-navy-soft)]">{a.followUpNotes}</p>}</div>}
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-col items-start gap-2 text-xs font-medium">
                          <Link to={`/children/${a.child.id}`} state={{ directory: returnTo }} className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1.5 hover:bg-slate-50">View record</Link>
                          {a.status !== 'completed' && <details className="min-w-[100px]">
                            <summary className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1.5 hover:bg-[var(--color-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2">More</summary>
                            <div className="mt-2 flex flex-col items-start gap-2">
                              {a.status === 'overdue' && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setFollowUpFor(a); }} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-red-700 hover:bg-red-50">Follow-up</button>}
                              <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setRescheduling(a); }} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-slate-50">Reschedule</button>
                              <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setSmsFor(a); }} className="whitespace-nowrap rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-white">Prepare SMS</button>
                            </div>
                          </details>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {filtered.length > 0 && <nav aria-label="Schedule pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" aria-live="polite">{pagination.first}–{pagination.last} of {filtered.length} appointments</p>
        <div className="flex flex-wrap items-center gap-2"><label htmlFor="schedule-size" className="text-xs">Rows per page</label><select id="schedule-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={selectClass}>{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${selectClass} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${selectClass} disabled:opacity-40`}>Next</button></div>
      </nav>}
        </div>
      </FadeContent>

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

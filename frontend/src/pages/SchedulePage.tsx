import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import AppointmentDialog from '../components/AppointmentDialog';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
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
  isoWeekRange,
  monthCells,
  shiftMonthCursor,
  todayISO,
} from '../utils/dates';

type ScheduleFilter = 'today' | 'week' | 'upcoming' | 'overdue' | 'completed';

const FILTERS: { id: ScheduleFilter; label: string }[] = [
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
  const [searchParams] = useSearchParams();
  const initialFilter = FILTERS.some((f) => f.id === searchParams.get('filter'))
    ? (searchParams.get('filter') as ScheduleFilter)
    : 'upcoming';
  const [filter, setFilter] = useState<ScheduleFilter>(initialFilter);
  const [purokFilter, setPurokFilter] = useState<string>('all');
  const dateParam = searchParams.get('date') ?? '';
  const initialDay = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) &&
    !Number.isNaN(Date.parse(dateParam)) && new Date(dateParam).toISOString().slice(0, 10) === dateParam
    ? dateParam : null;
  const [tYear, tMonth] = (initialDay ?? todayISO()).split('-').map(Number);
  const [monthCursor, setMonthCursor] = useState({
    year: tYear,
    month: tMonth - 1,
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const [smsFor, setSmsFor] = useState<EnrichedAppointment | null>(null);
  const [followUpFor, setFollowUpFor] = useState<EnrichedAppointment | null>(null);
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] =
    useState<EnrichedAppointment | null>(null);

  const all = useMemo(
    () => enrichedAppointments(appointments, children, records),
    [appointments, children, records],
  );

  const filtered = useMemo(() => {
    const today = todayISO();
    const { start: weekStart, end: weekEnd } = isoWeekRange(today);
    let list: EnrichedAppointment[] = [];
    switch (filter) {
      case 'today':
        list = all.filter(
          (a) => a.scheduledDate === today && a.status !== 'completed',
        );
        break;
      case 'week':
        list = all.filter(
          (a) =>
            a.scheduledDate >= weekStart &&
            a.scheduledDate <= weekEnd &&
            a.status !== 'completed',
        );
        break;
      case 'upcoming':
        list = all.filter(
          (a) => a.status === 'upcoming' || a.status === 'due-today',
        );
        break;
      case 'overdue':
        list = all.filter((a) => a.status === 'overdue');
        break;
      case 'completed':
        list = all.filter((a) => a.status === 'completed');
        break;
    }

    if (purokFilter !== 'all') {
      list = list.filter((a) => extractPurok(a.child.purok) === purokFilter);
    }
    return list;
  }, [all, filter, purokFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, EnrichedAppointment[]>();
    for (const a of filtered) {
      const list = map.get(a.scheduledDate) ?? [];
      list.push(a);
      map.set(a.scheduledDate, list);
    }
    return map;
  }, [filtered]);

  const selected = selectedDay
    ? (byDay.get(selectedDay) ?? [])
    : [];

  const monthLabel = new Date(
    monthCursor.year,
    monthCursor.month,
    1,
  ).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const cells = useMemo(
    () => monthCells(monthCursor.year, monthCursor.month),
    [monthCursor],
  );

  function shiftMonth(delta: number) {
    setMonthCursor((c) => shiftMonthCursor(c, delta));
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
            What's due and when · book, reschedule, and track overdue follow-ups
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

      {/* Filter tabs & Purok selector */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  filter === f.id
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-slate-100 text-[var(--color-navy-soft)] hover:bg-slate-200 hover:text-[var(--color-navy)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="sched-purok" className="text-xs font-semibold text-[var(--color-navy-soft)]">
              Purok:
            </label>
            <select
              id="sched-purok"
              value={purokFilter}
              onChange={(e) => setPurokFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">All puroks</option>
              {PUROKS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Calendar + day detail */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={monthLabel}>
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-medium text-[var(--color-navy-soft)]">
                Click a day to view appointments
              </span>
              <div className="flex gap-1">
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
                    onClick={() => setSelectedDay(iso)}
                    className={`flex flex-col items-center rounded-xl p-2 transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-accent)] text-white'
                        : isToday
                          ? 'bg-amber-100 font-bold text-amber-900'
                          : 'hover:bg-slate-100'
                    }`}
                  >
                    <span>{dayNumber}</span>
                    {count > 0 && (
                      <span
                        className={`mt-1 h-1.5 w-1.5 rounded-full ${
                          isSelected
                            ? 'bg-white'
                            : hasOverdue
                              ? 'bg-red-500'
                              : 'bg-sky-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Selected day panel */}
        <Card
          title={
            selectedDay ? formatDate(selectedDay) : 'Select a date'
          }
        >
          {!selectedDay ? (
            <EmptyState
              title="No day selected"
              message="Choose a date on the calendar to see who is scheduled."
            />
          ) : selected.length === 0 ? (
            <EmptyState
              title="No appointments"
              message="No scheduled or overdue doses for this date."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {selected.map((a) => {
                const v = vaccineById(a.vaccineId);
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1 rounded-xl border border-slate-200 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--color-navy)]">
                        {childName(a.child)}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-[var(--color-navy-soft)]">
                      {v?.shortName} · Dose {a.doseNumber}
                      {a.scheduledTime ? ` · ${formatTime(a.scheduledTime)}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {extractPurok(a.child.purok)} · Guardian: {a.child.guardian}
                    </p>
                    {a.scheduleExceptionReason && (
                      <p className="break-words text-xs text-amber-950">
                        Schedule exception: {a.scheduleExceptionReason}
                      </p>
                    )}
                    {a.status === 'overdue' && a.daysOverdue && (
                      <p className="font-semibold text-red-700">
                        {a.daysOverdue} day{a.daysOverdue === 1 ? '' : 's'} overdue
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Link
                        to={`/children/${a.child.id}`}
                        className="rounded-lg border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50"
                      >
                        Profile
                      </Link>
                      {a.status === 'overdue' && (
                        <button
                          type="button"
                          onClick={() => setFollowUpFor(a)}
                          className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100"
                        >
                          Follow-up
                        </button>
                      )}
                      {a.status !== 'completed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setRescheduling(a)}
                            className="rounded-lg border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50"
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => setSmsFor(a)}
                            className="rounded-lg bg-[var(--color-accent)] px-2 py-1 font-semibold text-white hover:opacity-90"
                          >
                            Remind
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Full filtered list */}
      <Card
        title={`${FILTERS.find((f) => f.id === filter)?.label} list (${filtered.length})`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="Nothing here"
            message="No appointments match this filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                  <th className="pb-2 pr-4 font-semibold">Child</th>
                  <th className="pb-2 pr-4 font-semibold">Purok</th>
                  <th className="pb-2 pr-4 font-semibold">Vaccine / dose</th>
                  <th className="pb-2 pr-4 font-semibold">Scheduled Date</th>
                  <th className="pb-2 pr-4 font-semibold">Contact</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  {filter === 'overdue' && (
                    <th className="pb-2 pr-4 font-semibold">Follow-up Log</th>
                  )}
                  <th className="pb-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const v = vaccineById(a.vaccineId);
                  const followUp = a.followUpStatus ?? 'Pending';
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="py-2.5 pr-4 font-medium">
                        {childName(a.child)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {extractPurok(a.child.purok)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {v?.shortName} · Dose {a.doseNumber}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-col">
                          <span>{formatDate(a.scheduledDate)}</span>
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
                      <td className="py-2.5 pr-4">{a.child.guardianMobile}</td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={a.status} />
                      </td>
                      {filter === 'overdue' && (
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              FOLLOW_UP_BADGE[followUp]
                            }`}
                          >
                            {followUp}
                          </span>
                          {a.followUpNotes && (
                            <p
                              title={a.followUpNotes}
                              className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-500"
                            >
                              {a.followUpNotes}
                            </p>
                          )}
                        </td>
                      )}
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                          <Link
                            to={`/children/${a.child.id}`}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                          >
                            Profile
                          </Link>
                          {a.status === 'overdue' && (
                            <button
                              type="button"
                              onClick={() => setFollowUpFor(a)}
                              className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-red-700 hover:bg-red-100"
                            >
                              Follow-up
                            </button>
                          )}
                          {a.status !== 'completed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setRescheduling(a)}
                                className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() => setSmsFor(a)}
                                className="rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-white hover:opacity-90"
                              >
                                Remind
                              </button>
                            </>
                          )}
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

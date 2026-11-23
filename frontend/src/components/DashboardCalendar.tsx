/**
 * DashboardCalendar.tsx
 * Guide: Interactive monthly calendar widget sa Dashboard na may color-coded dots para sa
 * upcoming, due-today, at overdue appointments, plus shortcut sa next clinic session.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from './Card';
import StatusBadge from './StatusBadge';
import { useStore } from '../state/store-context';
import { childName, enrichedAppointments, upcomingAppointments, type EnrichedAppointment } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { isRegularClinicDay, nextClinicSession, nextRegularClinicDate } from '../utils/clinicScheduling';
import { formatDate, formatTime, monthCells, shiftMonthCursor, todayISO } from '../utils/dates';

// Readable status labels para sa screen readers at hover tooltips ng bawat petsa.
const STATUS_LABELS: Record<string, string> = { upcoming: 'Upcoming', 'due-today': 'Due today', overdue: 'Overdue' };

/** Monthly clinic calendar with an appointment preview for the selected date. */
export default function DashboardCalendar() {
  const { appointments, children, records } = useStore();
  const today = todayISO();
  const session = nextClinicSession(upcomingAppointments(appointments, children, records));
  const [year, month] = today.split('-').map(Number);
  const [cursor, setCursor] = useState({ year, month: month - 1 });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [previewBottom, setPreviewBottom] = useState(0);
  const calendar = useRef<HTMLDivElement>(null);
  const dateButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const container = calendar.current;
    const button = dateButton.current;
    if (!selectedDate || !container || !button) return;
    const align = () => {
      setPreviewBottom(container.getBoundingClientRect().bottom - button.getBoundingClientRect().top);
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedDate]);
  useEffect(() => {
    if (!selectedDate) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !calendar.current?.contains(event.target)) setSelectedDate(null);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [selectedDate]);
  const cells = monthCells(cursor.year, cursor.month);
  const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  // Gini-group ang non-completed appointments per date para makapag-display ng count at status dots.
  const appointmentsByDate = new Map<string, EnrichedAppointment[]>();
  const statuses = new Map<string, Set<string>>();
  for (const appointment of enrichedAppointments(appointments, children, records)) {
    if (appointment.status !== 'completed') {
      const day = appointmentsByDate.get(appointment.scheduledDate) ?? [];
      day.push(appointment);
      appointmentsByDate.set(appointment.scheduledDate, day);
      const group = statuses.get(appointment.scheduledDate) ?? new Set<string>();
      group.add(appointment.status); statuses.set(appointment.scheduledDate, group);
    }
  }
  const preview = selectedDate ? [...(appointmentsByDate.get(selectedDate) ?? [])].sort(
    (a, b) => (a.scheduledTime || '99:99').localeCompare(b.scheduledTime || '99:99'),
  ) : [];
  const label = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <Card title="Calendar">
    {/* Month switcher (previous / next month arrows) */}
    <div className="calendar-month-nav">
      <button type="button" className="calendar-arrow" aria-label="Previous month" onClick={() => setCursor(shiftMonthCursor(cursor, -1))}>‹</button>
      <p aria-live="polite" className="text-sm">{label}</p>
      <button type="button" className="calendar-arrow" aria-label="Next month" onClick={() => setCursor(shiftMonthCursor(cursor, 1))}>›</button>
    </div>
    <div ref={calendar} className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape' && selectedDate) {
        event.stopPropagation();
        setSelectedDate(null);
        dateButton.current?.focus();
      }
    }}>
    <div className="dashboard-calendar">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => <span key={i} className="calendar-weekday" aria-hidden="true">{day}</span>)}
      {cells.map((cell, i) => {
        const date = cell ?? new Date(Date.UTC(cursor.year, cursor.month, 1 - firstWeekday + i)).toISOString().slice(0, 10);
        const count = appointmentsByDate.get(date)?.length ?? 0;
        const statusText = Array.from(statuses.get(date) ?? []).map((status) => STATUS_LABELS[status] ?? status).join(', ');
        return <button type="button" key={date} aria-current={date === today ? 'date' : undefined}
        aria-expanded={date === selectedDate} aria-controls={date === selectedDate ? 'dashboard-date-preview' : undefined}
        onClick={(event) => {
          dateButton.current = event.currentTarget;
          setSelectedDate(date === selectedDate ? null : date);
        }}
        aria-label={`${formatDate(date)}, ${count} appointment${count === 1 ? '' : 's'}${statusText ? `, ${statusText}` : ''}`} title={statusText || undefined}
        className={`calendar-day ${date === today ? 'calendar-today' : ''} ${cell ? '' : 'calendar-outside'}`}>
        <span>{Number(date.slice(-2))}</span><span className="calendar-day-dots" aria-hidden="true">{Array.from(statuses.get(date) ?? []).map((status) => <span key={status} className={`calendar-status-dot calendar-status-${status}`} />)}</span>
      </button>;
      })}
    </div>
    {selectedDate && <section id="dashboard-date-preview" aria-label="Appointments on selected date"
      style={{ bottom: previewBottom }}
      className="absolute inset-x-0 z-20 mb-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
      <h3 className="mb-2 text-sm font-semibold" aria-live="polite">{formatDate(selectedDate)} · {preview.length} {preview.length === 1 ? 'appointment' : 'appointments'}</h3>
      {preview.length > 0 ? <ul className="max-h-48 space-y-2 overflow-y-auto">
        {preview.map(appointment => <li key={appointment.id} className="rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-1"><strong>{childName(appointment.child)}</strong><StatusBadge status={appointment.status} /></div>
          <p>{vaccineById(appointment.vaccineId)?.shortName ?? appointment.vaccineId} · Dose {appointment.doseNumber}</p>
          <p className="text-xs text-[var(--color-navy-soft)]">{appointment.scheduledTime ? formatTime(appointment.scheduledTime) : 'Time not set'}</p>
        </li>)}
      </ul> : <p className="text-sm">No pending appointments on this date.</p>}
      <Link to={'/schedule?filter=all&date=' + selectedDate} className="mt-2 inline-block text-sm font-medium underline">Open in Schedule</Link>
    </section>}
    </div>
    {/* Legend para sa kulay ng status dots sa calendar */}
    <div className="calendar-status-legend"><span><i className="calendar-status-dot calendar-status-upcoming" aria-hidden="true" />Upcoming</span><span><i className="calendar-status-dot calendar-status-due-today" aria-hidden="true" />Due today</span><span><i className="calendar-status-dot calendar-status-overdue" aria-hidden="true" />Overdue</span></div>
    {/* Footer summary ng susunod na clinic session o susunod na regular Wednesday */}
    <div className="mt-3 border-t border-[var(--color-border)] pt-2.5">
      <h3 className="text-xs font-medium text-[var(--color-navy-soft)]">Next clinic session</h3>
      {session ? <Link className="mt-0.5 block text-sm font-medium hover:underline" to={`/schedule?date=${session.date}&filter=upcoming`}>{formatDate(session.date)}<span className="block text-xs font-normal text-[var(--color-navy-soft)]">{session.childCount} {session.childCount === 1 ? 'child' : 'children'} · {session.appointmentCount} {session.appointmentCount === 1 ? 'appointment' : 'appointments'}{!isRegularClinicDay(session.date) && ' · Different clinic day'}</span></Link>
        : <p className="mt-0.5 text-xs text-[var(--color-navy-soft)]">No appointments booked. Next regular Wednesday: {formatDate(nextRegularClinicDate())}.</p>}
    </div>
  </Card>;
}

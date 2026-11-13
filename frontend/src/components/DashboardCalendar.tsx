import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from './Card';
import { useStore } from '../state/store-context';
import { enrichedAppointments, upcomingAppointments } from '../data/mockData';
import { isRegularClinicDay, nextClinicSession, nextRegularClinicDate } from '../utils/clinicScheduling';
import { formatDate, monthCells, shiftMonthCursor, todayISO } from '../utils/dates';

const STATUS_LABELS: Record<string, string> = { upcoming: 'Upcoming', 'due-today': 'Due today', overdue: 'Overdue' };

export default function DashboardCalendar() {
  const { appointments, children, records } = useStore();
  const today = todayISO();
  const session = nextClinicSession(upcomingAppointments(appointments, children, records));
  const [year, month] = today.split('-').map(Number);
  const [cursor, setCursor] = useState({ year, month: month - 1 });
  const cells = monthCells(cursor.year, cursor.month);
  const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  const counts = new Map<string, number>();
  const statuses = new Map<string, Set<string>>();
  for (const appointment of enrichedAppointments(appointments, children, records)) {
    if (appointment.status !== 'completed') {
      counts.set(appointment.scheduledDate, (counts.get(appointment.scheduledDate) ?? 0) + 1);
      const group = statuses.get(appointment.scheduledDate) ?? new Set<string>();
      group.add(appointment.status); statuses.set(appointment.scheduledDate, group);
    }
  }
  const label = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <Card title="Calendar">
    <div className="calendar-month-nav">
      <button type="button" className="calendar-arrow" aria-label="Previous month" onClick={() => setCursor(shiftMonthCursor(cursor, -1))}>‹</button>
      <p aria-live="polite" className="text-sm">{label}</p>
      <button type="button" className="calendar-arrow" aria-label="Next month" onClick={() => setCursor(shiftMonthCursor(cursor, 1))}>›</button>
    </div>
    <div className="dashboard-calendar">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => <span key={i} className="calendar-weekday" aria-hidden="true">{day}</span>)}
      {cells.map((cell, i) => {
        const date = cell ?? new Date(Date.UTC(cursor.year, cursor.month, 1 - firstWeekday + i)).toISOString().slice(0, 10);
        const count = counts.get(date) ?? 0;
        const statusText = Array.from(statuses.get(date) ?? []).map((status) => STATUS_LABELS[status] ?? status).join(', ');
        return <Link key={date} to={`/schedule?date=${date}&filter=${date < today ? 'overdue' : 'upcoming'}`} aria-current={date === today ? 'date' : undefined}
        aria-label={`${formatDate(date)}, ${count} appointment${count === 1 ? '' : 's'}${statusText ? `, ${statusText}` : ''}`} title={statusText || undefined}
        className={`calendar-day ${date === today ? 'calendar-today' : ''} ${cell ? '' : 'calendar-outside'}`}>
        <span>{Number(date.slice(-2))}</span><span className="calendar-day-dots" aria-hidden="true">{Array.from(statuses.get(date) ?? []).map((status) => <span key={status} className={`calendar-status-dot calendar-status-${status}`} />)}</span>
      </Link>;
      })}
    </div>
    <div className="calendar-status-legend"><span><i className="calendar-status-dot calendar-status-upcoming" aria-hidden="true" />Upcoming</span><span><i className="calendar-status-dot calendar-status-due-today" aria-hidden="true" />Due today</span><span><i className="calendar-status-dot calendar-status-overdue" aria-hidden="true" />Overdue</span></div>
    <div className="mt-4 border-t border-[var(--color-border)] pt-3">
      <h3 className="text-xs font-medium">Next clinic session</h3>
      {session ? <Link className="mt-1 block text-sm hover:underline" to={`/schedule?date=${session.date}&filter=upcoming`}>{formatDate(session.date)}<span className="block text-xs text-[var(--color-navy-soft)]">{session.childCount} {session.childCount === 1 ? 'child' : 'children'} · {session.appointmentCount} appointments{!isRegularClinicDay(session.date) && ' · Different clinic day'}</span></Link>
        : <p className="mt-1 text-xs text-[var(--color-navy-soft)]">No appointments booked. Next regular Wednesday: {formatDate(nextRegularClinicDate())}. Confirm holiday changes with staff.</p>}
    </div>
  </Card>;
}

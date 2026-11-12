import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from './Card';
import { useStore } from '../state/store-context';
import { enrichedAppointments } from '../data/mockData';
import { formatDate, monthCells, shiftMonthCursor, todayISO } from '../utils/dates';

export default function DashboardCalendar() {
  const { appointments, children, records } = useStore();
  const today = todayISO();
  const [year, month] = today.split('-').map(Number);
  const [cursor, setCursor] = useState({ year, month: month - 1 });
  const cells = monthCells(cursor.year, cursor.month);
  const counts = new Map<string, number>();
  for (const appointment of enrichedAppointments(appointments, children, records)) {
    if (appointment.status !== 'completed') counts.set(appointment.scheduledDate, (counts.get(appointment.scheduledDate) ?? 0) + 1);
  }
  const label = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <Card title="Calendar">
    <div className="mb-5 flex items-center justify-between gap-3">
      <button type="button" className="calendar-arrow" aria-label="Previous month" onClick={() => setCursor(shiftMonthCursor(cursor, -1))}>‹</button>
      <p aria-live="polite" className="text-sm">{label}</p>
      <button type="button" className="calendar-arrow" aria-label="Next month" onClick={() => setCursor(shiftMonthCursor(cursor, 1))}>›</button>
    </div>
    <div className="dashboard-calendar">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => <span key={i} className="calendar-weekday" aria-hidden="true">{day}</span>)}
      {cells.map((date, i) => date ? <Link key={date} to={`/schedule?date=${date}&filter=${date < today ? 'overdue' : 'upcoming'}`} aria-current={date === today ? 'date' : undefined}
        aria-label={`${formatDate(date)}, ${counts.get(date) ?? 0} appointments`}
        className={`calendar-day ${date === today ? 'calendar-today' : ''}`}>
        <span>{Number(date.slice(-2))}</span>{counts.has(date) && <span className="calendar-dot" aria-hidden="true" />}
      </Link> : <span key={`blank-${i}`} />)}
    </div>
    <p className="mt-4 flex items-center gap-2 text-xs text-[var(--color-navy-soft)]"><span className="calendar-dot static" aria-hidden="true" />Appointments</p>
  </Card>;
}

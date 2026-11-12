import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { childName, enrichedAppointments } from '../data/mockData';
import type { EnrichedAppointment } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { calcAge, formatDate, isoWeekRange, todayISO } from '../utils/dates';
import AppointmentDialog from './AppointmentDialog';
import BatchSmsDialog from './BatchSmsDialog';
import Card from './Card';
import Dialog from './Dialog';
import NavIcon from './NavIcon';
import StatusBadge from './StatusBadge';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
] as const;

export default function DashboardAppointments() {
  const { children, records, appointments, updateAppointment, deleteAppointment } = useStore();
  const [period, setPeriod] = useState<typeof PERIODS[number]['id']>('today');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EnrichedAppointment | null>(null);
  const [removing, setRemoving] = useState<EnrichedAppointment | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectAll = useRef<HTMLInputElement>(null);
  const today = todayISO();
  const week = isoWeekRange(today);
  const rows = enrichedAppointments(appointments, children, records).filter((appointment) => {
    const date = appointment.scheduledDate;
    if (period === 'today') return date === today;
    if (period === 'week') return date >= week.start && date <= week.end;
    return date.startsWith(today.slice(0, period === 'month' ? 7 : 4));
  }).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || childName(a.child).localeCompare(childName(b.child)));
  const visible = rows.slice(0, 8);
  const eligible = visible.filter((appointment) => appointment.status !== 'completed');
  const selectedRows = eligible.filter((appointment) => selected.has(appointment.id));
  const allSelected = eligible.length > 0 && selectedRows.length === eligible.length;
  const partiallySelected = selectedRows.length > 0 && !allSelected;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = partiallySelected; }, [partiallySelected]);

  function vaccineLabel(appointment: EnrichedAppointment) {
    return `${vaccineById(appointment.vaccineId)?.shortName ?? appointment.vaccineId} · Dose ${appointment.doseNumber}`;
  }

  async function remove() {
    if (!removing || busy) return;
    setBusy(true); setError('');
    try {
      const result = await deleteAppointment(removing.id);
      if (!result.ok) { setError(result.error); return; }
      setSelected((previous) => { const next = new Set(previous); next.delete(removing.id); return next; });
      setRemoving(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove appointment.'); }
    finally { setBusy(false); }
  }

  return <>
    <section className="dashboard-records" aria-label="Appointment overview"><Card title="Appointment overview" action={<div className="segmented-control" role="group" aria-label="Appointment period">
      {PERIODS.map((item) => <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => { setPeriod(item.id); setSelected(new Set()); }}>{item.label}</button>)}
    </div>}>
      <div className="overview-table-toolbar"><p className="text-xs text-[var(--color-navy-soft)]">Scheduled vaccinations</p>{selectedRows.length > 0 && <button type="button" className="selection-action" onClick={() => setBatchOpen(true)}>Prepare SMS ({selectedRows.length})</button>}</div>
      <div className="overflow-x-auto"><table className="ui-table dashboard-table min-w-[900px] text-left">
        <caption className="sr-only">Appointments in the selected period</caption>
        <thead><tr><th><input ref={selectAll} type="checkbox" aria-label="Select visible appointments" checked={allSelected} disabled={!eligible.length} onChange={() => setSelected(allSelected ? new Set() : new Set(eligible.map((appointment) => appointment.id)))} /></th>{['No', 'Child', 'Age', 'Date of birth', 'Status', 'Guardian', 'Phone', 'Action'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visible.map((appointment, index) => <tr key={appointment.id}>
          <td><input type="checkbox" aria-label={`Select ${childName(appointment.child)}, ${vaccineLabel(appointment)}`} checked={selected.has(appointment.id)} disabled={appointment.status === 'completed'} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(appointment.id)) next.delete(appointment.id); else next.add(appointment.id); return next; })} /></td>
          <td className="text-xs">{String(index + 1).padStart(2, '0')}</td>
          <td><Link to={`/children/${appointment.child.id}`} className="flex items-center gap-3"><span className="child-avatar" aria-hidden="true">{appointment.child.firstName.charAt(0)}{appointment.child.lastName.charAt(0)}</span><span className="whitespace-nowrap"><span className="block text-sm font-medium">{childName(appointment.child)}</span><span className="block text-xs text-[var(--color-navy-soft)]">{vaccineLabel(appointment)}</span></span></Link></td>
          <td className="whitespace-nowrap text-sm">{calcAge(appointment.child.birthDate)}</td>
          <td className="whitespace-nowrap text-sm">{formatDate(appointment.child.birthDate)}</td>
          <td><StatusBadge status={appointment.status} /></td>
          <td className="whitespace-nowrap text-sm">{appointment.child.guardian}</td>
          <td className="whitespace-nowrap text-sm">{appointment.child.guardianMobile}</td>
          <td><div className="flex items-center gap-2"><button type="button" className="table-action" disabled={appointment.status === 'completed'} aria-label={`Reschedule ${childName(appointment.child)}, ${vaccineLabel(appointment)}`} onClick={() => setEditing(appointment)}><NavIcon name="edit" /></button><button type="button" className="table-action table-action-danger" disabled={appointment.status === 'completed'} aria-label={`Remove appointment for ${childName(appointment.child)}, ${vaccineLabel(appointment)}`} onClick={() => { setError(''); setRemoving(appointment); }}><NavIcon name="trash" /></button></div></td>
        </tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <p role="status" className="py-10 text-center text-sm text-[var(--color-navy-soft)]">No appointments in this period.</p>}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--color-navy-soft)]"><span>{visible.length} of {rows.length} appointments</span><Link className="hover:underline" to={`/schedule?filter=${period === 'today' ? 'today' : period === 'week' ? 'week' : 'upcoming'}`}>View schedule</Link></div>
    </Card></section>
    {editing && <Dialog title="Reschedule appointment" onClose={() => setEditing(null)}><AppointmentDialog childList={children} records={records} lockChild initial={editing} onSave={async (data, id) => { if (id) await updateAppointment(id, data); }} onClose={() => setEditing(null)} /></Dialog>}
    {removing && <Dialog title="Remove appointment" onClose={() => { if (!busy) setRemoving(null); }}><p className="text-sm">Remove {vaccineLabel(removing)} for {childName(removing.child)} on {formatDate(removing.scheduledDate)}?</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setRemoving(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Keep appointment</button><button type="button" disabled={busy} onClick={() => void remove()} className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white">{busy ? 'Removing…' : 'Remove appointment'}</button></div></Dialog>}
    {batchOpen && <BatchSmsDialog appointments={selectedRows} onClose={() => setBatchOpen(false)} />}
  </>;
}

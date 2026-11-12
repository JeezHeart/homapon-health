import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BatchSmsDialog from '../components/BatchSmsDialog';
import Card from '../components/Card';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
import SmsDialog from '../components/SmsDialog';
import StatusBadge from '../components/StatusBadge';
import type { EnrichedAppointment, SmsEntry } from '../data/mockData';
import { childById, childName, enrichedAppointments, extractPurok, PUROKS, smsDeliveryLabel } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate, formatTime } from '../utils/dates';
import { directoryPage } from '../utils/childDirectory';
import { smsDirectory } from '../utils/smsDirectory';
import type { ReminderFilter } from '../utils/smsDirectory';
import { useSmsAvailability } from '../utils/useSmsAvailability';

const FILTERS: { id: ReminderFilter; label: string }[] = [
  { id: 'all', label: 'All pending appointments' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'overdue', label: 'Overdue appointments' },
];
const control = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';

export default function SmsPage() {
  const { children, records, appointments, smsLog } = useStore();
  const availability = useSmsAvailability();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'history' ? 'history' : 'prepare';
  const query = params.get('q') ?? '';
  const purok = PUROKS.find((value) => value === params.get('purok')) ?? 'all';
  const filter = FILTERS.find((item) => item.id === params.get('filter'))?.id ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(params.get('size'))) ?? 10;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [smsFor, setSmsFor] = useState<EnrichedAppointment | null>(null);
  const [batchFor, setBatchFor] = useState<EnrichedAppointment[] | null>(null);
  const [messageFor, setMessageFor] = useState<SmsEntry | null>(null);
  const all = useMemo(() => enrichedAppointments(appointments, children, records), [appointments, children, records]);
  const { reminders, history, latest } = smsDirectory(children, all, smsLog, { query, purok, filter });
  const reminderPage = directoryPage(reminders, Number(params.get('page') ?? 1), size);
  const historyPage = directoryPage(history, Number(params.get('page') ?? 1), size);
  const pagination = view === 'prepare' ? reminderPage : historyPage;
  const count = view === 'prepare' ? reminders.length : history.length;
  const selected = reminders.filter((appointment) => selectedIds.has(appointment.id));
  const allShownSelected = reminderPage.visible.length > 0 && reminderPage.visible.every((appointment) => selectedIds.has(appointment.id));
  const activeFilters = Boolean(query || purok !== 'all' || view === 'prepare' && filter !== 'all');

  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (!('page' in patch) && !('size' in patch)) setSelectedIds(new Set());
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === 'all' || key === 'page' && value === 1 || key === 'size' && value === 10 || key === 'view' && value === 'prepare') next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }
  function selectOne(id: string) {
    setSelectedIds((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function selectShown() {
    setSelectedIds((previous) => { const next = new Set(previous); for (const appointment of reminderPage.visible) { if (allShownSelected) next.delete(appointment.id); else next.add(appointment.id); } return next; });
  }

  return <div className="flex flex-col gap-4">
    <div><h1 className="page-title">SMS Notifications</h1><p className="mt-1 text-sm text-[var(--color-navy-soft)]">Prepare vaccination reminders and review SMS attempts.</p></div>
    <div role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <p className="font-medium">{availability.status === 'disabled' ? 'SMS sending disabled' : availability.status === 'checking' ? 'Checking SMS availability' : availability.status === 'unavailable' ? 'SMS availability could not be verified' : availability.status === 'practice' ? 'Practice only - no real SMS is sent' : 'SMS sending enabled'}</p>
      <p className="mt-1 text-xs text-[var(--color-navy-soft)]">{availability.message || (availability.status === 'practice' ? 'Practice entries are labeled separately from real SMS attempts.' : 'Provider acceptance does not confirm delivery to the phone.')}</p>
    </div>
    <div role="group" aria-label="SMS views" className="flex flex-wrap gap-2">
      {(['prepare', 'history'] as const).map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => update({ view: value })} className={`rounded-xl px-4 py-2 text-sm font-medium ${view === value ? 'bg-[var(--color-lavender-soft)] text-[var(--color-navy)]' : 'border border-slate-300 bg-white'}`}>{value === 'prepare' ? 'Prepare reminders' : 'SMS history'}</button>)}
    </div>
    <Card>
      <div className="flex flex-wrap gap-3">
        <input type="search" aria-label="Search SMS by child or guardian" placeholder="Search child or guardian" value={query} onChange={(event) => update({ q: event.target.value })} className="min-w-0 w-full flex-none rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-auto md:flex-1" />
        <select aria-label="Filter by purok" value={purok} onChange={(event) => update({ purok: event.target.value })} className={control}><option value="all">All puroks</option>{PUROKS.map((value) => <option key={value}>{value}</option>)}</select>
        {view === 'prepare' && <select aria-label="Reminder appointment filter" value={filter} onChange={(event) => update({ filter: event.target.value })} className={control}>{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
        {activeFilters && <button type="button" onClick={() => update({ q: '', purok: 'all', filter: 'all' })} className={control}>Clear filters</button>}
      </div>
    </Card>
    {view === 'prepare' ? <Card title={`Prepare reminders (${reminders.length})`} action={<button type="button" disabled={selected.length === 0} onClick={() => setBatchFor(selected)} className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Prepare selected reminders ({selected.length})</button>}>
      {reminders.length === 0 ? <EmptyState title="No matching appointments" message="Change your search or clear the filters." /> : <>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs"><button type="button" onClick={selectShown} className={control}>{allShownSelected ? 'Clear shown' : 'Select shown'}</button><span role="status">{selected.length} reminders selected across pages</span>{selected.length > 0 && <button type="button" onClick={() => setSelectedIds(new Set())} className="underline">Clear selection</button>}</div>
        <ul className="flex flex-col gap-2">{reminderPage.visible.map((appointment) => {
          const vaccine = vaccineById(appointment.vaccineId);
          const last = latest.get(appointment.childId);
          return <li key={appointment.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 text-sm sm:flex-row sm:items-start">
            <input type="checkbox" aria-label={`Select reminder for ${childName(appointment.child)}, ${vaccine?.shortName ?? appointment.vaccineId} dose ${appointment.doseNumber}, ${formatDate(appointment.scheduledDate)}`} checked={selectedIds.has(appointment.id)} onChange={() => selectOne(appointment.id)} className="mt-1 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 break-words"><p className="font-medium">{childName(appointment.child)} - {vaccine?.shortName ?? appointment.vaccineId} - Dose {appointment.doseNumber}</p><p className="mt-1 text-xs text-[var(--color-navy-soft)]">{formatDate(appointment.scheduledDate)}{appointment.scheduledTime ? ` - ${formatTime(appointment.scheduledTime)}` : ''} - {extractPurok(appointment.child.purok)}</p><p className="mt-1 text-xs">{appointment.child.guardian} - {appointment.child.guardianMobile}</p><p className="mt-1 text-xs text-[var(--color-navy-soft)]">{last ? `Latest SMS for this child: ${formatDate(last.sentAt)} - ${last.status}` : 'No SMS history for this child'}</p></div>
            <div className="flex shrink-0 flex-wrap items-center gap-2"><StatusBadge status={appointment.status} /><button type="button" onClick={() => setSmsFor(appointment)} className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white">Prepare SMS</button></div>
          </li>;
        })}</ul>
      </>}
    </Card> : <Card title={`SMS history (${history.length})`}>
      {history.length === 0 ? <EmptyState title="No matching SMS history" message="SMS attempts will appear here. Try clearing any active filters." /> : <ul className="flex flex-col gap-3">{historyPage.visible.map((entry) => {
        const child = childById(children, entry.childId);
        return <li key={entry.id} className="min-w-0 rounded-xl border border-slate-200 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{child ? childName(child) : 'Child record unavailable'}</p><span className="text-xs font-medium">{entry.status}</span></div><p className="mt-1 truncate text-[var(--color-navy-soft)]">{entry.message}</p><p className="mt-2 text-xs text-[var(--color-navy-soft)]">{formatDate(entry.sentAt)} - {smsDeliveryLabel(entry)}</p><button type="button" onClick={() => setMessageFor(entry)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium">View message</button></li>;
      })}</ul>}
    </Card>}
    {count > 0 && <nav aria-label="SMS pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status" aria-live="polite">{pagination.first} - {pagination.last} of {count} {view === 'prepare' ? 'appointments' : 'SMS entries'}</p><div className="flex flex-wrap items-center gap-2"><label htmlFor="sms-size" className="text-xs">Rows per page</label><select id="sms-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={control}>{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${control} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${control} disabled:opacity-40`}>Next</button></div></nav>}
    {smsFor && <SmsDialog appointment={smsFor} onClose={() => setSmsFor(null)} />}
    {batchFor && <BatchSmsDialog appointments={batchFor} onClose={() => setBatchFor(null)} title="Prepare selected reminders" />}
    {messageFor && <Dialog title="SMS message details" onClose={() => setMessageFor(null)}><p className="font-medium">{childById(children, messageFor.childId) ? childName(childById(children, messageFor.childId)!) : 'Child record unavailable'}</p><p className="mt-2 text-sm">{formatDate(messageFor.sentAt)} - {messageFor.status}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm">{messageFor.message}</p><p className="mt-3 text-xs text-[var(--color-navy-soft)]">{smsDeliveryLabel(messageFor)}</p></Dialog>}
  </div>;
}

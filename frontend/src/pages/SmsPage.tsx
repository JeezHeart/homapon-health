/**
 * SMS Notifications page (`/sms`).
 *
 * Hawak nito: dalawang view — "Prepare reminders" (single o batch SMS prep para sa pending/overdue appointments)
 * at "SMS history" (log ng mga na-attempt na iProg SMS o practice-mode reminders), plus availability banner at URL-synced filters.
 * Dito kayo mag-check pag may bug sa SMS availability status, checkbox batch selection, reminder filters, o message details modal.
 */
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

// Mga filter options para sa pending appointments sa Prepare reminders view.
const FILTERS: { id: ReminderFilter; label: string }[] = [
  { id: 'all', label: 'All pending appointments' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'overdue', label: 'Overdue appointments' },
];
const control = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';
const SMS_STATUSES = [
  ['Accepted', 'Accepted · delivery unconfirmed'],
  ['Unknown', 'Uncertain · check before resending'],
  ['Not sent', 'Not sent'],
  ['Failed', 'Failed'],
  ['Sent', 'Legacy sent · delivery unverified'],
  ['Demo sent', 'Dry-run sent'],
  ['Demo failed', 'Dry-run failed'],
] as const satisfies ReadonlyArray<readonly [SmsEntry['status'], string]>;

// Nagre-render ng SMS Notifications hub: iProg SMS / practice status banner, reminder prep queue, at SMS history log.
export default function SmsPage() {
  const { children, records, appointments, smsLog } = useStore();
  // Tsine-check ng custom hook na ito kung enabled ba ang live iProg SMS, disabled, o practice mode lang.
  const availability = useSmsAvailability();
  const [params, setParams] = useSearchParams();
  // URL-synced view toggle (`prepare` vs `history`), search query, purok, appointment filter, at rows per page.
  const view = params.get('view') === 'history' ? 'history' : 'prepare';
  const query = params.get('q') ?? '';
  const purok = PUROKS.find((value) => value === params.get('purok')) ?? 'all';
  const filter = FILTERS.find((item) => item.id === params.get('filter'))?.id ?? 'all';
  const smsStatus = SMS_STATUSES.find(([status]) => status === params.get('smsStatus'))?.[0] ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(params.get('size'))) ?? 10;
  // Local React states para sa batch checkbox selection at pag-open ng single SMS, batch SMS, at message details modals.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [smsFor, setSmsFor] = useState<EnrichedAppointment | null>(null);
  const [batchFor, setBatchFor] = useState<EnrichedAppointment[] | null>(null);
  const [messageFor, setMessageFor] = useState<SmsEntry | null>(null);
  // Kino-compute ang enriched appointments, naka-filter na reminders/history, at active pagination slice.
  const all = useMemo(() => enrichedAppointments(appointments, children, records), [appointments, children, records]);
  const { reminders, history, latest } = smsDirectory(children, all, smsLog, { query, purok, filter, smsStatus });
  const reminderPage = directoryPage(reminders, Number(params.get('page') ?? 1), size);
  const historyPage = directoryPage(history, Number(params.get('page') ?? 1), size);
  const pagination = view === 'prepare' ? reminderPage : historyPage;
  const count = view === 'prepare' ? reminders.length : history.length;
  const selected = reminders.filter((appointment) => selectedIds.has(appointment.id));
  const allShownSelected = reminderPage.visible.length > 0 && reminderPage.visible.every((appointment) => selectedIds.has(appointment.id));
  const activeFilters = Boolean(query || purok !== 'all' || (view === 'prepare' ? filter !== 'all' : smsStatus !== 'all'));

  // Ina-update yung URL params kapag nagpalit ng filter/view/page; kini-clear din yung batch selection pag nagbago ang filter.
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
  // Pang-toggle ng checkbox ng isang appointment sa batch selection set.
  function selectOne(id: string) {
    setSelectedIds((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  // Pang-select o pang-unselect ng lahat ng reminders na visible sa current page.
  function selectShown() {
    setSelectedIds((previous) => { const next = new Set(previous); for (const appointment of reminderPage.visible) { if (allShownSelected) next.delete(appointment.id); else next.add(appointment.id); } return next; });
  }

  return <div className="flex flex-col gap-4">
    {/* Header ng SMS Notifications page */}
    <div><h1 className="page-title">SMS Notifications</h1><p className="mt-1 text-sm text-[var(--color-navy-soft)]">Prepare vaccination reminders and review SMS attempts.</p></div>
    {/* Status banner para malinaw sa staff kung live iProg SMS, disabled, o practice-only ang mode */}
    <div role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <p className="font-medium">{availability.status === 'disabled' ? 'SMS sending disabled' : availability.status === 'checking' ? 'Checking SMS availability' : availability.status === 'unavailable' ? 'SMS availability could not be verified' : availability.status === 'practice' ? 'Offline preview — no real SMS is sent' : availability.dryRun === true ? 'SMS sending enabled (Dry-run — no real SMS sent)' : 'SMS sending enabled (iProg SMS)'}</p>
      <p className="mt-1 text-xs text-[var(--color-navy-soft)]">{availability.message || (availability.status === 'practice' ? 'Practice entries are labeled separately from real SMS attempts.' : 'Provider acceptance does not confirm delivery to the phone.')}</p>
    </div>
    {/* Toggle buttons sa pagitan ng "Prepare reminders" at "SMS history" */}
    <div role="group" aria-label="SMS views" className="flex flex-wrap gap-2">
      {(['prepare', 'history'] as const).map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => update({ view: value })} className={`rounded-xl px-4 py-2 text-sm font-medium ${view === value ? 'bg-[var(--color-lavender-soft)] text-[var(--color-navy)]' : 'border border-slate-300 bg-white'}`}>{value === 'prepare' ? 'Prepare reminders' : 'SMS history'}</button>)}
    </div>
    {/* Filter card: search, purok, at appointment timing filter (lumalabas lang sa prepare view) */}
    <Card>
      <div className="flex flex-wrap gap-3">
        <input type="search" aria-label="Search SMS by child or guardian" placeholder="Search child or guardian" value={query} onChange={(event) => update({ q: event.target.value })} className="min-w-0 w-full flex-none rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-auto md:flex-1" />
        <select aria-label="Filter by purok" value={purok} onChange={(event) => update({ purok: event.target.value })} className={control}><option value="all">All puroks</option>{PUROKS.map((value) => <option key={value}>{value}</option>)}</select>
        {view === 'prepare' && <select aria-label="Reminder appointment filter" value={filter} onChange={(event) => update({ filter: event.target.value })} className={control}>{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
        {view === 'history' && <select aria-label="Filter by SMS status" value={smsStatus} onChange={(event) => update({ smsStatus: event.target.value })} className={control}>
          <option value="all">All SMS statuses</option>
          {SMS_STATUSES.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
        </select>}
        {activeFilters && <button type="button" onClick={() => update({ q: '', purok: 'all', filter: 'all', smsStatus: 'all' })} className={control}>Clear filters</button>}
      </div>
    </Card>
    {/* Main list card: Prepare reminders (may batch checkboxes) o SMS history log */}
    {view === 'prepare' ? <Card title={`Prepare reminders (${reminders.length})`} action={<button type="button" disabled={selected.length === 0} onClick={() => setBatchFor(selected)} className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Prepare selected reminders ({selected.length})</button>}>
      {reminders.length === 0 ? <EmptyState title="No matching appointments" message="Change your search or clear the filters." /> : <>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs"><button type="button" onClick={selectShown} className={control}>{allShownSelected ? 'Clear shown' : 'Select shown'}</button><span role="status">{selected.length} reminders selected across pages</span>{selected.length > 0 && <button type="button" onClick={() => setSelectedIds(new Set())} className="underline">Clear selection</button>}</div>
        <ul className="grid gap-3 md:grid-cols-2">{reminderPage.visible.map((appointment) => {
          const vaccine = vaccineById(appointment.vaccineId);
          const last = latest.get(appointment.childId);
          return <li key={appointment.id} className="flex min-w-0 items-start rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-3 text-sm hover:border-[var(--color-accent)]">
            <input type="checkbox" aria-label={`Select reminder for ${childName(appointment.child)}, ${vaccine?.shortName ?? appointment.vaccineId} dose ${appointment.doseNumber}, ${formatDate(appointment.scheduledDate)}`} checked={selectedIds.has(appointment.id)} onChange={() => selectOne(appointment.id)} className="mt-1 h-4 w-4 shrink-0" />
            <button type="button" aria-haspopup="dialog" onClick={() => setSmsFor(appointment)}
              className="h-full min-w-0 flex-1 rounded-r-xl px-3 py-2.5 text-left hover:bg-[var(--color-elevated)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]">
              <span className="flex flex-wrap items-center justify-between gap-2"><strong>{childName(appointment.child)}</strong><StatusBadge status={appointment.status} /></span>
              <span className="block">{vaccine?.shortName ?? appointment.vaccineId} · Dose {appointment.doseNumber}</span>
              <span className="mt-1 block text-xs text-[var(--color-navy-soft)]">{formatDate(appointment.scheduledDate)}{appointment.scheduledTime && ` · ${formatTime(appointment.scheduledTime)}`} · {extractPurok(appointment.child.purok)}</span>
              <span className="mt-1 block break-words text-xs">{appointment.child.guardian} · {appointment.child.guardianMobile}</span>
              <span className="mt-1 block text-xs text-[var(--color-navy-soft)]">{last ? `Latest SMS: ${formatDate(last.sentAt)} · ${last.status}` : 'No SMS history for this child'}</span>
            </button>
          </li>;
        })}</ul>
      </>}
    </Card> : <Card title={`SMS history (${history.length})`}>
      {history.length === 0 ? <EmptyState title="No matching SMS history" message="SMS attempts will appear here. Try clearing any active filters." /> : <ul className="grid gap-3 md:grid-cols-2">{historyPage.visible.map((entry) => {
        const child = childById(children, entry.childId);
        return <li key={entry.id} className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]">
          <button type="button" aria-haspopup="dialog" onClick={() => setMessageFor(entry)}
            className="block h-full w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--color-elevated)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]">
            <span className="flex flex-wrap items-center justify-between gap-2"><strong>{child ? childName(child) : 'Child record unavailable'}</strong><span className="text-xs font-medium">{entry.status}</span></span>
            <span className="mt-1 block truncate text-[var(--color-navy-soft)]">{entry.message}</span>
            <span className="mt-1 block text-xs text-[var(--color-navy-soft)]">{formatDate(entry.sentAt)} · {smsDeliveryLabel(entry)}</span>
          </button>
        </li>;
      })}</ul>}
    </Card>}
    {/* Pagination footer para sa active view */}
    {count > 0 && <nav aria-label="SMS pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status" aria-live="polite">{pagination.first} - {pagination.last} of {count} {view === 'prepare' ? 'appointments' : 'SMS entries'}</p><div className="flex flex-wrap items-center gap-2"><label htmlFor="sms-size" className="text-xs">Rows per page</label><select id="sms-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={control}>{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${control} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${control} disabled:opacity-40`}>Next</button></div></nav>}
    {/* Mga modals para sa single SMS prep, batch SMS prep, at full SMS message details */}
    {smsFor && <SmsDialog appointment={smsFor} onClose={() => setSmsFor(null)} />}
    {batchFor && <BatchSmsDialog appointments={batchFor} onClose={() => setBatchFor(null)} title="Prepare selected reminders" />}
    {messageFor && <Dialog title="SMS message details" onClose={() => setMessageFor(null)}><p className="font-medium">{childById(children, messageFor.childId) ? childName(childById(children, messageFor.childId)!) : 'Child record unavailable'}</p><p className="mt-2 text-sm">{formatDate(messageFor.sentAt)} - {messageFor.status}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm">{messageFor.message}</p><p className="mt-3 text-xs text-[var(--color-navy-soft)]">{smsDeliveryLabel(messageFor)}</p></Dialog>}
  </div>;
}

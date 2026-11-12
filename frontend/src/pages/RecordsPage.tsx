import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import AppointmentDialog from '../components/AppointmentDialog';
import CorrectionForm from '../components/CorrectionForm';
import Dialog from '../components/Dialog';
import DoseEntryForm from '../components/DoseEntryForm';
import EmptyState from '../components/EmptyState';
import type { DoseRecord } from '../data/mockData';
import {
  childName,
  isFullyImmunized,
  completedDoses,
} from '../data/mockData';
import { REQUIRED_DOSES, VACCINES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate } from '../utils/dates';
import { recordDirectory } from '../utils/recordDirectory';
import { directoryPage } from '../utils/childDirectory';
import { validScheduleDate } from '../utils/scheduleDirectory';

const STATUS_BADGE: Record<string, string> = {
  'Fully immunized': 'bg-emerald-100 text-emerald-800',
  'Partially immunized': 'bg-sky-100 text-sky-800',
};

export default function RecordsPage() {
  const { children, records, addDoseRecord, addAppointment } =
    useStore();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const vaccineFilter = VACCINES.find((vaccine) => vaccine.id === params.get('vaccine'))?.id ?? 'all';
  const from = validScheduleDate(params.get('from')) ?? '';
  const to = validScheduleDate(params.get('to')) ?? '';
  const invalidRange = Boolean(from && to && from > to);
  const size = [5, 10, 25].find((value) => value === Number(params.get('size'))) ?? 10;
  const [expanded, setExpanded] = useState<Map<string, boolean>>(new Map());
  const returnTo = `/records${params.size ? `?${params.toString()}` : ''}`;
  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === 'all' || key === 'page' && value === 1 || key === 'size' && value === 10) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }
  const [adding, setAdding] = useState(false);
  const [correcting, setCorrecting] = useState<DoseRecord | null>(null);
  const [scheduling, setScheduling] = useState<{
    childId: string;
    vaccineId: string;
    doseNumber: number;
  } | null>(null);

  const groups = useMemo(() => invalidRange ? [] : recordDirectory(children, records, { query, vaccine: vaccineFilter, from, to }), [children, records, query, vaccineFilter, from, to, invalidRange]);
  const shownDoses = groups.reduce((total, group) => total + group.doses.length, 0);
  const pagination = directoryPage(groups, Number(params.get('page') ?? 1), size);
  const isExpanded = (id: string) => expanded.get(id) ?? groups.length === 1;
  const allExpanded = groups.length > 0 && groups.every((group) => isExpanded(group.child.id));
  function toggle(id: string) {
    const open = isExpanded(id);
    setExpanded((previous) => new Map(previous).set(id, !open));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">
            Vaccination Records
          </h1>
          <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
            {shownDoses} of {records.length} recorded doses · find and
            fix past entries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {groups.length > 0 && <button type="button" onClick={() => setExpanded(new Map(groups.map((group) => [group.child.id, !allExpanded])))} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50">{allExpanded ? 'Collapse all' : 'Expand all'}</button>}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
          >
            Add Vaccination Record
          </button>
        </div>
      </div>

      <Card>
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_auto_150px_150px_auto]">
          <input
            type="search"
            aria-label="Search by child, guardian, or vaccine"
            placeholder="Search child, guardian, or vaccine"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            className="min-w-0 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:col-span-2 xl:col-span-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          />
          <select
            aria-label="Filter by vaccine"
            value={vaccineFilter}
            onChange={(e) => update({ vaccine: e.target.value })}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <option value="all">All vaccines</option>
            {VACCINES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.shortName}
              </option>
            ))}
          </select>
          <label className="min-w-0 flex-1 text-xs text-[var(--color-navy-soft)]">From date<input type="date" value={from} max={to || undefined} onChange={(event) => update({ from: event.target.value })} className="mt-1 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          <label className="min-w-0 flex-1 text-xs text-[var(--color-navy-soft)]">To date<input type="date" value={to} min={from || undefined} onChange={(event) => update({ to: event.target.value })} className="mt-1 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          {(query || vaccineFilter !== 'all' || from || to) && <button type="button" onClick={() => update({ q: '', vaccine: 'all', from: '', to: '' })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">Clear filters</button>}
        </div>
        {invalidRange && <p role="alert" className="mt-3 text-sm text-red-700">From date must be on or before To date.</p>}
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          title="No matching records"
          message="Change your search, vaccine, or date range. You can also clear the filters."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pagination.visible.map(({ child, doses }) => {
            const open = isExpanded(child.id);
            const done = completedDoses(records, child.id);
            const st = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
            return (
              <section
                key={child.id}
                aria-label={`Records for ${childName(child)}`}
                className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm"
              >
                <div className="flex items-center gap-2 pr-4">
                <button
                  type="button"
                  onClick={() => toggle(child.id)}
                  aria-expanded={open}
                  aria-controls={`doses-${child.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                >
                  <span
                    aria-hidden="true"
                    className={`text-xs font-bold text-[var(--color-navy-soft)] transition-transform ${open ? 'rotate-90' : ''}`}
                  >
                    ▶
                  </span>
                  <span className="text-base font-bold text-[var(--color-navy)]">
                    {childName(child)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[st]}`}
                  >
                    {st}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-navy-soft)]">
                    {done}/{REQUIRED_DOSES} doses
                  </span>
                  <span className="ml-auto text-xs text-[var(--color-navy-soft)]">
                    {child.guardian} · {doses.length} shown
                  </span>
                </button>
                <Link to={`/children/${child.id}`} state={{ directory: returnTo }} aria-label={`View record for ${childName(child)}`} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium">View record</Link>
                </div>
                <div
                  id={`doses-${child.id}`}
                  inert={!open}
                  className="accordion-glide border-t border-slate-100"
                  data-open={open}
                >
                  <div className="accordion-glide-inner">
                    <div className="overflow-x-auto">
                    <table className="ui-table w-full min-w-[620px] text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                          {[
                            'Vaccine / dose',
                            'Date given',
                            'Health worker',
                            'Batch / lot',
                            'Action',
                          ].map((h) => (
                            <th key={h} scope="col" className="px-4 py-2 font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {doses.map((r) => {
                          const v = vaccineById(r.vaccineId);
                          return (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="px-4 py-2 font-medium">
                                {v?.shortName ?? r.vaccineId} · Dose{' '}
                                {r.doseNumber}
                              </td>
                              <td className="px-4 py-2">
                                {formatDate(r.dateAdministered)}
                              </td>
                              <td className="px-4 py-2">{r.healthWorker}</td>
                              <td className="px-4 py-2">{r.batchLot ?? '—'}</td>
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => setCorrecting(r)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                                >
                                  Correct entry
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {groups.length > 0 && <nav aria-label="Vaccination records pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" aria-live="polite">{pagination.first} - {pagination.last} of {groups.length} children</p>
        <div className="flex flex-wrap items-center gap-2"><label htmlFor="record-size" className="text-xs">Children per page</label><select id="record-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button></div>
      </nav>}

      {adding && (
        <Dialog title="Add vaccination record" onClose={() => setAdding(false)}>
          <DoseEntryForm
            childList={children}
            records={records}
            onSave={(data) => addDoseRecord(data)}
            onDone={() => setAdding(false)}
            onScheduleNext={(info) => {
              setAdding(false);
              setScheduling(info);
            }}
          />
        </Dialog>
      )}

      {scheduling && (
        <Dialog title="Schedule next appointment" onClose={() => setScheduling(null)}>
          <AppointmentDialog
            childList={children}
            records={records}
            defaultChildId={scheduling.childId}
            lockChild
            defaultVaccineId={scheduling.vaccineId}
            onSave={async (data) => {
              await addAppointment(data);
            }}
            onClose={() => setScheduling(null)}
          />
        </Dialog>
      )}

      {correcting && (
        <Dialog title="Edit vaccination entry" onClose={() => setCorrecting(null)}>
          <CorrectionForm record={correcting} onClose={() => setCorrecting(null)} />
        </Dialog>
      )}
    </div>
  );
}

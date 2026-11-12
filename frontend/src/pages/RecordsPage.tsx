import { useMemo, useState } from 'react';
import Card from '../components/Card';
import AppointmentDialog from '../components/AppointmentDialog';
import CorrectionForm from '../components/CorrectionForm';
import Dialog from '../components/Dialog';
import DoseEntryForm from '../components/DoseEntryForm';
import EmptyState from '../components/EmptyState';
import type { Child, DoseRecord } from '../data/mockData';
import {
  childById,
  childName,
  childStatus,
  completedDoses,
} from '../data/mockData';
import { REQUIRED_DOSES, VACCINES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate } from '../utils/dates';

const STATUS_BADGE: Record<string, string> = {
  'Fully immunized': 'bg-emerald-100 text-emerald-800',
  'Partially immunized': 'bg-sky-100 text-sky-800',
  Overdue: 'bg-red-100 text-red-800',
};

interface ChildGroup {
  child: Child;
  doses: DoseRecord[];
}

export default function RecordsPage() {
  const { children, records, appointments, addDoseRecord, addAppointment } =
    useStore();
  const [query, setQuery] = useState('');
  const [vaccineFilter, setVaccineFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [correcting, setCorrecting] = useState<DoseRecord | null>(null);
  const [scheduling, setScheduling] = useState<{
    childId: string;
    vaccineId: string;
    doseNumber: number;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => {
        if (vaccineFilter !== 'all' && r.vaccineId !== vaccineFilter)
          return false;
        if (q) {
          const child = childById(children, r.childId);
          const v = vaccineById(r.vaccineId);
          const hay =
            `${child ? childName(child) : ''} ${v?.shortName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered));
  }, [records, children, query, vaccineFilter]);

  const groups = useMemo<ChildGroup[]>(() => {
    const map = new Map<string, DoseRecord[]>();
    for (const r of filtered) {
      const list = map.get(r.childId) ?? [];
      list.push(r);
      map.set(r.childId, list);
    }
    return [...map.entries()]
      .flatMap(([childId, doses]) => {
        const child = childById(children, childId);
        return child ? [{ child, doses }] : [];
      })
      .sort((a, b) => childName(a.child).localeCompare(childName(b.child)));
  }, [filtered, children]);

  // A lone search result opens itself; the BHW already said which child.
  const isExpanded = (id: string) => expanded.has(id) || groups.length === 1;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">
            Vaccination Records
          </h1>
          <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
            {filtered.length} of {records.length} recorded doses · find and
            fix past entries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setExpanded(new Set(groups.map((g) => g.child.id)))
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Collapse all
          </button>
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
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="search"
            aria-label="Search by child or vaccine"
            placeholder="Search child or vaccine…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          />
          <select
            aria-label="Filter by vaccine"
            value={vaccineFilter}
            onChange={(e) => setVaccineFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <option value="all">All vaccines</option>
            {VACCINES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.shortName}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          title="No matching records"
          message="Try a different search term or clear the vaccine filter."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ child, doses }) => {
            const open = isExpanded(child.id);
            const done = completedDoses(records, child.id);
            const st = childStatus(appointments, records, child.id);
            return (
              <section
                key={child.id}
                aria-label={`Records for ${childName(child)}`}
                className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggle(child.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
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
                <div
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
                            <th key={h} className="px-4 py-2 font-semibold">
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
                                  Edit
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

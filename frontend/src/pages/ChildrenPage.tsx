import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import ChildForm from '../components/ChildForm';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
import type { Child, NewChild } from '../data/mockData';
import {
  childName,
  childStatus,
  extractPurok,
  nextAppointment,
  PUROKS,
} from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { exportChildrenList } from '../utils/csv';
import { calcAge, formatDate, formatTime } from '../utils/dates';

type StatusFilter = 'all' | 'Fully immunized' | 'Partially immunized' | 'Overdue';
type ScheduleFilter = 'all' | 'upcoming' | 'overdue';

const STATUS_BADGE: Record<string, string> = {
  'Fully immunized': 'bg-emerald-100 text-emerald-800',
  'Partially immunized': 'bg-sky-100 text-sky-800',
  Overdue: 'bg-red-100 text-red-800',
};

export default function ChildrenPage() {
  const { children, records, appointments, addChild, updateChild, deleteChild } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  function setQuery(value: string) {
    setSearchParams((previous) => {
      if (value) previous.set('q', value); else previous.delete('q');
      return previous;
    }, { replace: true });
  }
  const requestedStatus = searchParams.get('status');
  const statusFilter: StatusFilter = requestedStatus === 'Fully immunized' || requestedStatus === 'Partially immunized' || requestedStatus === 'Overdue' ? requestedStatus : 'all';
  function setStatusFilter(value: StatusFilter) {
    setSearchParams((previous) => {
      if (value === 'all') previous.delete('status'); else previous.set('status', value);
      return previous;
    }, { replace: true });
  }
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [purokFilter, setPurokFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [dialog, setDialog] = useState<
    { mode: 'register' } | { mode: 'edit'; child: Child } | null
  >(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return children.filter((c) => {
      if (q) {
        const hay = `${childName(c)} ${c.guardian}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (purokFilter !== 'all' && extractPurok(c.purok) !== purokFilter) {
        return false;
      }
      const st = childStatus(appointments, records, c.id);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (scheduleFilter !== 'all') {
        const next = nextAppointment(appointments, children, records, c.id);
        if (!next) return false;
        if (scheduleFilter === 'overdue' && next.status !== 'overdue')
          return false;
        if (
          scheduleFilter === 'upcoming' &&
          !(next.status === 'upcoming' || next.status === 'due-today')
        )
          return false;
      }
      return true;
    });
  }, [children, records, appointments, query, statusFilter, scheduleFilter, purokFilter]);

  async function handleSubmit(data: NewChild) {
    if (dialog?.mode === 'edit') await updateChild(dialog.child.id, data);
    else await addChild(data);
    setDialog(null);
  }

  async function handleDelete(c: Child) {
    setDeleteError('');
    if (confirmDeleteId !== c.id) {
      setConfirmDeleteId(c.id);
      return;
    }
    setConfirmDeleteId(null);
    const res = await deleteChild(c.id);
    if (!res.ok) setDeleteError(`Could not delete ${childName(c)}: ${res.error}`);
  }

  const selectClass =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">
            Child Records
          </h1>
          <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
            {filtered.length} of {children.length} children · find a child, or register and fix records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportChildrenList(filtered, appointments, records)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-[var(--color-navy)] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Export Directory (CSV)
          </button>
          <button
            type="button"
            onClick={() => setDialog({ mode: 'register' })}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
          >
            Register Child
          </button>
        </div>
      </div>

      {deleteError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {deleteError}
        </p>
      )}

      <Card>
        <div className="flex flex-col items-start gap-3 xl:flex-row">
          <input
            type="search"
            aria-label="Search by child or guardian name"
            placeholder="Search child or guardian name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          />
          <div className="flex shrink-0 flex-wrap gap-2">
            <select
              aria-label="Filter by purok"
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
            <select
              aria-label="Filter by immunization status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={selectClass}
            >
              <option value="all">All statuses</option>
              <option value="Fully immunized">Fully immunized</option>
              <option value="Partially immunized">Partially immunized</option>
              <option value="Overdue">Overdue</option>
            </select>
            <select
              aria-label="Filter by schedule"
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value as ScheduleFilter)}
              className={selectClass}
            >
              <option value="all">All schedules</option>
              <option value="upcoming">Upcoming</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={children.length === 0 ? 'No children registered' : 'No matching records'}
          message={
            children.length === 0
              ? 'Register the first child to start building the demo registry.'
              : 'Try a different name or clear the filters.'
          }
          action={
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setPurokFilter('all');
                setStatusFilter('all');
                setScheduleFilter('all');
              }}
              className="mt-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Clear search & filters
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
          <table className="ui-table w-full min-w-[940px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                {['Child', 'Birth / age', 'Guardian', 'Mobile', 'Purok', 'Status', 'Next vaccine', 'Actions'].map(
                  (h) => (
                    <th key={h} className="px-4 py-2 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = childStatus(appointments, records, c.id);
                const next = nextAppointment(appointments, children, records, c.id);
                const v = next ? vaccineById(next.vaccineId) : undefined;
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-[var(--color-navy)]">
                      {childName(c)}
                      <span className="block text-xs font-normal text-[var(--color-navy-soft)]">
                        {c.sex}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {formatDate(c.birthDate)}
                      <span className="block text-xs text-[var(--color-navy-soft)]">
                        {calcAge(c.birthDate)}
                      </span>
                    </td>
                    <td className="px-4 py-2">{c.guardian}</td>
                    <td className="px-4 py-2">{c.guardianMobile}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {extractPurok(c.purok)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[st]}`}
                      >
                        {st}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {next && v
                        ? `${v.shortName} · D${next.doseNumber} · ${formatDate(next.scheduledDate)}${next.scheduledTime ? ` · ${formatTime(next.scheduledTime)}` : ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="grid grid-cols-2 gap-1.5 text-center text-xs font-semibold">
                        <Link
                          to={`/children/${c.id}`}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: 'edit', child: c })}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <Link
                          to={`/children/${c.id}?tab=document`}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                        >
                          Record
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(c)}
                          className={
                            confirmDeleteId === c.id
                              ? 'rounded-lg bg-red-700 px-2.5 py-1 text-white hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]'
                              : 'rounded-lg border border-red-300 px-2.5 py-1 text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]'
                          }
                        >
                          {confirmDeleteId === c.id ? 'Sure?' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <Dialog
          title={dialog.mode === 'edit' ? 'Edit child record' : 'Register child'}
          onClose={() => setDialog(null)}
        >
          <ChildForm
            initial={dialog.mode === 'edit' ? dialog.child : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setDialog(null)}
          />
        </Dialog>
      )}
    </div>
  );
}

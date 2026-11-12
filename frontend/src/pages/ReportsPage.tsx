import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import {
  childName,
  childStatus,
  completedDoses,
  extractPurok,
  overdueAppointments,
  PUROKS,
  upcomingAppointments,
} from '../data/mockData';
import { VACCINES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { exportAdministeredDoses, exportTargetClientList } from '../utils/csv';
import { formatDate, todayISO } from '../utils/dates';

/**
 * Reports (prd.md section 12). Every figure derives from the same
 * store selectors as the dashboard, so values stay consistent.
 */
export default function ReportsPage() {
  const { children, records, appointments } = useStore();
  const [from, setFrom] = useState(() => todayISO().slice(0, 7) + '-01');
  const [to, setTo] = useState(() => todayISO());

  const statusGroups = useMemo(() => {
    const groups = {
      'Fully immunized': 0,
      'Partially immunized': 0,
      Overdue: 0,
    };
    for (const c of children) {
      groups[childStatus(appointments, records, c.id)] += 1;
    }
    return groups;
  }, [children, appointments, records]);

  const purokSummary = useMemo(() => {
    return PUROKS.map((p) => {
      const list = children.filter((c) => extractPurok(c.purok) === p);
      let fully = 0;
      let partial = 0;
      let overdueCount = 0;
      for (const c of list) {
        const st = childStatus(appointments, records, c.id);
        if (st === 'Fully immunized') fully++;
        else if (st === 'Overdue') overdueCount++;
        else partial++;
      }
      return {
        purok: p,
        total: list.length,
        fully,
        partial,
        overdue: overdueCount,
        coverageRate: list.length > 0 ? Math.round((fully / list.length) * 100) : 0,
      };
    });
  }, [children, appointments, records]);

  const periodRecords = useMemo(
    () =>
      records
        .filter((r) => r.dateAdministered >= from && r.dateAdministered <= to)
        .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered)),
    [records, from, to],
  );

  const perVaccine = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of periodRecords) {
      map.set(r.vaccineId, (map.get(r.vaccineId) ?? 0) + 1);
    }
    return VACCINES.map((v) => ({ vaccine: v, count: map.get(v.id) ?? 0 })).filter(
      (row) => row.count > 0,
    );
  }, [periodRecords]);

  const upcoming = upcomingAppointments(appointments, children, records);
  const overdue = overdueAppointments(appointments, children, records);
  const total = children.length || 1;

  const coverage = [
    {
      label: 'Fully immunized',
      count: statusGroups['Fully immunized'],
      classes: 'bg-emerald-500',
    },
    {
      label: 'Partially immunized',
      count: statusGroups['Partially immunized'],
      classes: 'bg-sky-500',
    },
    { label: 'Overdue', count: statusGroups.Overdue, classes: 'bg-red-500' },
  ];

  const inputClass =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
          Summaries for the midwife · same data as the dashboard · {children.length} child{children.length === 1 ? '' : 'ren'} on file
        </p>
      </div>

      <div className="no-print flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => exportTargetClientList(children, records, appointments)}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-navy)] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Export DOH TCL (CSV)
        </button>
        <button
          type="button"
          onClick={() => exportAdministeredDoses(records, children, from, to)}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-navy)] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Export Period Doses (CSV)
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Status summary + coverage */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Immunization status summary">
          <ul className="flex flex-col gap-2 text-sm">
            {(
              Object.entries(statusGroups) as [
                keyof typeof statusGroups,
                number,
              ][]
            ).map(([label, count]) => (
              <li
                key={label}
                className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0 first:pt-0"
              >
                <span>{label}</span>
                <span className="font-bold text-[var(--color-navy)]">
                  {count} child{count === 1 ? '' : 'ren'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Coverage">
          <div
            className="flex h-6 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`Coverage: ${statusGroups['Fully immunized']} fully immunized, ${statusGroups['Partially immunized']} partially immunized, ${statusGroups.Overdue} overdue.`}
          >
            {coverage.map(
              (c) =>
                c.count > 0 && (
                  <div
                    key={c.label}
                    className={c.classes}
                    style={{ width: `${(c.count / total) * 100}%` }}
                  />
                ),
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {coverage.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${c.classes}`}
                />
                {c.label} — {c.count} (
                {Math.round((c.count / total) * 100)}%)
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Coverage by Purok (Barangay Outreach) */}
      <Card title="Purok Breakdown (Reaching Every Purok)">
        <div className="overflow-x-auto">
          <table className="ui-table w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                <th className="pb-2 pr-4 font-semibold">Purok</th>
                <th className="pb-2 pr-4 font-semibold">Registered</th>
                <th className="pb-2 pr-4 font-semibold">Fully Immunized</th>
                <th className="pb-2 pr-4 font-semibold">Partially</th>
                <th className="pb-2 pr-4 font-semibold">Overdue / Defaulters</th>
                <th className="pb-2 font-semibold">Coverage Rate</th>
              </tr>
            </thead>
            <tbody>
              {purokSummary.map((row) => (
                <tr key={row.purok} className="border-t border-slate-100">
                  <td className="py-2.5 pr-4 font-medium text-[var(--color-navy)]">
                    {row.purok}
                  </td>
                  <td className="py-2.5 pr-4">{row.total}</td>
                  <td className="py-2.5 pr-4 text-emerald-700 font-medium">{row.fully}</td>
                  <td className="py-2.5 pr-4 text-sky-700">{row.partial}</td>
                  <td className="py-2.5 pr-4">
                    {row.overdue > 0 ? (
                      <span className="font-semibold text-red-600">
                        {row.overdue} overdue
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${row.coverageRate}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold">
                        {row.coverageRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Doses in period */}
      <Card
        title={`Doses administered · ${periodRecords.length} in period`}
        action={
          <div className="no-print flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="rep-from" className="text-xs font-semibold">
              From
            </label>
            <input
              id="rep-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
            <label htmlFor="rep-to" className="text-xs font-semibold">
              To
            </label>
            <input
              id="rep-to"
              type="date"
              value={to}
              min={from}
              max={todayISO()}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </div>
        }
      >
        {perVaccine.length === 0 ? (
          <EmptyState
            title="No doses in this period"
            message="Widen the date range to see per-vaccine counts."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                  <th className="pb-2 pr-4 font-semibold">Vaccine</th>
                  <th className="pb-2 font-semibold">Doses</th>
                </tr>
              </thead>
              <tbody>
                {perVaccine.map(({ vaccine, count }) => (
                  <tr key={vaccine.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-medium">{vaccine.name}</td>
                    <td className="py-2 font-bold">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Upcoming & missed */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title={`Upcoming (${upcoming.length})`}
          action={
            <Link
              to="/schedule"
              className="text-sm font-semibold text-[var(--color-accent-dark)] hover:underline"
            >
              Open schedule
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing upcoming"
              message="No pending appointments in the demo dataset."
            />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {upcoming.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 border-t border-slate-100 py-1.5 first:border-t-0"
                >
                  <span>
                    {childName(a.child)} ·{' '}
                    {vaccineById(a.vaccineId)?.shortName} ·{' '}
                    {formatDate(a.scheduledDate)}
                  </span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Missed / overdue (${overdue.length})`}>
          {overdue.length === 0 ? (
            <EmptyState
              title="Nothing overdue"
              message="Every scheduled dose is on track."
            />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {overdue.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 border-t border-slate-100 py-1.5 first:border-t-0"
                >
                  <div className="flex flex-col">
                    <span>
                      {childName(a.child)} · {vaccineById(a.vaccineId)?.shortName}
                    </span>
                    <span className="text-xs text-[var(--color-navy-soft)]">
                      Due {formatDate(a.scheduledDate)}
                      {a.daysOverdue ? ` (${a.daysOverdue}d overdue)` : ''} · {extractPurok(a.child.purok)}
                    </span>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Per-child progress (uses recordsForChild so the import stays honest) */}
      <Card title="Doses per child">
        <div className="overflow-x-auto">
          <table className="ui-table w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                <th className="pb-2 pr-4 font-semibold">Child</th>
                <th className="pb-2 pr-4 font-semibold">Purok</th>
                <th className="pb-2 pr-4 font-semibold">Completed doses</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {children.map((c) => {
                const done = completedDoses(records, c.id);
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-medium">{childName(c)}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {extractPurok(c.purok)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{done}</td>
                    <td className="py-2">
                      {childStatus(appointments, records, c.id)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

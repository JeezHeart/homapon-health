/**
 * GrowthSummary.tsx
 * Guide pang-defense: Compact Dashboard widget na nagsu-summarize ng pinaka-latest na WHO growth status
 * ng lahat ng naka-register na bata. Pindutin ang kahit aling bucket o "View records" para buksan
 * ang click-to-open detail card na may direct link papunta sa Growth tab ng bawat bata.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from './Card';
import Dialog from './Dialog';
import { api, apiEnabled, apiError } from '../data/api';
import { childName } from '../data/mockData';
import { useStore } from '../state/store-context';
import type { GrowthMeasurement } from '../utils/growth';
import { summarizeGrowth } from '../utils/growthSummary';
import type { GrowthGroup } from '../utils/growthSummary';
import { formatDate } from '../utils/dates';

// Apat na summary buckets na nagso-sort sa bawat bata base sa latest WHO growth indicator nila.
const groups: { id: GrowthGroup; label: string }[] = [
  { id: 'review', label: 'Needs staff review' },
  { id: 'within', label: 'Within WHO range' },
  { id: 'incomplete', label: 'Incomplete / unavailable' },
  { id: 'missing', label: 'No dated measurements' },
];

/** Compact WHO growth counts widget na may click-to-open detail card para manatiling maikli ang Dashboard. */
export default function GrowthSummary() {
  const { children, demoGrowth, dataReady, connected } = useStore();
  const [remote, setRemote] = useState<GrowthMeasurement[]>([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<GrowthGroup | 'all' | null>(null);

  // React effect pang-fetch ng latest growth measurement per child sa backend API (nagre-rerun pag nag-click ng Retry).
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    api.latestGrowthMeasurements()
      .then((rows) => { if (!cancelled) setRemote(rows); })
      .catch((e) => { if (!cancelled) setError(apiError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  const rows = summarizeGrowth(children, apiEnabled ? remote : demoGrowth);
  const recorded = rows.filter((r) => r.measurement).length;
  const listed = rows.filter((r) => selected === 'all' || r.group === selected);
  const activeTitle =
    selected === 'all'
      ? 'All growth monitoring records'
      : groups.find((g) => g.id === selected)?.label ?? 'Growth monitoring records';

  return (
    <>
      <Card
        title="Growth Monitoring Summary"
        action={
          <button
            type="button"
            className="rounded-lg bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-accent-dark)] hover:opacity-90"
            onClick={() => setSelected('all')}
          >
            View records
          </button>
        }
      >
        {loading || !dataReady ? (
          <p role="status" className="text-sm text-[var(--color-navy-soft)]">Loading growth measurements...</p>
        ) : error || (apiEnabled && !connected) ? (
          <div role="alert" className="text-sm">
            <p>Growth summary unavailable. {error || 'Child records are unavailable. Restore the connection and reload the page.'}</p>
            <button
              className="mt-2 font-medium underline"
              type="button"
              onClick={() => { setLoading(true); setError(''); setAttempt((n) => n + 1); }}
            >
              Retry growth summary
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {groups.map((group) => {
                const count = rows.filter((r) => r.group === group.id).length;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelected(group.id)}
                    className="flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-2.5 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  >
                    <span className="min-w-0 text-xs text-[var(--color-navy-soft)]">{group.label}</span>
                    <span className="text-base font-semibold tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-navy-soft)]">
              {recorded} of {children.length} children have dated measurements. Review indicators only.{!apiEnabled && ' Demo records only.'}
            </p>
          </>
        )}
      </Card>

      {/* Click-to-open detail card para sa listahan ng mga bata sa napiling WHO growth bucket */}
      {selected !== null && (
        <Dialog title={activeTitle} size="wide" onClose={() => setSelected(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={selected === 'all'}
                onClick={() => setSelected('all')}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${selected === 'all' ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]' : 'border-[var(--color-border)] text-[var(--color-navy-soft)]'}`}
              >
                All ({rows.length})
              </button>
              {groups.map((group) => {
                const count = rows.filter((r) => r.group === group.id).length;
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={selected === group.id}
                    onClick={() => setSelected(group.id)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${selected === group.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]' : 'border-[var(--color-border)] text-[var(--color-navy-soft)]'}`}
                  >
                    {group.label} ({count})
                  </button>
                );
              })}
            </div>

            {!listed.length ? (
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-navy-soft)]">
                No children in this group.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-[var(--color-border)] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                {listed.map(({ child, measurement, group }) => (
                  <li key={child.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--color-navy)]">{childName(child)}</p>
                      <p className="text-xs text-[var(--color-navy-soft)]">
                        {groups.find((g) => g.id === group)?.label}
                        {measurement ? ` · Measured ${formatDate(measurement.measuredOn)}` : ''}
                      </p>
                    </div>
                    <Link
                      className="shrink-0 rounded-lg bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-dark)] hover:opacity-90"
                      to={`/children/${child.id}?tab=growth`}
                    >
                      View growth<span className="sr-only"> for {childName(child)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-[var(--color-navy-soft)]">
              Each child is counted once using their latest dated measurement. Growth comparisons are review indicators for staff, not medical diagnoses.
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}

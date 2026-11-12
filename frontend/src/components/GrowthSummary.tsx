import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from './Card';
import { api, apiEnabled, apiError } from '../data/api';
import { childName } from '../data/mockData';
import { useStore } from '../state/store-context';
import type { GrowthMeasurement } from '../utils/growth';
import { summarizeGrowth } from '../utils/growthSummary';
import type { GrowthGroup } from '../utils/growthSummary';
import { formatDate } from '../utils/dates';

const groups: { id: GrowthGroup; label: string }[] = [
  { id: 'review', label: 'Needs staff review' },
  { id: 'within', label: 'Comparisons within range' },
  { id: 'incomplete', label: 'Incomplete / unavailable comparisons' },
  { id: 'missing', label: 'No dated measurements' },
];

export default function GrowthSummary() {
  const { children, demoGrowth, dataReady, connected } = useStore();
  const [remote, setRemote] = useState<GrowthMeasurement[]>([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<GrowthGroup | 'all' | null>(null);
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    api.latestGrowthMeasurements().then((rows) => { if (!cancelled) setRemote(rows); })
      .catch((e) => { if (!cancelled) setError(apiError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);
  const rows = summarizeGrowth(children, apiEnabled ? remote : demoGrowth);
  const recorded = rows.filter((r) => r.measurement).length;
  const listed = rows.filter((r) => selected === 'all' || r.group === selected);
  return <Card title="Growth Monitoring Summary" action={<button type="button" className="text-sm font-semibold text-[var(--color-accent-dark)] underline" aria-expanded={selected !== null} onClick={() => setSelected(selected === null ? 'all' : null)}>{selected === null ? 'View records' : 'Hide records'}</button>}>
    {loading || !dataReady ? <p role="status">Loading growth measurements...</p>
      : error || (apiEnabled && !connected) ? <div role="alert"><p>Growth summary unavailable. {error || 'Child records are unavailable. Restore the connection and reload the page.'}</p><button className="mt-2 underline" type="button" onClick={() => { setLoading(true); setError(''); setAttempt((n) => n + 1); }}>Retry growth summary</button></div>
      : <>
        <p className="mb-4 text-sm"><strong>{recorded}</strong> of {children.length} registered children have dated measurements. {!apiEnabled && 'Demo records only.'}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((group) => {
            const count = rows.filter((r) => r.group === group.id).length;
            return <button key={group.id} type="button" aria-pressed={selected === group.id} onClick={() => setSelected(group.id)} className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700">
              <span className="mb-1 block text-xl font-semibold">{count}</span><span className="block text-xs">{group.label}</span>
            </button>;
          })}
        </div>
        <p className="mt-3 text-xs text-slate-600">Growth comparisons are review indicators, not diagnoses.</p>
        <details className="mt-2 text-xs text-slate-600"><summary className="w-fit cursor-pointer">How counts work</summary><p className="mt-2 max-w-prose">Each child is counted once using their latest dated record. Review includes out-of-range indicators or measurements needing verification. Incomplete comparisons include missing inputs, unassessed swelling, or age outside the supported WHO range.</p></details>
        {selected !== null && <div className="mt-4">
          <h3 className="mb-2 font-semibold">{selected === 'all' ? 'All growth records' : groups.find((g) => g.id === selected)?.label}</h3>
          {!listed.length ? <p className="text-sm">No children in this group.</p> : <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">{listed.map(({ child, measurement, group }) => <li key={child.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><span className="font-medium">{childName(child)}</span><span className="block text-xs text-slate-600">{groups.find((g) => g.id === group)?.label}{measurement ? ` - ${formatDate(measurement.measuredOn)}` : ''}</span></span><Link className="shrink-0 font-semibold text-[var(--color-accent-dark)] underline" to={`/children/${child.id}?tab=growth`}>View growth<span className="sr-only"> for {childName(child)}</span></Link></li>)}</ul>}
        </div>}
      </>}
  </Card>;
}

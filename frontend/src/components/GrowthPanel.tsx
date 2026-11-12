import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Child } from '../data/mockData';
import { api, apiEnabled, apiError } from '../data/api';
import { useStore } from '../state/store-context';
import { formatDate } from '../utils/dates';
import { smsTodayISO } from '../utils/sms';
import { adjustedHeight, ageDays, growthIndicator, growthReference, referenceValue } from '../utils/growth';
import type { GrowthMeasurement, GrowthMetric, NewGrowthMeasurement } from '../utils/growth';
import Card from './Card';

const metrics: { id: GrowthMetric; label: string }[] = [
  { id: 'weight', label: 'Weight for age' },
  { id: 'height', label: 'Length/height for age' },
  { id: 'proportion', label: 'Weight for length/height' },
];

function Chart({ rows, child, metric }: { rows: GrowthMeasurement[]; child: Child; metric: 'weight' | 'height' }) {
  const points = rows.flatMap((r) => {
    const days = ageDays(child.birthDate, r.measuredOn);
    const value = metric === 'weight' ? r.weightKg : adjustedHeight(r, days);
    return value === undefined ? [] : [{ days, value, date: r.measuredOn }];
  });
  if (!points.length) return <p>No dated {metric} measurements yet.</p>;
  const maxAge = Math.max(183, ...points.map((p) => p.days));
  const refs = Array.from({ length: Math.ceil(Math.min(maxAge, 1825) / 30) + 1 }, (_, i) => {
    const days = Math.min(i * 30, 1825);
    const ref = growthReference(metric, child.sex, days);
    return ref ? { days, low: referenceValue(ref, -2), mid: ref.m, high: referenceValue(ref, 2) } : null;
  }).filter((r) => r !== null);
  const min = Math.max(0, Math.min(...points.map((p) => p.value), ...refs.map((r) => r.low)) * 0.9);
  const max = Math.max(...points.map((p) => p.value), ...refs.map((r) => r.high)) * 1.1;
  const x = (days: number) => 55 + days / maxAge * 500;
  const y = (value: number) => 220 - (value - min) / (max - min) * 190;
  const line = (p: { days: number; value: number }[]) => p.map((v) => `${x(v.days)},${y(v.value)}`).join(' ');
  return <>
    <svg viewBox="0 0 600 265" role="img" aria-label={`${metric} chart. Points are recorded measurements; dashed lines are WHO minus and plus two standard deviations, solid gray is the median. Values are in the measurement history below.`} className="w-full">
      <path d="M55 25V220H565" fill="none" stroke="var(--color-navy-soft)" />
      {[0, 1, 2, 3, 4].map((n) => {
        const value = min + n / 4 * (max - min);
        return <g key={n}><text x="48" y={y(value) + 4} textAnchor="end" fontSize="11">{value.toFixed(1)}</text><path d={`M55 ${y(value)}H565`} stroke="var(--color-chart-grid)" /></g>;
      })}
      {(['low', 'mid', 'high'] as const).map((band) => <polyline key={band} points={line(refs.map((r) => ({ days: r.days, value: r[band] })))} fill="none" stroke="var(--color-chart-reference)" strokeDasharray={band === 'mid' ? undefined : '5 4'} />)}
      <polyline points={line(points)} fill="none" stroke="var(--color-chart-measurement)" strokeWidth="2" />
      {points.map((p) => <circle key={p.date} cx={x(p.days)} cy={y(p.value)} r="4" fill="var(--color-chart-measurement)"><title>{p.date}: {p.value.toFixed(1)} {metric === 'weight' ? 'kg' : 'cm'}</title></circle>)}
      {[0, 1, 2, 3, 4].map((n) => <text key={n} x={x(maxAge * n / 4)} y="238" textAnchor="middle" fontSize="11">{(maxAge * n / 4 / 30.4375).toFixed(0)}</text>)}
      <text x="300" y="258" textAnchor="middle" fontSize="12">Age in months</text>
      <text x="58" y="15" fontSize="12">{metric === 'weight' ? 'Weight (kg)' : 'Position-adjusted length/height (cm)'}</text>
    </svg>
    <p className="text-xs text-slate-600">Dots: recorded measurements. Gray lines: WHO median and -2/+2 reference boundaries. Indicators apply only below 60 months. One point does not show a growth trend.</p>
  </>;
}

export default function GrowthPanel({ child }: { child: Child }) {
  const { demoGrowth, setDemoGrowth, demoUser } = useStore();
  const [remote, setRemote] = useState<GrowthMeasurement[]>([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [date, setDate] = useState(smsTodayISO);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [position, setPosition] = useState<'' | 'lying' | 'standing'>('');
  const [oedema, setOedema] = useState<NewGrowthMeasurement['oedema']>('unknown');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    api.growthMeasurements(child.id).then((data) => { if (!cancelled) setRemote(data); })
      .catch((e) => { if (!cancelled) setError(apiError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [child.id]);
  const rows = (apiEnabled ? remote : demoGrowth.filter((r) => r.childId === child.id)).slice().sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const latest = rows.at(-1);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving || loading) return;
    setError('');
    if (date < child.birthDate || date > smsTodayISO()) return setError('Measurement date must be between birth and today.');
    if (height && !position) return setError('Select how length / height was measured.');
    if (!weight && !height) return setError('Enter a weight or length/height measurement.');
    if (rows.some((r) => r.measuredOn === date)) return setError('A measurement already exists for this date. Ask the midwife to review corrections.');
    const data: NewGrowthMeasurement = { childId: child.id, measuredOn: date,
      weightKg: weight ? Number(weight) : undefined, heightCm: height ? Number(height) : undefined,
      position: height && position ? position : undefined, oedema, notes: notes.trim() };
    setSaving(true);
    try {
      if (apiEnabled) {
        const row = await api.createGrowthMeasurement(data);
        setRemote((prev) => [...prev, row]);
      } else setDemoGrowth((prev) => [...prev, { ...data, id: crypto.randomUUID() }]);
      setWeight(''); setHeight(''); setPosition(''); setNotes(''); setOedema('unknown');
    } catch (e) { setError(apiError(e)); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    setSaving(true); setError('');
    try {
      if (apiEnabled) { await api.deleteGrowthMeasurement(id); setRemote((prev) => prev.filter((r) => r.id !== id)); }
      else setDemoGrowth((prev) => prev.filter((r) => r.id !== id));
      setRemoveId(null);
    } catch (e) { setError(apiError(e)); }
    finally { setSaving(false); }
  }
  return <div className="flex flex-col gap-4">
    <p className="rounded-xl bg-slate-50 p-3 text-sm">Record actual measurements only. WHO comparisons support staff review and do not determine whether a child is healthy or unhealthy. Previous weight entries without dates are not plotted. {apiEnabled ? 'Measurements are saved through the protected API.' : 'Demo: fictional measurements only, kept for this session.'}</p>
    {loading && <p role="status">Loading measurements...</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <Card title="Add measurement">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Measurement date<input className="block w-full rounded border p-2" type="date" required min={child.birthDate} max={smsTodayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Weight (kg)<input className="block w-full rounded border p-2" type="number" min="0.01" max="200" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        <label className="text-sm">Length / height (cm)<input className="block w-full rounded border p-2" type="number" min="0.01" max="250" step="0.01" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
        <label className="text-sm">How was length / height measured?<select aria-label="Measurement position" className="block w-full rounded border p-2" disabled={!height} required={Boolean(height)} value={position} onChange={(e) => setPosition(e.target.value as typeof position)}><option value="">Select measurement position</option><option value="lying">Lying down (length)</option><option value="standing">Standing (height)</option></select></label>
        <label className="text-sm">Swelling of both feet (staff assessment)<select aria-label="Swelling of both feet (staff assessment)" className="block w-full rounded border p-2" value={oedema} onChange={(e) => setOedema(e.target.value as typeof oedema)}><option value="unknown">Not assessed</option><option value="no">Absent</option><option value="yes">Present</option></select></label>
        <label className="text-sm">Notes<textarea className="block w-full rounded border p-2" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <p className="text-xs sm:col-span-2">Weight comparisons are unavailable when swelling is present or has not been assessed. WHO length/height calculations adjust for measurement position by 0.7 cm when required.</p>
        <button disabled={saving || loading} className="rounded-xl bg-[var(--color-accent)] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save measurement'}</button>
      </form>
    </Card>
    {latest && <Card title={`Latest indicators - ${formatDate(latest.measuredOn)}`}><div className="grid gap-3 sm:grid-cols-3">{metrics.map((m) => {
      const result = growthIndicator(latest, child.birthDate, child.sex, m.id);
      return <div key={m.id}><h3 className="font-semibold">{m.label}</h3><p className="text-sm">{result.label}</p>{result.score !== undefined && <p className="text-xs">WHO z-score: {result.score.toFixed(2)} (distance from reference median)</p>}</div>;
    })}</div></Card>}
    <div className="grid gap-4 lg:grid-cols-2"><Card title="Weight over time"><Chart rows={rows} child={child} metric="weight" /></Card><Card title="Length / height over time"><Chart rows={rows} child={child} metric="height" /></Card></div>
    <Card title="Measurement history">
      {!rows.length ? <p>No dated measurements recorded. Add a measurement to start the chart.</p> : <div className="overflow-x-auto"><table className="ui-table w-full text-left text-sm"><caption className="sr-only">Actual recorded measurements before position adjustment</caption><thead><tr>{['Date', 'Weight (kg)', 'Length / height (cm)', 'Position', 'Swelling', 'Notes', 'Actions'].map((h) => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="p-2">{formatDate(r.measuredOn)}</td><td className="p-2">{r.weightKg ?? '-'}</td><td className="p-2">{r.heightCm ?? '-'}</td><td className="p-2">{r.position ?? '-'}</td><td className="p-2">{r.oedema === 'unknown' ? 'Not assessed' : r.oedema === 'yes' ? 'Present' : 'Absent'}</td><td className="p-2">{r.notes}</td><td className="p-2">{demoUser?.role === 'midwife' && <button type="button" disabled={saving} onClick={() => setRemoveId(r.id)} className="text-red-700 underline">Remove</button>}</td></tr>)}</tbody></table></div>}
      {removeId && <div role="alert" className="mt-3 rounded border p-3"><p>Remove this measurement? Record the corrected measurement afterward if needed.</p><button disabled={saving} onClick={() => void remove(removeId)} className="mr-4 text-red-700 underline">Confirm removal</button><button disabled={saving} onClick={() => setRemoveId(null)} className="underline">Cancel</button></div>}
    </Card>
    <p className="text-xs text-slate-600">Source: <a className="underline" href="https://www.who.int/tools/child-growth-standards" target="_blank" rel="noreferrer">WHO Child Growth Standards</a>. Reference dataset: WHO anthro, retrieved November 11, 2026. Staff must verify unusual measurements.</p>
  </div>;
}

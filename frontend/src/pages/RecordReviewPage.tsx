import { useState } from 'react';
import Card from '../components/Card';
import { apiEnabled } from '../data/api';
import { useStore } from '../state/store-context';
import { childName, type DoseRecord } from '../data/mockData';
import { todayISO } from '../utils/dates';
import { REVIEW_SERIES, reviewInputs, reviewScore, reviewThreshold } from '../utils/recordReview';

export default function RecordReviewPage() {
  const { children, records } = useStore();
  const [childId, setChildId] = useState('');
  const [practice, setPractice] = useState<'spaced' | 'same-day' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const practiceDates = practice === 'same-day' ? ['2026-01-01', '2026-01-01', '2026-01-01'] : ['2026-01-01', '2026-01-29', '2026-02-26'];
  const sample = REVIEW_SERIES.flatMap(vaccineId => practiceDates.map((dateAdministered, i) => ({ vaccineId, doseNumber: i + 1, dateAdministered } as DoseRecord)));
  const selected = practice ? sample : records.filter(r => r.childId === childId);
  const input = reviewInputs(selected, todayISO());
  const ready = (practice || !!childId) && input.problems.length === 0;
  function clear() { setResult(null); }
  return <div className="space-y-6">
    <h1 className="page-title">Record Review</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-4">Experimental record review. This checks unusual patterns in recorded vaccine dates. It does not assess health or confirm a mistake or missed vaccination. An advantage over simple checks has not been demonstrated.</p>
    <Card title="Choose information to review">
      <label htmlFor="review-child" className="block font-medium">Child record</label>
      <select id="review-child" className="my-2 w-full rounded-lg border p-3" value={childId} onChange={e => { setChildId(e.target.value); setPractice(null); clear(); }}>
        <option value="">Choose a child</option>
        {children.map(c => <option key={c.id} value={c.id}>{childName(c)}</option>)}
      </select>
      {!apiEnabled && <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setPractice('spaced'); setChildId(''); clear(); }}>Try fictional practice dates</button>
        <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setPractice('same-day'); setChildId(''); clear(); }}>Try same-day fictional dates</button>
      </div>}
      {practice && <p className="mt-3 font-semibold">Practice example: fictional dates, not a saved child record.</p>}
    </Card>
    {(childId || practice) && <Card title="Dates used by the model">
      <div className="overflow-x-auto"><table role="table" className="mobile-record-table ui-table w-full text-left"><thead role="rowgroup"><tr role="row"><th className="p-2">Vaccine</th><th>Dose 1</th><th>Dose 2</th><th>Dose 3</th></tr></thead><tbody role="rowgroup">
        {REVIEW_SERIES.map((v, i) => <tr role="row" key={v}><th role="rowheader" scope="row" className="p-2">{v === 'penta' ? 'Pentavalent' : v.toUpperCase()}</th>{input.dates.slice(i*3, i*3+3).map((d, j) => <td role="cell" className="p-2" key={j}><span className="mobile-cell-label" aria-hidden="true">Dose {j + 1}</span><div className="mobile-cell-value">{d || 'Not recorded'}</div></td>)}</tr>)}
      </tbody></table></div>
      <p className="my-3">The model compares the gaps in days between the first, second, and third doses of these three vaccines.</p>
      {!ready && <div role="status"><p className="font-semibold">Not enough information for ML review.</p><p>All nine dates must be present, valid, and in order. Check the entries first.</p></div>}
      <button disabled={!ready} type="button" className="mt-3 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-white disabled:opacity-50" onClick={() => setResult(reviewScore(input.gaps) > reviewThreshold ? 'Review suggested' : 'No unusual pattern flagged')}>Run experimental review</button>
      {result && <div role="status" className="mt-4 rounded-lg border p-4"><p className="font-bold">{result}</p><p>{result === 'Review suggested' ? 'These recorded intervals differ from patterns learned in the study. Compare the entries with the original record before deciding what to do.' : 'The model did not flag this pattern. This does not prove that the record is correct or that the child is healthy.'}</p></div>}
    </Card>}
    <Card title="About this experimental review">
      <p>The model learned from 41 complete workbook rows. It looks at six gaps between vaccination dates and suggests records to review. A missing date is handled as missing information, not guessed. Staff decide whether an entry needs clarification.</p>
      <p className="mt-3">Method: Isolation Forest. Findings are experimental; source-photo matching remains incomplete. No accuracy percentage or medical conclusion is claimed. Running this review does not edit records or send messages.</p>
    </Card>
  </div>;
}

/**
 * Record Review worklist page (`/review`).
 *
 * Hawak nito: listahan ng mga flagged vaccination records mula sa backend screening API (DOH interval/duplicate rules + guardrailed Groq AI guidance),
 * kasama ang daily review summary, search/issue/priority/sort filters na naka-sync sa URL, guidance panel, at RBAC review tracking.
 * Dito kayo mag-check pag may bug sa pag-load ng review findings, auto-refresh on focus, filters, o review status updates.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import Dialog from '../components/Dialog';
import DailyReviewSummaryCard from '../components/DailyReviewSummaryCard';
import EmptyState from '../components/EmptyState';
import ReviewGuidancePanel from '../components/ReviewGuidancePanel';
import ReviewTrackingPanel from '../components/ReviewTrackingPanel';
import { api, apiEnabled, type DailyReviewSummary } from '../data/api';
import { useStore } from '../state/store-context';
import { directoryPage } from '../utils/childDirectory';
import { filterReviewRows, ISSUE_LABELS, reviewRows, type ReviewFinding } from '../utils/reviewWorklist';

type LoadState = { status: 'loading' | 'error' } | { status: 'ready'; findings: ReviewFinding[]; trackingAvailable: boolean; summary?: DailyReviewSummary };

const CONTROL = 'clinic-control w-full';
const findingId = (row: ReviewFinding) => row.findingKey ?? JSON.stringify([row.childId, row.issueType, row.recordIds]);
const REVIEW_STATUSES = ['pending', 'verified', 'escalated', 'resolved'] as const;
const BUTTON = 'clinic-control font-medium';

// Nagre-render ng Record Review queue kung saan tsine-check ng staff yung mga na-flag na dose records (decision support lang, hindi diagnosis).
export default function ReviewWorklistPage() {
  const { children, connected, demoUser } = useStore();
  // Kailangan connected sa staff backend API para makapag-load ng saved review findings.
  const canReview = apiEnabled && connected;
  const [params, setParams] = useSearchParams();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // Mga active filter/sort values na naka-store sa URL query params.
  const query = params.get('q') ?? '';
  const issue = params.get('issue') ?? 'all';
  const priority = params.get('priority') ?? 'all';
  const sort = params.get('sort') ?? 'priority';
  const trackingAvailable = load.status === 'ready' && load.trackingAvailable;
  const reviewStatus = trackingAvailable
    ? REVIEW_STATUSES.find(status => status === params.get('reviewStatus')) ?? 'all'
    : 'all';

  // Auto-refresh ng findings kapag bumalik yung focus ng user sa browser tab (halimbawa pagkatapos mag-edit sa ChildProfilePage).
  useEffect(() => {
    if (!canReview) return;
    const refresh = () => setAttempt((previous) => previous + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [canReview]);

  // Nagfe-fetch ng review findings mula sa backend API; may AbortController para hindi mag-setState kapag nag-unmount o nag-refetch.
  useEffect(() => {
    if (!canReview) return;
    const controller = new AbortController();
    api.reviewFindings(controller.signal).then(({ findings, trackingAvailable, summary }) => {
      if (!controller.signal.aborted) setLoad({ status: 'ready', findings, trackingAvailable, summary });
    }).catch(() => {
      if (!controller.signal.aborted) setLoad({ status: 'error' });
    });
    return () => controller.abort();
  }, [canReview, attempt]);

  // Pinapares yung API findings sa loaded children list, tapos fine-filter, sino-sort, at pina-paginate via useMemo.
  const rows = useMemo(() => load.status === 'ready' ? reviewRows(load.findings, children) : [], [load, children]);
  const filtered = useMemo(() => filterReviewRows(rows, { query, issue, priority, sort, reviewStatus }), [rows, query, issue, priority, sort, reviewStatus]);
  const page = directoryPage(filtered, Number(params.get('page') ?? 1), 8);
  const selected = rows.find(row => findingId(row) === selectedId);

  // Ina-update yung URL param ng napiling filter/sort at nire-reset ang pagination sa page 1.
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.set(key, value);
    setParams(next, { replace: true });
  }

  return <div className="flex flex-col gap-3.5">
    <h1 className="sr-only">Record Review</h1>
    {/* Guard states: offline/disconnected, loading, error with retry, o ready view */}
    {!canReview ? <EmptyState title="Staff connection required" message="Connect to the staff system to review saved vaccination records." />
      : load.status === 'loading' ? <p role="status">Loading review findings…</p>
      : load.status === 'error' ? <Card>
        <p role="alert" className="mb-3">Review findings could not be loaded.</p>
        <button type="button" className={BUTTON} onClick={() => {
          setLoad({ status: 'loading' });
          setAttempt((previous) => previous + 1);
        }}>Try again</button>
      </Card>
      : <>
        {/* Daily review summary card at status note kapag hindi available yung tracking table */}
        {load.status === 'ready' && load.summary && <div id="daily-review-summary" tabIndex={-1}>
          <DailyReviewSummaryCard summary={load.summary} selectedStatus={reviewStatus}
            onStatusSelect={trackingAvailable ? (status) => update('reviewStatus', reviewStatus === status ? 'all' : status) : undefined} />
        </div>}
        {load.status === 'ready' && !load.trackingAvailable && <p role="status" className="text-sm text-[var(--color-navy-soft)]">Review tracking is unavailable. Screening and guidance are still available.</p>}
        {/* Filter bar: search, issue category, priority, at sort order */}
        <Card>
          <div className={`grid gap-3 sm:grid-cols-2 ${trackingAvailable ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
            <label className="space-y-1 text-sm">Search child or vaccine
              <input className={CONTROL} type="search" value={query} onChange={(event) => update('q', event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">Issue category
              <select className={CONTROL} value={issue} onChange={(event) => update('issue', event.target.value)}>
                <option value="all">All issues</option>
                {Object.entries(ISSUE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Review priority
              <select className={CONTROL} value={priority} onChange={(event) => update('priority', event.target.value)}>
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            {trackingAvailable && <label className="space-y-1 text-sm">Review status
              <select className={CONTROL} value={reviewStatus} onChange={(event) => update('reviewStatus', event.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>}
            <label className="space-y-1 text-sm">Sort by
              <select className={CONTROL} value={sort} onChange={(event) => update('sort', event.target.value)}>
                <option value="priority">Highest priority first</option>
                <option value="name">Child name</option>
              </select>
            </label>
          </div>
        </Card>
        {/* Listahan ng mga findings cards (may link sa dose history, guidance panel, at RBAC tracking controls) */}
        {!filtered.length ? <EmptyState
          title={rows.length ? 'No matching findings' : 'No findings to review'}
          message={rows.length ? 'Change the search or filters to see more findings.' : 'The screening rules found no issues in the available dose records.'}
        /> : <>
          <p role="status" className="text-sm text-[var(--color-navy-soft)]">Showing {page.first}–{page.last} of {filtered.length} findings</p>
          <ul aria-label="Review findings" className="grid gap-2 md:grid-cols-2">
            {page.visible.map(row => <li key={findingId(row)} className="min-w-0">
              <button type="button" aria-haspopup="dialog" onClick={() => setSelectedId(findingId(row))}
                className="clinic-entry block h-full w-full px-3 py-2.5 text-left">
                <strong className="block break-words">{row.name}</strong>
                <span className="block text-sm">{ISSUE_LABELS[row.issueType] ?? 'Documentation issue'} ? {row.vaccine}{row.doses.length > 0 && ' ? Dose ' + row.doses.join(', ')}</span>
                <span className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 font-medium">{row.priority === 'high' ? 'High review priority' : 'Standard review priority'}</span>
                  {row.reviewStatus && <span className={row.reviewStatus === 'escalated' ? 'rounded-full bg-amber-100 px-2 py-0.5 font-semibold capitalize text-amber-900' : 'px-2 py-0.5 capitalize'}>{row.reviewStatus}</span>}
                </span>
              </button>
            </li>)}
            {page.visible.length === 5 && load.status === 'ready' && load.summary && (
              <li className="min-w-0">
                <a href="#daily-review-summary" className="clinic-entry flex h-full min-h-20 flex-col justify-center px-3 py-2.5">
                  <span className="font-semibold">Daily review summary</span>
                  <span className="text-sm text-[var(--color-navy-soft)]">See finding totals and review guidance</span>
                </a>
              </li>
            )}
          </ul>
          {/* Pagination buttons kapag higit sa isang page yung findings */}
          {page.pages > 1 && <nav aria-label="Review findings pages" className="flex flex-wrap items-center gap-3">
            <button type="button" className={BUTTON} disabled={page.page === 1} onClick={() => update('page', String(page.page - 1))}>Previous</button>
            <span className="text-sm">Page {page.page} of {page.pages}</span>
            <button type="button" className={BUTTON} disabled={page.page === page.pages} onClick={() => update('page', String(page.page + 1))}>Next</button>
          </nav>}
        </>}
      </>}
    {canReview && selected && <Dialog title={'Review finding ? ' + selected.name} onClose={() => setSelectedId(undefined)}>
      <div className="space-y-2">
        <p className="font-medium">{ISSUE_LABELS[selected.issueType] ?? 'Documentation issue'} ? {selected.vaccine}{selected.doses.length > 0 && ' ? Dose ' + selected.doses.join(', ')}</p>
        <p className="mt-3 text-sm">{selected.message}</p>
        <p className="mt-1 text-sm text-[var(--color-navy-soft)]">{selected.priorityReason}</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-[var(--color-accent)] underline" to={`/children/${encodeURIComponent(selected.childId)}?tab=history`}>
          Open dose history <span className="sr-only">for {selected.name}</span>
        </Link>
        {!selected.screeningCleared && <ReviewGuidancePanel issueCode={selected.issueType} />}
        {selected.reviewStatus && <ReviewTrackingPanel finding={selected} role={demoUser?.role}
          onSaved={() => setAttempt((previous) => previous + 1)}
          onReload={() => {
            setAttempt((previous) => previous + 1);
          }} />}
      </div>
    </Dialog>}
  </div>;
}

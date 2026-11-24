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
import PageSkeleton from '../components/PageSkeleton';
import ReviewGuidancePanel from '../components/ReviewGuidancePanel';
import ReviewTrackingPanel from '../components/ReviewTrackingPanel';
import { api, apiEnabled, type DailyReviewSummary } from '../data/api';
import { useStore } from '../state/store-context';
import { directoryPage } from '../utils/childDirectory';
import { filterReviewRows, ISSUE_LABELS, reviewRows, type ReviewFinding } from '../utils/reviewWorklist';

type LoadState = { status: 'loading' | 'error' } | { status: 'ready'; findings: ReviewFinding[]; trackingAvailable: boolean; summary?: DailyReviewSummary };

const CONTROL = 'clinic-control';
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

  const activeFilters = Boolean(query || issue !== 'all' || priority !== 'all' || reviewStatus !== 'all' || sort !== 'priority');

  // Ina-update yung URL param ng napiling filter/sort at nire-reset ang pagination sa page 1.
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.set(key, value);
    setParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of ['q', 'issue', 'priority', 'reviewStatus', 'sort', 'page']) next.delete(key);
    setParams(next, { replace: true });
  }

  return <div className="flex flex-col gap-3 lg:min-h-[calc(100dvh-5.75rem)]">
    <h1 className="sr-only">Record Review</h1>
    {/* Guard states: offline/disconnected, loading, error with retry, o ready view */}
    {!canReview ? <EmptyState title="Staff connection required" message="Connect to the staff system to review saved vaccination records." />
      : load.status === 'loading' ? <PageSkeleton label="Loading review findings…" />
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
          <DailyReviewSummaryCard summary={load.summary} findings={load.findings} selectedStatus={reviewStatus}
            onStatusSelect={trackingAvailable ? (status) => update('reviewStatus', reviewStatus === status ? 'all' : status) : undefined} />
        </div>}
        {load.status === 'ready' && !load.trackingAvailable && <p role="status" className="text-sm text-[var(--color-navy-soft)]">Review tracking is unavailable. Screening and guidance are still available.</p>}
        {/* Single-row filter bar: search, issue category, priority, at sort order (status is controlled by KPI cards above) */}
        <Card className="!p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <input
              aria-label="Search child or vaccine"
              placeholder="Search child or vaccine"
              className="clinic-control w-full lg:min-w-0 lg:flex-1"
              type="search"
              value={query}
              onChange={(event) => update('q', event.target.value)}
            />
            <div className="directory-filters flex shrink-0 flex-wrap items-center gap-2">
              <select aria-label="Issue category" className={CONTROL} value={issue} onChange={(event) => update('issue', event.target.value)}>
                <option value="all">All issues</option>
                {Object.entries(ISSUE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <select aria-label="Review priority" className={CONTROL} value={priority} onChange={(event) => update('priority', event.target.value)}>
                <option value="all">All priorities</option>
                <option value="high">High priority</option>
                <option value="standard">Standard priority</option>
              </select>
              <select aria-label="Sort by" className={CONTROL} value={sort} onChange={(event) => update('sort', event.target.value)}>
                <option value="priority">Highest priority first</option>
                <option value="name">Child name</option>
              </select>
              {activeFilters && (
                <button type="button" onClick={clearFilters} className={CONTROL}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </Card>
        {/* Full-height findings card stretched to viewport bottom edge */}
        <section aria-labelledby="review-findings-title" className="health-card flex min-w-0 flex-1 flex-col overflow-hidden !p-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
            <h2 id="review-findings-title" className="text-base font-semibold">
              Review findings ({filtered.length})
            </h2>
            <p role="status" aria-live="polite" className="text-xs text-[var(--color-navy-soft)]">
              {filtered.length ? `Showing ${page.first}–${page.last} of ${filtered.length} findings` : '0 findings'}
            </p>
          </div>
          {!filtered.length ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState
                title={rows.length ? 'No matching findings' : 'No findings to review'}
                message={rows.length ? 'Change the search or filters to see more findings.' : 'The screening rules found no issues in the available dose records.'}
              />
            </div>
          ) : (
            <ul aria-label="Review findings" className="grid flex-1 auto-rows-max content-start gap-2.5 p-3.5 md:grid-cols-2">
              {page.visible.map(row => <li key={findingId(row)} className="min-w-0">
                <button type="button" aria-haspopup="dialog" onClick={() => setSelectedId(findingId(row))}
                  className="clinic-entry block h-full w-full px-3.5 py-2.5 text-left">
                  <strong className="block break-words">{row.name}</strong>
                  <span className="block text-sm">{ISSUE_LABELS[row.issueType] ?? 'Documentation issue'} · {row.vaccine}{row.doses.length > 0 && ' · Dose ' + row.doses.join(', ')}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 font-medium">{row.priority === 'high' ? 'High review priority' : 'Standard review priority'}</span>
                    {row.reviewStatus && <span className={row.reviewStatus === 'escalated' ? 'rounded-full bg-amber-100 px-2 py-0.5 font-semibold capitalize text-amber-900' : 'px-2 py-0.5 capitalize text-[var(--color-navy-soft)]'}>{row.reviewStatus}</span>}
                  </span>
                </button>
              </li>)}
            </ul>
          )}
          <nav aria-label="Review findings pages" className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2.5 text-xs text-[var(--color-navy-soft)]">
            <span>Decision support only — verify flagged entries against source clinic records.</span>
            {page.pages > 1 && <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={BUTTON} disabled={page.page === 1} onClick={() => update('page', String(page.page - 1))}>Previous</button>
              <span>Page {page.page} of {page.pages}</span>
              <button type="button" className={BUTTON} disabled={page.page === page.pages} onClick={() => update('page', String(page.page + 1))}>Next</button>
            </div>}
          </nav>
        </section>
      </>}
    {canReview && selected && <Dialog title={'Review finding · ' + selected.name} onClose={() => setSelectedId(undefined)}>
      <div className="space-y-2">
        <p className="font-medium">{ISSUE_LABELS[selected.issueType] ?? 'Documentation issue'} · {selected.vaccine}{selected.doses.length > 0 && ' · Dose ' + selected.doses.join(', ')}</p>
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

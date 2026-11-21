/**
 * ReviewTrackingPanel.tsx
 * Guide: Panel para sa pag-record ng review decision (Mark verified, Escalate to midwife,
 * Resolve escalation) at pag-view ng paginated review audit history ng isang finding.
 * Ginagamit sa Record Review worklist page.
 */
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../data/api';
import { reviewActions, type ReviewAction, type ReviewEvent, type ReviewFinding, type ReviewStatus } from '../utils/reviewWorklist';

// Display labels at descriptions ng bawat finding review status.
const STATUS: Record<ReviewStatus, { label: string; description: string }> = {
  pending: { label: 'Pending', description: 'This version is awaiting staff review.' },
  verified: { label: 'Verified', description: 'Staff checked the source documentation.' },
  escalated: { label: 'Escalated', description: 'The finding needs a midwife’s decision.' },
  resolved: { label: 'Resolved', description: 'A midwife finalized the escalated review.' },
};
// Dropdown labels para sa allowed transition actions depende sa role (BHW vs Midwife).
const ACTION: Record<ReviewAction, string> = {
  verified: 'Mark verified', escalated: 'Escalate to midwife', resolved: 'Resolve escalation',
};
const BUTTON = 'rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:opacity-50';
const FORMAT = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

type PanelProps = {
  finding: ReviewFinding;
  role?: 'bhw' | 'midwife';
  onReload: () => void;
  onSaved: () => void;
};

/** Wrapper na nagre-reset ng inner ReviewDecision state kapag nagbago ang finding version o status. */
export default function ReviewTrackingPanel(props: PanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { finding } = props;
  return <ReviewDecision key={JSON.stringify([finding.findingKey, finding.version, finding.eventId, finding.reviewStatus])}
    {...props} historyOpen={historyOpen} openHistory={() => setHistoryOpen(true)} />;
}

/** Inner stateful panel na nagha-handle ng review status transitions, 409 conflict detection, at history loading. */
function ReviewDecision({ finding, role, onReload, onSaved, historyOpen, openHistory }: PanelProps & {
  historyOpen: boolean;
  openHistory: () => void;
}) {
  const [status, setStatus] = useState(finding.reviewStatus ?? 'pending');
  const [eventId, setEventId] = useState(finding.eventId ?? null);
  const [remarks, setRemarks] = useState('');
  const [action, setAction] = useState<ReviewAction>();
  const [events, setEvents] = useState<ReviewEvent[]>();
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  // Kina-cancel ang active API request kapag umalis sa component.
  useEffect(() => () => request.current?.abort(), []);
  const actions = reviewActions(status, role);
  const { childId, findingKey } = finding;
  // Naglo-load ng first page ng review audit history kapag binuksan ito o kapag may bagong saved eventId.
  useEffect(() => {
    if (!historyOpen || !findingKey) return;
    const controller = new AbortController();
    api.reviewHistory(childId, findingKey, 1, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setEvents(result.events);
      setHasMore(result.hasMore);
      setHistoryPage(1);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load review history. Try again.');
    });
    return () => controller.abort();
  }, [childId, findingKey, historyOpen, eventId]);

  // Shared async runner na nagme-manage ng AbortController, busy state, at HTTP 409 stale-record conflicts.
  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await operation(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        const conflict = err instanceof ApiError && err.status === 409;
        setStale(conflict);
        setError(conflict ? 'The finding or review changed. Reload before making a decision.' : 'Could not complete the review request. Try again.');
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  // Sine-save sa backend ang piniling review transition at internal remarks, tapos ina-update ang local status.
  function save() {
    if (!action || !finding.findingKey || !finding.version) return;
    const { childId, findingKey, version } = finding;
    void run(async (signal) => {
      const saved = await api.transitionReview({ childId, findingKey, version, eventId, status: action, remarks }, signal);
      if (signal.aborted) return;
      setStatus(saved.status);
      setEventId(saved.eventId);
      setRemarks('');
      setAction(undefined);
      setEvents(undefined);
      setHistoryPage(0);
      onSaved();
    });
  }

  // Binubuksan ang review history o naglo-load ng susunod na page ng older review decisions.
  function loadHistory() {
    if (!finding.findingKey) return;
    if (!historyOpen) { openHistory(); return; }
    const { childId, findingKey } = finding;
    void run(async (signal) => {
      const result = await api.reviewHistory(childId, findingKey, historyPage + 1, signal);
      if (signal.aborted) return;
      setEvents((previous) => [...(previous ?? []), ...result.events]);
      setHasMore(result.hasMore);
      setHistoryPage((previous) => previous + 1);
    });
  }

  return <section className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-3 text-sm">
    {/* Current review status summary at reassessed warning kapag nagbago ang dose records */}
    <p role="status"><strong>{STATUS[status].label}</strong> · {STATUS[status].description}</p>
    {finding.reassessed && status === 'pending' && <p>The dose records changed. Review this version again. Earlier decisions are in history.</p>}
    {/* Role-based review decision form (available actions + optional internal remarks) */}
    {actions.length > 0 && !stale && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <label className="block">Review action
        <select className="mt-1 block max-w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          value={action ?? ''} onChange={(event) => setAction((actions.find((option) => option === event.target.value)))}>
          <option value="">Choose an action</option>
          {actions.map((option) => <option key={option} value={option}>{ACTION[option]}</option>)}
        </select>
      </label>
      <label className="block">Internal remarks (optional)
        <textarea value={remarks} maxLength={500} rows={2} onChange={(event) => setRemarks(event.target.value)}
          className="mt-1 block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2" />
      </label>
      <button disabled={busy || !action} className={BUTTON}>Save review</button>
    </form>}
    {/* Loading, error, stale-conflict reload button, at paginated audit history list */}
    {busy && <p role="status">Loading review information…</p>}
    {error && <p role="alert">{error}</p>}
    {stale && <button type="button" onClick={onReload} className={BUTTON}>Reload worklist</button>}
    {(!historyOpen || hasMore || (!events && error)) && <button type="button" disabled={busy} className={BUTTON} onClick={loadHistory}>
      {events ? 'Load older decisions' : 'Show review history'}
    </button>}
    {events && (events.length ? <ol aria-label="Review history" className="space-y-2">
      {events.map((event) => <li key={event.id} className="wrap-break-word rounded-xl bg-[var(--color-accent-soft)] p-3">
        <p>{STATUS[event.from_status].label} → {STATUS[event.status].label}</p>
        <p>{event.reviewer_name} ({event.reviewer_role === 'bhw' ? 'BHW' : 'Midwife'}) · {FORMAT.format(new Date(event.created_at))}</p>
        {event.remarks && <p className="mt-1 whitespace-pre-wrap">{event.remarks}</p>}
      </li>)}
    </ol> : <p>No review decisions yet.</p>)}
  </section>;
}

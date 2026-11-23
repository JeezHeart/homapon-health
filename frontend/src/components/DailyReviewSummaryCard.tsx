/**
 * DailyReviewSummaryCard.tsx
 * Guide: Summary card sa Record Review page na nagpapakita ng daily totals (active findings,
 * affected children, at pending/verified/escalated/resolved counts) plus AI-assisted o fallback
 * reference documentation checklist.
 */
import type { DailyReviewSummary } from '../data/api';
import { ISSUE_LABELS, type ReviewFinding } from '../utils/reviewWorklist';
import Card from './Card';
import KpiCard, { KPI_GRID, KpiSparkline } from './KpiCard';

// Mapping mula sa backend review status keys papunta sa readable card labels at semantic sparkline colors.
const STATUS_TOTALS = [
  ['pending', 'Pending findings', 'var(--color-secondary)'],
  ['verified', 'Verified findings', 'var(--color-chart-teal)'],
  ['escalated', 'Escalated findings', 'var(--color-danger)'],
  ['resolved', 'Resolved findings', 'var(--color-success)'],
] as const;
type Status = typeof STATUS_TOTALS[number][0];

const ISSUE_ENTRIES = Object.entries(ISSUE_LABELS);

/** Nagre-render ng daily worklist snapshot metrics at documentation checklist sa loob ng Card. */
export default function DailyReviewSummaryCard({ summary, findings, selectedStatus, onStatusSelect }: {
  summary: DailyReviewSummary;
  findings?: ReviewFinding[];
  selectedStatus?: Status | 'all';
  onStatusSelect?: (status: Status) => void;
}) {
  // Fino-format yung Manila date para malinis tignan sa Philippine date format.
  const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })
    .format(new Date(`${summary.date}T00:00:00+08:00`));
  const { guidance, statuses } = summary;
  // Pinagsasama yung overall finding counts at per-status counts kapag available sa API response.
  const totals: [string, number][] = [
    ['Active findings', summary.findings], ['Affected children', summary.uniqueChildren],
  ];

  return <Card
    title="Daily review summary"
    action={
      <dl className="flex flex-wrap items-center gap-2 text-xs">
        {totals.map(([label, count]) => (
          <div key={label} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1">
            <dt className="text-[var(--color-navy-soft)]">{label}</dt><dd className="font-semibold tabular-nums text-[var(--color-navy)]">{count}</dd>
          </div>
        ))}
      </dl>
    }
  >
    {/* Petsa ng worklist snapshot */}
    <p className="text-sm text-[var(--color-navy-soft)]">
      <time dateTime={summary.date}>{date}</time> · Current worklist snapshot, including findings from earlier days
    </p>
    {statuses && <div className={`mt-3 ${KPI_GRID}`}>
      {STATUS_TOTALS.map(([key, label, color]) => {
        const visual = findings ? (
          <KpiSparkline
            counts={ISSUE_ENTRIES.map(([code]) =>
              findings.filter(f => (f.reviewStatus ?? 'pending') === key && f.issueType === code).length,
            )}
            labels={ISSUE_ENTRIES.map(([, issueLabel]) => issueLabel)}
            color={color}
          />
        ) : undefined;
        return <KpiCard key={key} label={label} count={statuses[key]}
          icon="review" description="Active findings" alert={key === 'escalated' && statuses[key] > 0}
          visual={visual}
          selected={onStatusSelect ? selectedStatus === key : undefined}
          onSelect={onStatusSelect && (() => onStatusSelect(key))} />;
      })}
    </div>}
    {!statuses && <p className="mt-2 text-sm text-[var(--color-navy-soft)]">Saved review statuses are unavailable.</p>}
    {/* AI-assisted o reference documentation checklist at official source links */}
    <details className="mt-3 space-y-2 rounded-xl bg-[var(--color-accent-soft)] p-3 text-sm">
      <summary className="cursor-pointer font-medium">Show daily guidance</summary>
      <h3 className="font-semibold">{guidance.source === 'ai_assisted' ? 'AI-assisted documentation checklist' : 'Reference guidance'}</h3>
      <p>{guidance.explanation}</p>
      {guidance.checklist.length > 0 && <ol className="list-decimal space-y-1 pl-5">
        {guidance.checklist.map((step) => <li key={step}>{step}</li>)}
      </ol>}
      {guidance.references.map(({ title, url }) => <a key={url} className="block wrap-break-word font-medium underline"
        href={url} target="_blank" rel="noreferrer">{title}</a>)}
    </details>
  </Card>;
}

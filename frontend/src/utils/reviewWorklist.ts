/**
 * Data-quality review worklist types, role workflow rules, at table filtering helpers.
 *
 * Dito naka-define yung frontend structure ng mga flagged immunization records,
 * friendly issue labels, role-based review actions (BHW vs Midwife), at yung
 * pag-enrich/filter/sort ng mga rows sa Review Worklist page.
 *
 * Tinatawag ito ng: `ReviewWorklistPage.tsx`, `ReviewTrackingPanel.tsx`, `data/api.ts`.
 */
import { childName, type Child } from '../data/mockData';
import { vaccineById } from '../data/vaccines';

/** Isang data-quality finding sa dose record ni baby na galing sa backend screening service. */
export interface ReviewFinding {
  childId: string;
  vaccineId: string;
  issueType: string;
  explanationCode: string;
  recordIds: string[];
  doses: number[];
  message: string;
  priority: 'high' | 'standard';
  priorityReason: string;
  findingKey?: string;
  version?: string;
  eventId?: string | null;
  reviewStatus?: ReviewStatus;
  reassessed?: boolean;
  screeningCleared?: boolean;
}

/** Mga workflow status na pinagdadaanan ng isang flagged record finding. */
export type ReviewStatus = 'pending' | 'verified' | 'escalated' | 'resolved';

/** Mga staff actions na pwedeng gawin para ilipat yung status ng finding. */
export type ReviewAction = Exclude<ReviewStatus, 'pending'>;

/** Audit log entry ng bawat desisyon ng health worker/midwife sa isang finding. */
export type ReviewEvent = {
  id: string;
  reviewer_name: string;
  reviewer_role: 'bhw' | 'midwife';
  from_status: ReviewStatus;
  status: ReviewAction;
  remarks: string;
  created_at: string;
};

/**
 * Dito dine-determine kung anong next review buttons ang pwedeng pindutin base sa status at staff role.
 *
 * Workflow rules:
 * - Walang role / hindi naka-login -> bawal ang kahit anong action (`[]`).
 * - `pending` -> pwedeng i-mark ng BHW o Midwife bilang `verified` o `escalated`.
 * - `verified` -> pwede pa ring i-`escalated` ng BHW o Midwife kapag may nakitang bagong issue.
 * - `escalated` -> tanging `midwife` lang ang pwedeng mag-`resolved` (supervisory sign-off).
 * - `resolved` -> sarado na, wala nang next actions.
 *
 * Inputs: current `status` at optional staff `role`.
 * Output: array ng allowed `ReviewAction` values.
 */
export function reviewActions(status: ReviewStatus, role?: 'bhw' | 'midwife'): ReviewAction[] {
  if (!role) return [];
  if (status === 'pending') return ['verified', 'escalated'];
  if (status === 'verified') return ['escalated'];
  if (status === 'escalated' && role === 'midwife') return ['resolved'];
  return [];
}

/** Friendly display labels para sa mga machine `issueType` codes na galing sa backend screener. */
export const ISSUE_LABELS: Record<string, string> = {
  missing_date: 'Missing date',
  invalid_date: 'Invalid date',
  ambiguous_date: 'Unclear date',
  future_date: 'Future date',
  reversed_dates: 'Dates out of order',
  same_day_doses: 'Same-day doses',
  potential_duplicate: 'Possible duplicate',
  below_minimum_interval: 'Shorter than minimum interval',
  prior_dose_not_recorded: 'Earlier dose record unavailable',
};

/**
 * Dinadagdagan yung raw review findings ng full name ng bata at short name ng vaccine.
 *
 * Inputs: `findings` galing sa API at listahan ng registered `children`.
 * Output: array ng enriched rows na ready na i-filter at ipakita sa UI.
 *
 * Edge cases na hawak nito:
 * - Linalaktawan yung findings na walang kapares na bata sa `children`.
 * - Nagfa-fallback sa raw `finding.vaccineId` kapag wala sa vaccine catalog.
 */
export function reviewRows(findings: ReviewFinding[], children: Child[]) {
  const byId = new Map(children.map((child) => [child.id, child]));
  return findings.flatMap((finding) => {
    const child = byId.get(finding.childId);
    if (!child) return [];
    return [{
      ...finding,
      name: childName(child),
      vaccine: vaccineById(finding.vaccineId)?.shortName ?? finding.vaccineId,
    }];
  });
}

/**
 * Nagfi-filter at nagso-sort ng enriched review worklist rows base sa pinili sa toolbar.
 *
 * Inputs:
 * - `rows`: enriched rows galing sa `reviewRows`.
 * - `filters`: search `query` (pangalan ng bata o vaccine), `issue` type (`'all'` o code),
 *   `priority` (`'all'`, `'high'`, `'standard'`), at `sort` (`'priority'` = una yung high priority).
 *
 * Output: filtered at deterministically sorted array ng rows.
 *
 * Edge case: may sunod-sunod na tie-breakers (child name -> childId -> issueType -> recordIds)
 * para hindi magtalon-talon yung ayos ng mga rows sa bawat render o pagination.
 */
export function filterReviewRows(rows: ReturnType<typeof reviewRows>, filters: {
  query: string;
  issue: string;
  priority: string;
  sort: string;
  reviewStatus?: ReviewStatus | 'all';
}) {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter((row) =>
    (filters.issue === 'all' || filters.issue === row.issueType) &&
    (filters.priority === 'all' || filters.priority === row.priority) &&
    (!filters.reviewStatus || filters.reviewStatus === 'all' || filters.reviewStatus === row.reviewStatus) &&
    `${row.name} ${row.vaccine}`.toLocaleLowerCase().includes(query),
  ).sort((a, b) =>
    // Kapag naka-sort by priority, inuuna yung high-priority findings (1) bago yung standard (0).
    (filters.sort === 'priority' ? Number(b.priority === 'high') - Number(a.priority === 'high') : 0) ||
    a.name.localeCompare(b.name) ||
    a.childId.localeCompare(b.childId) ||
    a.issueType.localeCompare(b.issueType) ||
    a.recordIds.join(',').localeCompare(b.recordIds.join(',')),
  );
}

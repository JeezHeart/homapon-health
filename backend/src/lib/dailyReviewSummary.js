/*
 * FILE GUIDE: Daily Immunization Review Summary (backend/src/lib/dailyReviewSummary.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Pinagsasama-sama yung active immunization screening findings sa isang daily
 *   clinic snapshot (ilang findings, ilang unique children, status counts, at checklist).
 *   Optionally nagpapapili kay Groq ng pre-approved checklist wording gamit lang yung
 *   general category names (walang kahit anong patient data ang lalabas).
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - Guidance source na "reference" imbes na "ai_assisted" (normal kapag wala pang
 *     5 batang may finding sa isang category, o naka-down/walang key yung Groq)
 *   - Privacy guard: walang pangalan ng bata, bilang, date, o status na ipinapasa kay Groq
 *   - Status counts na null kapag hindi pa naka-migrate yung review tracking tables
 */
const { selectWithGroq } = require('./reviewGuidance');

// Privacy threshold: ipapasa lang yung broad category kay Groq kapag at least 5 magkakaibang
// bata ang may finding doon, para hindi ma-reidentify kahit maliit lang ang group.
const MIN_GROUP_CHILDREN = 5;
// Ginu-group yung detailed issue codes sa dalawang general documentation themes lang.
const GROUPS = [
  ['date_documentation', new Set(['missing_date', 'invalid_date', 'ambiguous_date', 'future_date'])],
  ['dose_consistency', new Set(['reversed_dates', 'same_day_doses', 'potential_duplicate', 'prior_dose_not_recorded', 'below_minimum_interval'])],
];
// Approved public DOH manual reference na ipinapakita kasama ng daily review checklist.
const REFERENCE = {
  title: 'Philippine DOH National Immunization Program Manual of Operations, Chapter 5',
  url: 'https://doh.gov.ph/wp-content/uploads/2023/08/Booklet-4-Conducting-Immunization-Sessions.pdf',
};
// Pre-approved checklist items; ordering lang ang pwedeng piliin ng AI, bawal mag-imbento ng clinical advice.
const CHECKS = [
  'Compare affected entries with the immunization card or clinic register.',
  'Check that the documented vaccine, dose number, and administration date match the source.',
  'Bring unresolved documentation discrepancies to the midwife.',
];
// Pre-approved summary explanations; index 0 o 1 lang ang pwedeng piliin ng AI.
const EXPLANATIONS = [
  'Use the worklist to reconcile flagged entries with the original records.',
  'Check the source documentation for each finding before recording a review decision.',
];
const THEMES = ['administration dates', 'dose records and intervals'];

// Bumubuo ng daily review snapshot para sa GET /api/dose-records/review-findings?summary=1.
// Inputs:
//   - findings: array ng active (hindi cleared) screening findings
//   - trackingAvailable: boolean kung meron nang review status tracking tables sa DB
//   - date: clinic date (YYYY-MM-DD, Asia/Manila)
//   - select: optional selector function (default si Groq; pwedeng i-mock sa unit tests)
// Output: { date, findings, uniqueChildren, statuses, guidance: { source, explanation, checklist, references } }
// Debugging tip: kapag pumalya si Groq o hindi abot ng 5 kids, matic fallback 'to sa safe 'reference' guidance.
async function buildDailySummary(findings, trackingAvailable, date, select = selectWithGroq) {
  // Binibilang yung unique children, ginu-group by theme, at tina-tally yung review statuses.
  const children = new Set();
  const groups = GROUPS.map(() => new Set());
  const statuses = trackingAvailable ? { pending: 0, verified: 0, escalated: 0, resolved: 0 } : null;
  for (const finding of findings) {
    children.add(finding.childId);
    if (statuses && Object.hasOwn(statuses, finding.reviewStatus)) statuses[finding.reviewStatus]++;
    const index = GROUPS.findIndex(([, codes]) => codes.has(finding.issueType));
    if (index !== -1) groups[index].add(finding.childId);
  }
  // Yung categories lang na umabot sa MIN_GROUP_CHILDREN ang pwede ipadala sa external AI selector.
  const categories = GROUPS.filter((_, index) => groups[index].size >= MIN_GROUP_CHILDREN)
    .map(([category]) => category);
  // Gumagawa ng local summary sentence kung aling themes ang may laman sa snapshot ngayon.
  const observedThemes = THEMES.filter((_, index) => groups[index].size > 0);
  const themeSummary = observedThemes.length ? `Findings include issues with ${observedThemes.join(' and ')}. ` : '';

  // Privacy boundary: yung allowlisted category names lang ang lumalabas papuntang Groq.
  // Walang counts, dates, status buckets, o child data na pumapasok sa prompt o cache key.
  const selected = categories.length ? await select(`daily-review:${categories.join(',')}`, [
    { role: 'system', content: 'Use the broad documentation categories and public reference excerpt. Choose explanation 0 for source reconciliation or 1 for verification before recording a decision. Order these checklist steps: 0 compare original records, 1 verify vaccine/dose/date, 2 refer unresolved findings. Return only JSON with explanation (0 or 1) and order (a permutation of 0, 1, 2). Do not add any text, statistics, priorities, recommendations, or citations.' },
    { role: 'user', content: JSON.stringify({
      categories,
      excerpt: 'The Philippine DOH manual instructs staff to record immunization information on the card and assess which vaccines the infant has received.',
    }) },
  ]) : null;

  // Buuin yung final summary object; kapag null si selected, safe fallback agad sa default index 0 at [0, 1, 2].
  return {
    date,
    findings: findings.length,
    uniqueChildren: children.size,
    statuses,
    guidance: {
      source: selected ? 'ai_assisted' : 'reference',
      explanation: findings.length ? themeSummary + EXPLANATIONS[selected?.explanation ?? 0] : 'There are no active screening findings in this snapshot.',
      checklist: findings.length ? (selected?.order ?? [0, 1, 2]).map((index) => CHECKS[index]) : [],
      references: findings.length ? [REFERENCE] : [],
    },
  };
}

module.exports = { buildDailySummary };

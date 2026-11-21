/*
 * FILE GUIDE: AI-Assisted Review Guidance & Preparation Service (backend/src/lib/reviewGuidance.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Nagbibigay ng review checklist, Tagalog/English verification FAQs, at preparation
 *   worksheets para sa bawat screening issue code. Si Groq ay taga-pili/order lang ng
 *   pre-approved catalog entries (never free-form clinical text), at may 24-hour cache,
 *   rate limit, cooldown, at safe fallback sa static reference kapag walang GROQ_API_KEY o down.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - Guidance na bumabalik ng source: "reference" imbes na "ai_assisted" (check GROQ_API_KEY,
 *     6/min o 50/day cap, 60s error cooldown, o invalid JSON galing Groq)
 *   - Kapag magdadagdag ng bagong screening issue code (dapat idagdag dito sa CATALOG)
 *   - Privacy check: generic issue codes at public DOH excerpts lang ang pinapasa kay Groq
 */
const MODEL = 'openai/gpt-oss-20b';
const DAY = 86_400_000;
// Approved public DOH / HTA reference docs na naka-cite sa guidance at ipinapasa bilang excerpt kay Groq.
const REFERENCES = {
  doh: {
    title: 'Philippine DOH National Immunization Program Manual of Operations, Chapter 5',
    url: 'https://doh.gov.ph/wp-content/uploads/2023/08/Booklet-4-Conducting-Immunization-Sessions.pdf',
    excerpt: 'Record information on the immunization card. Multiple doses of the same vaccine cannot be given in one visit.',
  },
  penta: {
    title: 'Philippine HTA evidence brief citing the DOH pentavalent primary-series schedule',
    url: 'https://hta.dost.gov.ph/wp-content/uploads/2025/05/Evidence-Considered-Tdap-Booster-Vaccine.pdf',
    excerpt: 'Primary pentavalent doses two and three have a minimum interval of four weeks after each preceding dose.',
  },
};

// Pre-approved guidance templates na naka-group by issue family.
// Nakakulong lahat ng wording dito para hindi makapag-imbento ng medical advice yung AI.
const dates = {
  references: ['doh'],
  explanations: ['The documented date needs verification against the original record.', 'Confirm the administration date before relying on this entry.'],
  checks: [
    'Compare the recorded dose with the immunization card or clinic register.',
    'Confirm the administration date and distinguish it from an appointment date.',
    'If the original record is unclear, refer it to the midwife for verification.',
  ],
};
const sequence = {
  references: ['doh'],
  explanations: ['The recorded dates or dose numbers need to be reconciled with the source.', 'Check that each date belongs to the correct dose number.'],
  checks: [
    'Compare each affected vaccine, dose number, and administration date against the original record.',
    'Check whether a date was assigned to the wrong dose number.',
    'Refer unresolved discrepancies to the midwife.',
  ],
};
const duplicate = {
  references: ['doh'],
  explanations: ['The entries may document the same administration. Verify both source entries.', 'A shared date is a reason to check whether the same administration was entered twice.'],
  checks: [
    'Compare the affected entries with the immunization card and clinic register.',
    'Verify whether there is separate source documentation for each entry.',
    'Refer uncertain matches to the midwife before making a correction.',
  ],
};
// Allowlist ng mga supported issue codes at ang kanya-kanyang approved explanations, checks, at references.
const CATALOG = {
  missing_date: dates,
  invalid_date: dates,
  ambiguous_date: dates,
  future_date: dates,
  reversed_dates: sequence,
  same_day_doses: duplicate,
  potential_duplicate: duplicate,
  below_minimum_interval: {
    references: ['penta'],
    explanations: ['The recorded gap needs verification against the primary pentavalent schedule.', 'Verify both administration dates before relying on the recorded interval.'],
    checks: [
      'Compare both dates and dose numbers with the original record.',
      'Verify the applicable primary-series interval against the cited reference.',
      'Refer the finding to the midwife for review.',
    ],
  },
  prior_dose_not_recorded: {
    references: ['doh'],
    explanations: ['The earlier dose has no entry in this history. Check the source documentation.', 'The earlier dose may be documented elsewhere. Verify before classifying the record.'],
    checks: [
      'Look for the earlier dose in the immunization card and clinic register.',
      'Keep the earlier dose unverified if documentation cannot be located.',
      'Refer the unresolved record to the midwife.',
    ],
  },
};

// Validation helper: chine-check kung valid own property ng CATALOG yung issue code.
// Input: issue (kahit ano). Output: true kung supported, false kung hindi (iwas prototype pollution/lookup bugs).
function isGuidanceIssue(issue) {
  return typeof issue === 'string' && Object.hasOwn(CATALOG, issue);
}

// Bino-build yung guidance response object gamit yung napiling explanation index at checklist order.
// Inputs: entry (CATALOG item), source ('ai_assisted' | 'reference'), explanation (0|1), order (permutation ng [0,1,2]).
// Output: { source, explanation, checklist, references }.
function render(entry, source, explanation = 0, order = [0, 1, 2]) {
  return {
    source,
    explanation: entry.explanations[explanation],
    checklist: order.map((index) => entry.checks[index]),
    references: entry.references.map((id) => {
      const { title, url } = REFERENCES[id];
      return { title, url };
    }),
  };
}

// Binabasa at pina-parse yung fetch response stream pero may hard limit na 16 KB.
// Input: Fetch API Response. Output: Parsed JSON object; nag-t-throw kapag lumagpas sa 16,384 bytes.
// Debugging tip: proteksyon sa memory ng server sakaling magbalik ng sobrang laking response yung provider.
async function readBoundedJson(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      bytes += value.byteLength;
      if (bytes > 16_384) {
        await reader.cancel();
        throw new Error('Oversized provider response');
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

// Tumatawag sa Groq Chat Completions API tapos mahigpit na chine-check yung binalik na JSON selection.
// Inputs: messages (prompt array), key (GROQ_API_KEY), fetcher (fetch fn), timeout (ms).
// Output: { explanation: 0|1, order: permutation ng [0,1,2] }. Nag-t-throw sa anumang HTTP, timeout, o schema error.
// Debugging tip: bawal ang redirect, putol na sagot, sobrang keys, o maling index para hindi masira yung UI.
async function generateSelection(messages, key, fetcher, timeout) {
  const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'low',
      include_reasoning: false,
      max_completion_tokens: 512,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Provider unavailable');
  }
  const result = await readBoundedJson(response);
  const choice = result?.choices?.[0];
  // Dapat 'stop' yung finish_reason para sigurado hindi naputol yung JSON.
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string')
    throw new Error('Incomplete provider response');
  const selected = JSON.parse(choice.message.content);
  // Strict schema check: eksaktong 2 keys lang ({ explanation: 0|1, order: permutation ng [0,1,2] }).
  if (!selected || Object.keys(selected).length !== 2 ||
      ![0, 1].includes(selected.explanation) || !Array.isArray(selected.order) ||
      selected.order.length !== 3 || new Set(selected.order).size !== 3 ||
      !selected.order.every((index) => [0, 1, 2].includes(index)))
    throw new Error('Invalid provider selection');
  return selected;
}

// Factory na gumagawa ng cached, deduplicated, at rate-limited Groq selection function.
// Input: optional overrides { apiKey, fetcher, now, timeout } para madaling i-test.
// Output: async select(cacheKey, messages) -> { explanation, order } | null.
// Debugging tip: nagbabalik ng null (fallback sa 'reference') kapag walang GROQ_API_KEY, may
// nakapila nang request, nasa 60s error cooldown, o na-hit na yung 6/min or 50/day limit.
function createSelectionService({
  apiKey = () => process.env.GROQ_API_KEY,
  fetcher = (...args) => fetch(...args),
  now = Date.now,
  timeout = 5_000,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  let attempts = [];
  let retryAt = 0;

  return async function select(cacheKey, messages) {
    const key = apiKey()?.trim();
    if (!key) return null;
    const time = now();
    // Kapag naka-cache pa at hindi pa lagpas ng 24 hours, ibalik na agad (tipid sa API quota).
    const cached = cache.get(cacheKey);
    if (cached && time < cached.expires) return cached.selection;
    // Kapag may kaparehong request na ongoing pa, sumabay na lang doon imbes na mag-double call.
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    // Tanggalin yung lumang timestamps (> 24h) tapos i-enforce yung concurrency (1), cooldown (60s), 6/min, at 50/day caps.
    attempts = attempts.filter((attempt) => time - attempt < DAY);
    if (pending.size || time < retryAt || attempts.length >= 50 ||
        attempts.filter((attempt) => time - attempt < 60_000).length >= 6) return null;

    attempts.push(time);
    const request = generateSelection(messages, key, fetcher, timeout)
      .then((selection) => {
        cache.set(cacheKey, { selection, expires: now() + DAY });
        return selection;
      })
      .catch(() => {
        // Kapag nag-fail si Groq, pahinga muna ng 60 seconds bago sumubok ulit at fallback sa static reference.
        retryAt = now() + 60_000;
        return null;
      })
      .finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, request);
    return request;
  };
}

// Shared default Groq selector na gamit ng reviewGuidance at dailyReviewSummary.
const selectWithGroq = createSelectionService();

// Factory na gumagawa ng getGuidance(issue) para sa normal review checklist ng isang finding.
// Input: optional options (pang-test). Output: async getGuidance(issue) -> { source, explanation, checklist, references }.
// Debugging tip: nag-t-throw kapag unknown issue code, at tahimik na nagfa-fallback sa 'reference' kapag offline si Groq.
function createGuidanceService(options) {
  const select = options ? createSelectionService(options) : selectWithGroq;
  return async function getGuidance(issue) {
    if (!isGuidanceIssue(issue)) throw new Error('Unsupported guidance issue');
    const entry = CATALOG[issue];
    const result = await select(`issue:${issue}`, [
      { role: 'system', content: 'Use the generic issue and supplied public excerpts. Select explanation focus 0 for source reconciliation or 1 for the specific verification point. Order all three documentation steps: 0 compare original records, 1 verify the discrepancy, 2 refer unresolved findings. Return only JSON with explanation (index 0 or 1) and order (a permutation of indexes 0, 1, 2). Do not add text or recommendations.' },
      { role: 'user', content: JSON.stringify({
        issue, excerpts: entry.references.map((id) => REFERENCES[id].excerpt),
      }) },
    ]);
    return result ? render(entry, 'ai_assisted', result.explanation, result.order) : render(entry, 'reference');
  };
}

// Pre-approved documentation worksheets na lumalabas kapag 'preparation' mode.
const PREPARATION = [
  { title: 'Source comparison', fields: ['Sources checked', 'Entry in the card', 'Entry in the register', 'Discrepancy to verify'] },
  { title: 'Dose entry check', fields: ['Vaccine and dose to check', 'Detail to confirm', 'What the source shows', 'Unresolved detail'] },
  { title: 'Midwife handoff', fields: ['Sources already checked', 'Remaining discrepancy', 'Question for the midwife'] },
];
// Static English + Filipino FAQ cards na kasama sa preparation guidance para madaling basahin ng BHW/staff.
const QUESTIONS = [
  {
    question: 'Which source should I check?',
    filipinoQuestion: 'Aling tala ang dapat kong tingnan?',
    en: 'Start with the immunization card and clinic register. Compare them with the flagged entry.',
    fil: 'Tingnan muna ang immunization card at rehistro ng klinika. Ihambing ang mga ito sa minarkahang tala.',
  },
  {
    question: 'What if I cannot confirm the entry?',
    filipinoQuestion: 'Paano kung hindi ko makumpirma ang tala?',
    en: 'Document what you checked and what remains unclear. Bring unresolved discrepancies to the midwife.',
    fil: 'Itala ang iyong sinuri at kung ano ang hindi pa malinaw. Ipaalam sa midwife ang hindi pa nalulutas na pagkakaiba.',
  },
];

// Factory na gumagawa ng prepareReview(issue) para sa 'preparation' mode (may kasamang worksheet + bilingual FAQs).
// Input: select function (default si selectWithGroq).
// Output: async prepare(issue) -> { source, explanation, checklist, references, worksheet, questions }.
function createPreparationService(select = selectWithGroq) {
  return async function prepare(issue) {
    if (!isGuidanceIssue(issue)) throw new Error('Unsupported guidance issue');
    const entry = CATALOG[issue];
    const selection = await select(`preparation:${issue}`, [
      { role: 'system', content: 'Select a documentation worksheet for this generic issue. Put the most useful worksheet first: 0 compare card and register entries, 1 verify a specific vaccine/dose/date detail, 2 prepare a midwife handoff for unresolved discrepancies. Order must be a permutation of 0, 1, 2. Set explanation to 0 for source reconciliation or 1 for the specific verification point. Return JSON with only explanation and order. Do not give clinical advice.' },
      { role: 'user', content: JSON.stringify({ issue, excerpts: entry.references.map((id) => REFERENCES[id].excerpt) }) },
    ]);
    return {
      ...render(entry, selection ? 'ai_assisted' : 'reference', selection?.explanation),
      worksheet: PREPARATION[selection?.order[0] ?? 0],
      questions: QUESTIONS.map((question) => ({ ...question, reference: REFERENCES.doh.title, url: REFERENCES.doh.url })),
    };
  };
}

module.exports = {
  createGuidanceService, createPreparationService, createSelectionService, isGuidanceIssue, selectWithGroq,
  getGuidance: createGuidanceService(), prepareReview: createPreparationService(),
};

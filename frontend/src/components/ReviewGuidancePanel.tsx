/**
 * ReviewGuidancePanel.tsx
 * Guide: On-demand AI-assisted / reference verification guidance panel para sa isang
 * record-review finding. Naglo-load ng checklist, bilingual (English/Filipino) Q&A reference
 * assistant, at draft review worksheet. Ginagamit sa Record Review page.
 */
import { useEffect, useRef, useState } from 'react';
import { api, type ReviewPreparation } from '../data/api';

// Everyday Tagalog/Taglish translation map para sigurado na buong guidance card ay Tagalog
// kahit hindi pa naka-restart ang backend server o naka-cache pa yung lumang response.
const FIL_TEXT: Record<string, string> = {
  // Explanations
  'The documented date needs verification against the original record.': 'Kailangan munang i-double check ang nakalagay na petsa sa original na record.',
  'Confirm the administration date before relying on this entry.': 'I-confirm muna ang totoong petsa ng bakuna bago ito gamitin sa record.',
  'The recorded dates or dose numbers need to be reconciled with the source.': 'Hindi tugma ang petsa o dose number — kailangan itong i-check sa original na record.',
  'Check that each date belongs to the correct dose number.': 'I-check kung tamang dose number ang nakalagay sa bawat petsa ng bakuna.',
  'The entries may document the same administration. Verify both source entries.': 'Mukhang nadoble ang pag-encode ng parehong bakuna. I-check muna pareho sa original na record.',
  'A shared date is a reason to check whether the same administration was entered twice.': 'Magkapareho ang petsa ng dalawang record — i-check kung iisang turok lang ito na dalawang beses na-encode.',
  'The recorded gap needs verification against the primary pentavalent schedule.': 'Masyadong maikli ang pagitan ng dalawang Pentavalent dose — i-check ito laban sa DOH schedule.',
  'Verify both administration dates before relying on the recorded interval.': 'I-double check muna pareho ang petsa ng bakuna bago pagbasehan ang agwat ng mga dose.',
  'The earlier dose has no entry in this history. Check the source documentation.': 'Walang naka-encode na mas naunang dose dito. I-check muna sa immunization card o logbook.',
  'The earlier dose may be documented elsewhere. Verify before classifying the record.': 'Baka sa ibang clinic o card nakasulat ang naunang dose — i-verify muna bago i-update.',
  // Checklist steps
  'Compare the recorded dose with the immunization card or clinic register.': 'Ikumpara ang naka-encode na bakuna sa immunization card ng bata o logbook ng clinic.',
  'Confirm the administration date and distinguish it from an appointment date.': 'I-confirm kung totoong petsa ito ng turok at hindi lang petsa ng appointment.',
  'If the original record is unclear, refer it to the midwife for verification.': 'Kung malabo pa rin sa original na record, i-refer ito sa midwife para ma-verify.',
  'Compare each affected vaccine, dose number, and administration date against the original record.': 'Ikumpara ang vaccine, dose number, at petsa ng bakuna sa original na card o logbook.',
  'Check whether a date was assigned to the wrong dose number.': 'I-check kung napagbaligtad o mali lang ang nalagay na dose number sa petsa.',
  'Refer unresolved discrepancies to the midwife.': 'I-refer sa midwife kung hindi pa rin tugma o malinaw ang record.',
  'Compare the affected entries with the immunization card and clinic register.': 'Ikumpara ang dalawang record sa immunization card ng bata at logbook ng clinic.',
  'Verify whether there is separate source documentation for each entry.': 'I-check kung may hiwalay bang record ang bawat turok o nadoble lang ng lagay.',
  'Refer uncertain matches to the midwife before making a correction.': 'I-refer muna sa midwife bago magbago o mag-correct kung hindi sigurado.',
  'Compare both dates and dose numbers with the original record.': 'Ikumpara ang dalawang petsa at dose number sa original na card o logbook.',
  'Verify the applicable primary-series interval against the cited reference.': 'I-check kung pasok sa minimum 4-week (28 days) interval ng DOH para sa Pentavalent.',
  'Refer the finding to the midwife for review.': 'I-refer sa midwife para ma-review ang record.',
  'Look for the earlier dose in the immunization card and clinic register.': 'Hanapin ang mas naunang dose sa immunization card ng bata at logbook ng clinic.',
  'Keep the earlier dose unverified if documentation cannot be located.': 'Huwag muna i-mark na verified ang naunang dose kung walang makitang katibayan.',
  'Refer the unresolved record to the midwife.': 'I-refer sa midwife kung kulang o hindi pa mahanap ang naunang record.',
  // Worksheet titles & fields
  'Source comparison': 'Pagkumpara ng record',
  'Dose entry check': 'Pag-check ng dose',
  'Midwife handoff': 'Handoff sa midwife',
  'Sources checked': 'Mga record na na-check',
  'Entry in the card': 'Nakalagay sa immunization card',
  'Entry in the register': 'Nakalagay sa logbook ng clinic',
  'Discrepancy to verify': 'Pagkakaiba na i-verify',
  'Vaccine and dose to check': 'Vaccine at dose na i-check',
  'Detail to confirm': 'Detalye na i-confirm',
  'What the source shows': 'Nakalagay sa original na record',
  'Unresolved detail': 'Hindi pa malinaw',
  'Sources already checked': 'Mga record na na-check na',
  'Remaining discrepancy': 'Hindi pa tugmang detalye',
  'Question for the midwife': 'Tanong para sa midwife',
  // Legacy deep-Filipino Q&A fallback -> conversational Tagalog/Taglish
  'Aling tala ang dapat kong tingnan?': 'Aling record ang dapat kong i-check?',
  'Tingnan muna ang immunization card at rehistro ng klinika. Ihambing ang mga ito sa minarkahang tala.': 'I-check muna ang immunization card ng bata at ang logbook ng clinic, tapos ikumpara sa naka-flag na record dito.',
  'Paano kung hindi ko makumpirma ang tala?': 'Paano kung hindi ko ma-confirm ang record?',
  'Itala ang iyong sinuri at kung ano ang hindi pa malinaw. Ipaalam sa midwife ang hindi pa nalulutas na pagkakaiba.': 'Isulat lang sa remarks kung ano ang na-check mo at kung alin ang hindi pa sigurado, tapos i-refer sa midwife.',
};

function toFil(text: string): string {
  return FIL_TEXT[text] ?? text;
}

function formatWorksheet(fields: string[]): string {
  return fields.map((field) => field + ': ').join('\n');
}

/** Nagfe-fetch at nagdi-display ng verification checklist, Q&A reference assistant, at draft note para sa isang `issueCode`. */
export default function ReviewGuidancePanel({ issueCode }: { issueCode: string }) {
  const request = useRef<AbortController | null>(null);
  const prepareButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const moveFocus = useRef(false);
  const [guidance, setGuidance] = useState<ReviewPreparation>();
  const [language, setLanguage] = useState<'en' | 'fil'>('en');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Kina-cancel ang pending API request kapag na-unmount ang component.
  useEffect(() => () => request.current?.abort(), []);
  // Nililipat ang keyboard focus sa guidance heading pagkatapos mag-load kung yung Prepare button ang pinindot.
  useEffect(() => {
    if (guidance && moveFocus.current) heading.current?.focus();
    moveFocus.current = false;
  }, [guidance]);

  // Tumatawag sa backend reviewPreparation API para kunin ang checklist at bilingual Q&A ng issueCode.
  async function loadGuidance() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const result = await api.reviewPreparation(issueCode, controller.signal);
      if (!controller.signal.aborted) {
        moveFocus.current = document.activeElement === prepareButton.current;
        setGuidance(result);
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleLanguageChange(nextLang: 'en' | 'fil') {
    if (guidance && draftRef.current) {
      const enDraft = formatWorksheet(guidance.worksheet.fields);
      const filFields = guidance.worksheet.filipinoFields ?? guidance.worksheet.fields.map(toFil);
      const filDraft = formatWorksheet(filFields);
      const current = draftRef.current.value;
      // Palitan lang ang template prompts kapag hindi pa nagta-type ang user sa draft note.
      if (current === enDraft || current === filDraft) {
        draftRef.current.value = nextLang === 'fil' ? filDraft : enDraft;
      }
    }
    setLanguage(nextLang);
  }

  const isFil = language === 'fil';
  const answer = guidance?.questions[questionIndex];
  const explanationText = guidance
    ? (isFil ? guidance.filipinoExplanation ?? toFil(guidance.explanation) : guidance.explanation)
    : '';
  const checklistItems = guidance
    ? (isFil
      ? (guidance.filipinoChecklist?.length ? guidance.filipinoChecklist : guidance.checklist.map(toFil))
      : guidance.checklist)
    : [];
  const worksheetTitle = guidance
    ? (isFil ? guidance.worksheet.filipinoTitle ?? toFil(guidance.worksheet.title) : guidance.worksheet.title)
    : '';

  return <div className="mt-3">
    {/* Trigger button, loading status, at error alert bago mag-load yung guidance */}
    {!guidance && <button ref={prepareButton} type="button" aria-disabled={loading} onClick={loadGuidance}
      className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium aria-disabled:opacity-50">
      {failed ? 'Retry verification guidance' : 'Prepare verification'}
    </button>}
    {loading && <p role="status" className="mt-2 text-sm">Loading guidance…</p>}
    {failed && <p role="alert" className="mt-2 text-sm">Guidance could not be loaded. Try again or check the original record.</p>}
    {/* Loaded verification guidance section: buong card sumusunod sa English / Filipino selector */}
    {guidance && <section className="space-y-2.5 wrap-break-word rounded-xl bg-[var(--color-accent-soft)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 ref={heading} tabIndex={-1} className="font-semibold">
          {isFil
            ? (guidance.source === 'ai_assisted' ? 'AI-assisted na gabay sa pag-verify' : 'Gabay sa pag-verify (Reference)')
            : (guidance.source === 'ai_assisted' ? 'AI-assisted verification guidance' : 'Reference guidance')}
        </h3>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-navy-soft)]">
          <span>{isFil ? 'Wika' : 'Language'}</span>
          <select
            aria-label="Language"
            className="min-h-8 rounded-lg border bg-[var(--color-surface)] px-2 py-1 text-xs font-medium text-[var(--color-navy)]"
            value={language}
            onChange={event => handleLanguageChange(event.target.value === 'fil' ? 'fil' : 'en')}
          >
            <option value="en">English</option>
            <option value="fil">Filipino</option>
          </select>
        </label>
      </div>
      <p>{explanationText}</p>
      <ol className="list-decimal space-y-1 pl-5">
        {checklistItems.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {guidance.references.map(({ title, url }) => <a key={url} className="block font-medium underline"
        href={url} target="_blank" rel="noreferrer">{title}</a>)}
      {/* Bilingual (English / Filipino) staff reference Q&A selector */}
      <h4 className="pt-1 font-semibold">{isFil ? 'Gabay sa mga tanong' : 'Reference assistant'}</h4>
      <label className="flex min-w-0 flex-col gap-1">
        <span>{isFil ? 'Tanong ng staff' : 'Staff question'}</span>
        <select className="w-full max-w-full rounded border bg-[var(--color-surface)]" value={questionIndex}
          onChange={event => setQuestionIndex(Number(event.target.value))}>
          {guidance.questions.map((item, index) => <option key={item.question} value={index}>
            {isFil ? toFil(item.filipinoQuestion) : item.question}
          </option>)}
        </select>
      </label>
      {answer && <div aria-live="polite">
        <p lang={language}>{isFil ? toFil(answer.fil) : answer.en}</p>
        <a className="underline" href={answer.url} target="_blank" rel="noreferrer">{answer.reference}</a>
      </div>}
      {/* Scratchpad draft note worksheet na pwedeng i-copy sa Internal remarks */}
      <label className="block pt-1 font-semibold">
        {isFil ? 'Draft na notes' : 'Draft review note'} · {worksheetTitle}
        <textarea ref={draftRef} rows={5} maxLength={500} defaultValue={formatWorksheet(guidance.worksheet.fields)}
          className="mt-1 block w-full rounded border bg-[var(--color-surface)] p-2 font-normal" />
      </label>
      <p className="text-xs text-[var(--color-navy-soft)]">
        {isFil
          ? 'Draft lang ito. I-copy sa Internal remarks kapag ready ka nang i-save ang desisyon.'
          : 'Draft only. Copy the finished note into Internal remarks when recording your decision.'}
      </p>
    </section>}
  </div>;
}

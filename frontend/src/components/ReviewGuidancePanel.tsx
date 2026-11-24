/**
 * ReviewGuidancePanel.tsx
 * Guide: On-demand AI-assisted / reference verification guidance panel para sa isang
 * record-review finding. Naglo-load ng checklist, bilingual (English/Filipino) Q&A reference
 * assistant, at draft review worksheet. Ginagamit sa Record Review page.
 */
import { useEffect, useRef, useState } from 'react';
import { api, type ReviewPreparation } from '../data/api';

/** Nagfe-fetch at nagdi-display ng verification checklist, Q&A reference assistant, at draft note para sa isang `issueCode`. */
export default function ReviewGuidancePanel({ issueCode }: { issueCode: string }) {
  const request = useRef<AbortController | null>(null);
  const prepareButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
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

  const isFil = language === 'fil';
  const answer = guidance?.questions[questionIndex];
  const explanationText = guidance
    ? (isFil ? guidance.filipinoExplanation ?? guidance.explanation : guidance.explanation)
    : '';
  const checklistItems = guidance
    ? (isFil && guidance.filipinoChecklist?.length ? guidance.filipinoChecklist : guidance.checklist)
    : [];
  const worksheetTitle = guidance
    ? (isFil ? guidance.worksheet.filipinoTitle ?? guidance.worksheet.title : guidance.worksheet.title)
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
            onChange={event => setLanguage(event.target.value === 'fil' ? 'fil' : 'en')}
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
            {isFil ? item.filipinoQuestion : item.question}
          </option>)}
        </select>
      </label>
      {answer && <div aria-live="polite">
        <p lang={language}>{answer[language]}</p>
        <a className="underline" href={answer.url} target="_blank" rel="noreferrer">{answer.reference}</a>
      </div>}
      {/* Scratchpad draft note worksheet na pwedeng i-copy sa Internal remarks */}
      <label className="block pt-1 font-semibold">
        {isFil ? 'Draft na notes' : 'Draft review note'} · {worksheetTitle}
        <textarea rows={5} maxLength={500} defaultValue={guidance.worksheet.fields.map(field => field + ': ').join('\n')}
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

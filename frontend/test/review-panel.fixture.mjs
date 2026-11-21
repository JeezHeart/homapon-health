import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Panel from '../src/components/ReviewTrackingPanel.tsx';
import Guidance from '../src/components/ReviewGuidancePanel.tsx';
import { api } from '../src/data/api.ts';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '../src/components/Layout.tsx';
import Worklist from '../src/pages/ReviewWorklistPage.tsx';
import { StoreContext } from '../src/state/store-context.ts';
import '../src/index.css';

const root = createRoot(document.querySelector('#root'));
const finding = { childId: 'fictional-child', findingKey: 'finding', version: 'same-evidence' };
const render = (reviewStatus, eventId) => flushSync(() => root.render(React.createElement(Panel, {
  finding: { ...finding, reviewStatus, eventId }, role: 'bhw', onReload() {}, onSaved() {},
})));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const assert = (condition, message) => { if (!condition) throw Error(message); };
let requests = 0;
let finishOld;
api.reviewHistory = async (_child, _finding, page, signal) => {
  assert(page === 1, 'Expected a fresh first history page');
  if (++requests === 1) await new Promise(resolve => { finishOld = resolve; });
  return { events: [{ id: '2', from_status: 'verified', status: 'escalated', reviewer_name: 'Fictional staff',
    reviewer_role: 'bhw', created_at: '2026-01-01T00:00:00Z', remarks: signal.aborted ? 'Obsolete response' : 'Updated decision' }], hasMore: false };
};
async function checkPanel() {
  render('verified', '1');
  assert(document.querySelector('select'), 'Expected verification controls');
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Show review history')).click();
  await tick();
  render('escalated', '2');
  await tick();
  finishOld();
  await tick();
  assert(requests === 2, 'Open history was not refreshed');
  assert(document.querySelector('strong').textContent === 'Escalated', 'Status stayed stale');
  assert(!document.querySelector('select'), 'BHW controls remained after escalation');
  assert(document.querySelector('ol')?.textContent.includes('Updated decision'), 'New audit entry missing');
  assert(!document.body.innerText.includes('Obsolete response'), 'Old request overwrote history');
  let preparations = 0;
  api.reviewPreparation = async (issue) => {
    assert(issue === 'missing_date', 'Preparation request must use the issue code');
    preparations++;
    return { source: 'reference', explanation: 'Check the entry', checklist: ['Compare the source'],
      references: [], worksheet: { title: 'Source comparison', fields: ['Source checked'] },
      questions: [{ question: 'Which source?', filipinoQuestion: 'Aling tala?', en: 'Check the card.',
        fil: 'Tingnan ang card.', reference: 'Public reference', url: 'https://example.org' }] };
  };
  api.transitionReview = () => { throw Error('Draft preparation must never save a decision'); };
  flushSync(() => root.render(React.createElement(Guidance, { issueCode: 'missing_date' })));
  const prepare = document.querySelector('button');
  prepare.focus();
  prepare.click();
  await tick();
  assert(document.activeElement === document.querySelector('h3'), 'Focus lost when guidance replaced the Prepare button');
  const note = document.querySelector('textarea');
  assert(note?.value === 'Source checked: ', 'Worksheet fields missing');
  note.value += 'fictional card';
  const language = document.querySelector('select');
  language.value = 'fil';
  language.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert(document.querySelector('[lang=fil]')?.textContent === 'Tingnan ang card.', 'Filipino answer missing');
  assert(note.value.includes('fictional card') && preparations === 1, 'Switching language lost the draft or sent another request');
  await checkWorklist(note.value);
  document.querySelector('output').textContent = 'PASS';
}

const el = React.createElement;
const button = (label) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
function change(control, value) {
  const prototype = Object.getPrototypeOf(control);
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value);
  control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function ChildRoute() {
  const location = useLocation();
  return el('p', {}, location.pathname + location.search);
}
async function checkWorklist(draft) {
  const children = Array.from({ length: 12 }, (_, i) => ({ id: 'fictional-' + i, firstName: 'Child ' + String(i).padStart(2, '0'), lastName: 'Fixture' }));
  const findings = children.map((child, i) => ({
    childId: child.id, findingKey: 'finding-' + i, version: 'version', recordIds: ['dose-' + i],
    issueType: i === 11 ? 'invalid_date' : 'missing_date', priority: i === 11 ? 'high' : 'standard',
    priorityReason: 'Verify documentation', vaccineId: 'penta', doses: [1], message: 'Check the source',
  }));
  let mode = 'error', role = 'bhw', status = 'pending', writes = 0;
  api.reviewFindings = async () => {
    if (mode === 'error') {
      await new Promise(resolve => setTimeout(resolve, 50));
      throw Error('Synthetic timeout');
    }
    const available = mode === 'tracked';
    return { findings: mode === 'empty' ? [] : findings.map((item, i) => available && i === 11
      ? { ...item, reviewStatus: status, eventId: status === 'pending' ? null : String(writes) } : item),
    trackingAvailable: available, summary: { date: '2026-11-21', findings: mode === 'empty' ? 0 : 12,
      uniqueChildren: mode === 'empty' ? 0 : 12, statuses: null,
      guidance: { source: available ? 'ai_assisted' : 'reference', explanation: 'Check documentation', checklist: ['Compare records'], references: [] } } };
  };
  api.transitionReview = async (input) => {
    if (writes === 0) assert(input.remarks === draft, 'Copied draft missing from explicit save');
    writes++;
    status = input.status;
    return { eventId: String(writes), status };
  };
  const mount = () => flushSync(() => root.render(el(StoreContext.Provider, {
    value: { connected: true, children, appointments: [], records: [], demoUser: { name: 'Fictional staff', role } },
  }, el(MemoryRouter, {}, el(Routes, {}, el(Route, { element: el(Layout) },
    el(Route, { index: true, element: el('p', {}, 'Fixture dashboard') }),
    el(Route, { path: 'review', element: el(Worklist) }),
    el(Route, { path: 'children/:id', element: el(ChildRoute) })))))));
  const findNav = () => [...document.querySelectorAll('nav a')].find(a => a.textContent.trim() === 'Record Review' && a.getClientRects().length);
  const main = () => document.querySelector('main');
  const headings = () => [...main().querySelectorAll('ul h2')].map(n => n.textContent);
  const settle = async () => { await tick(); await tick(); await tick(); };
  mount();
  const mobile = document.querySelector('[aria-label="Open navigation"]');
  if (mobile.getClientRects().length) {
    mobile.focus(); mobile.click(); await tick();
    assert(document.querySelector('[role=dialog]') || document.querySelector('dialog[open]'), 'Mobile drawer did not open');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    assert(document.activeElement === mobile, 'Escape did not restore drawer trigger focus');
    mobile.click(); await tick();
  }
  findNav()?.click();
  await tick();
  assert(main().textContent.includes('Loading review findings'), 'Loading state missing');
  await settle();
  assert(main().querySelector('[role=alert]')?.textContent.includes('could not be loaded'), 'Timeout error state missing');
  mode = 'empty'; button('Try again').click(); await settle();
  assert(main().textContent.includes('No findings to review'), 'Empty state missing');
  mode = 'unavailable'; window.dispatchEvent(new Event('focus')); await settle();
  assert(main().textContent.includes('Review tracking is unavailable') && main().textContent.includes('Reference guidance'), 'Unavailable tracking or fallback absent');
  assert(main().querySelector('dd')?.textContent === '12', 'Daily findings count incorrect');
  assert(headings().length === 10 && headings()[0] === 'Child 11 Fixture', 'Priority order or first page incorrect');
  button('Next').click(); await settle();
  assert(headings().length === 2, 'Next page incorrect');
  const search = main().querySelector('input[type=search]');
  search.focus(); change(search, 'Child 11'); await settle();
  assert(headings().length === 1 && document.activeElement === search, 'Search or focus retention failed');
  change(search, ''); await settle();
  const [issue, priority, sort] = main().querySelectorAll('select');
  change(issue, 'invalid_date'); await settle();
  assert(headings().length === 1, 'Issue filter failed');
  change(priority, 'standard'); await settle();
  assert(main().textContent.includes('No matching findings'), 'Priority filter failed');
  change(issue, 'all'); await settle(); change(priority, 'all'); await settle();
  change(sort, 'name'); await settle();
  assert(headings()[0] === 'Child 00 Fixture', 'Name sort failed');
  change(search, 'Child 11'); await settle();
  mode = 'tracked'; window.dispatchEvent(new Event('focus')); await settle();
  assert(main().textContent.includes('AI-assisted documentation checklist'), 'AI summary state missing');
  const remarks = main().querySelector('textarea');
  change(remarks, draft); await tick();
  assert(writes === 0 && button('Save review').disabled, 'Copying draft saved automatically');
  const select = main().querySelector('form select');
  change(select, 'verified'); await tick(); button('Save review').click(); await settle();
  assert(writes === 1 && main().textContent.includes('Verified'), 'BHW verification UI failed');
  change(main().querySelector('form select'), 'escalated'); await tick(); button('Save review').click(); await settle();
  assert(writes === 2 && !main().querySelector('form select'), 'BHW retention or escalation controls failed');
  role = 'midwife'; mount(); await settle();
  change(main().querySelector('form select'), 'resolved'); await tick(); button('Save review').click(); await settle();
  assert(writes === 3 && main().textContent.includes('Resolved'), 'Midwife resolution UI failed');
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'Horizontal page overflow');
  const child = main().querySelector('a[href*="/children/"]');
  child.focus(); assert(document.activeElement === child, 'Child link is not focusable');
  child.click(); await settle();
  assert(main().textContent.includes('/children/fictional-11?tab=history'), 'Child history link incorrect');
  document.querySelector('output').dataset.viewport = String(window.innerWidth);
}
checkPanel().catch(error => { document.querySelector('output').textContent = String(error); });

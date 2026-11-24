import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Panel from '../src/components/ReviewTrackingPanel.tsx';
import Guidance from '../src/components/ReviewGuidancePanel.tsx';
import { api } from '../src/data/api.ts';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '../src/components/Layout.tsx';
import Worklist from '../src/pages/ReviewWorklistPage.tsx';
import Dashboard from '../src/pages/DashboardPage.tsx';
import ChildProfile from '../src/pages/ChildProfilePage.tsx';
import Children from '../src/pages/ChildrenPage.tsx';
import Records from '../src/pages/RecordsPage.tsx';
import Schedule from '../src/pages/SchedulePage.tsx';
import Sms from '../src/pages/SmsPage.tsx';
import Reports from '../src/pages/ReportsPage.tsx';
import Settings from '../src/pages/SettingsPage.tsx';
import { daysFromNow } from '../src/utils/dates.ts';
import { StoreContext } from '../src/state/store-context.ts';
import '../src/index.css';

let renderError;
const root = createRoot(document.querySelector('#root'), { onUncaughtError: error => { renderError = error; } });
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
  await checkDashboardAndProfile();
  await checkScheduleSmsAndReports();
  document.querySelector('output').textContent = 'PASS';
}

async function checkScheduleSmsAndReports() {
  const child = { id: 'clinic-fixture', firstName: 'Fictional', lastName: 'Infant With A Longer Name',
    birthDate: daysFromNow(-140), sex: 'Female', guardian: 'Fictional Guardian', guardianMobile: '09000000000', purok: 'Purok 1' };
  const appointment = { id: 'clinic-visit', childId: child.id, vaccineId: 'penta', doseNumber: 2, scheduledDate: daysFromNow(7), scheduledTime: '09:00' };
  const store = { connected: true, dataReady: true, children: [child], appointments: [appointment], demoUser: { name: 'Fictional staff', role: 'midwife' },
    records: [{ id: 'clinic-dose', childId: child.id, vaccineId: 'penta', doseNumber: 1, dateAdministered: daysFromNow(0) }],
    smsLog: [{ id: 'uncertain', childId: child.id, status: 'Unknown', sentAt: daysFromNow(0), message: 'Fictional message' },
      { id: 'accepted', childId: child.id, status: 'Accepted', sentAt: daysFromNow(0), message: 'Fictional accepted message' }] };
  api.smsAvailability = async () => ({ enabled: false, dryRun: true });
  const mount = (path, Screen, data = store) => flushSync(() => root.render(el(StoreContext.Provider, { value: data },
    el(MemoryRouter, { key: path, initialEntries: [path] }, el(Routes, {}, el(Route, { element: el(Layout) },
      el(Route, { path: '*', element: el(Screen) })))))));
  const dialog = () => document.querySelector('[role=dialog]');
  const inFilterCard = (label, filter) => {
    assert(button(label)?.closest('.health-card')?.contains(document.querySelector(filter)),
      label + ' should share the filter card');
  };
  const opensDialog = async (label, title) => {
    button(label).click(); await tick();
    assert(dialog()?.getAttribute('aria-label') === title, label + ' did not open its form');
    dialog().querySelector('[aria-label="Close dialog"]').click(); await tick();
  };
  const fit = (label, element = document.documentElement) => {
    assert(element && element.scrollWidth <= element.clientWidth + 1, label + ' overflows horizontally');
    assert(parseFloat(getComputedStyle(document.querySelector('main')).paddingTop) <= 12,
      label + ' content starts too far below the header');
  };
  for (const theme of ['light', 'dark']) {
    document.documentElement.dataset.theme = theme;
    mount('/children', Children); await tick();
    fit('Child Records');
    inFilterCard('Export CSV', '[aria-label="Search by child or guardian name"]');
    inFilterCard('Register child', '[aria-label="Search by child or guardian name"]');
    await opensDialog('Register child', 'Register child');
    const partialKpi = document.querySelector('[aria-label="Child records totals"] button:nth-child(3)');
    assert(partialKpi.querySelector('strong').textContent === '1', 'Child Records KPI count incorrect');
    partialKpi.click(); await tick();
    assert(document.querySelector('[aria-label="Filter by vaccination status"]').value === 'Partially immunized', 'Child Records KPI did not filter');
    mount('/records', Records); await tick();
    fit('Records');
    inFilterCard('Add Vaccination Record', '[aria-label="Search by child, guardian, or vaccine"]');
    await opensDialog('Add Vaccination Record', 'Add vaccination record');
    assert([...document.querySelectorAll('[aria-label="Vaccination record totals"] strong')].map(node => node.textContent).join() === '1,1',
      'Vaccination record KPI counts incorrect');
    mount('/settings', Settings); await tick();
    fit('Settings');
    assert(document.querySelectorAll('main h2 .summary-stat-icon').length === 4, 'Settings card icons missing');
    // Keep the same available width even when one page is tall enough to scroll.
    document.documentElement.style.scrollbarGutter = 'stable';
    mount('/dashboard', Dashboard); await tick();
    fit('Dashboard');
    const dashboardDate = document.querySelector('.calendar-day');
    const dashboardDay = dashboardDate.getBoundingClientRect();
    const dashboardCalendarWidth = dashboardDate.closest('.health-card').getBoundingClientRect().width;
    mount('/schedule?month=' + appointment.scheduledDate.slice(0, 7), Schedule); await tick();
    fit('Schedule');
    inFilterCard('Book Appointment', '[aria-label="Appointment status filter"]');
    await opensDialog('Book Appointment', 'Schedule appointment');
    const overdueKpi = document.querySelector('[aria-label="Appointment totals"] button:nth-child(3)');
    overdueKpi.click(); await tick();
    assert(overdueKpi.getAttribute('aria-pressed') === 'true' &&
      document.querySelector('[aria-label="Appointment status filter"]').value === 'overdue', 'Schedule KPI did not change the status filter');
    document.querySelector('[aria-label="Appointment totals"] button').click(); await tick();
    const appointmentDay = [...document.querySelectorAll('button[aria-pressed]')].find(day =>
      day.getAttribute('aria-label')?.includes(': 1 appointment'));
    const dayBounds = appointmentDay.getBoundingClientRect();
    assert(dayBounds.height === dashboardDay.height && dayBounds.width === dashboardDay.width,
      'Schedule date control dimensions differ from Dashboard');
    const scheduleCalendar = appointmentDay.closest('.health-card');
    const scheduleCalendarWidth = scheduleCalendar.getBoundingClientRect().width;
    assert(Math.abs(scheduleCalendarWidth - dashboardCalendarWidth) <= 1,
      `Calendar width differs: Schedule ${scheduleCalendarWidth}, Dashboard ${dashboardCalendarWidth}, grid ${getComputedStyle(scheduleCalendar.parentElement).gridTemplateColumns}`);
    document.documentElement.style.scrollbarGutter = '';
    appointmentDay.click(); await tick();
    const list = document.querySelector('[aria-label="Vaccination appointments"]');
    const appointmentBounds = list.querySelector('li').getBoundingClientRect();
    const sideBySide = matchMedia('(min-width: 1024px)').matches;
    const aligned = (calendar, panel) => {
      const left = calendar.getBoundingClientRect();
      const right = panel.getBoundingClientRect();
      return Math.abs(left.top - right.top) <= 1 && Math.abs(left.bottom - right.bottom) <= 1;
    };
    if (sideBySide) assert(aligned(scheduleCalendar, list.closest('section')), 'Single appointment panel does not align with calendar');
    assert(appointmentBounds.height < 130, 'A single appointment stretches vertically');
    assert(appointmentBounds.width >= list.clientWidth - 32, 'A single appointment leaves an empty grid column');
    document.querySelector('[aria-label="Vaccination appointments"] button').click(); await tick();
    assert(dialog()?.getAttribute('aria-label') === 'Appointment details', 'Appointment details did not open');
    fit('Appointment details', dialog());
    button('Reschedule').click(); await tick();
    assert(dialog()?.getAttribute('aria-label') === 'Reschedule appointment', 'Reschedule did not open');
    fit('Reschedule', dialog());
    const fullSchedule = ['penta', 'bcg', 'hep-b', 'opv', 'ipv', 'pcv', 'mmr', 'rota'].map((vaccineId, i) =>
      ({ ...appointment, id: 'booked-' + i, vaccineId, scheduledTime: `09:${String(i * 5).padStart(2, '0')}` }));
    mount('/schedule?date=' + appointment.scheduledDate, Schedule, { ...store, appointments: fullSchedule }); await tick();
    const fullList = document.querySelector('[aria-label="Vaccination appointments"]');
    assert(fullList.children.length === 8, 'Schedule page should keep all eight appointments');
    if (sideBySide) {
      const calendar = document.querySelector('.calendar-day').closest('.health-card');
      const panel = fullList.closest('section');
      assert(aligned(calendar, panel), 'Full appointment panel does not align with calendar');
      fullList.scrollTop = fullList.scrollHeight;
      assert(fullList.scrollTop > 0, `Overflowing appointments cannot be scrolled (${fullList.clientHeight} client, ${fullList.scrollHeight} content)`);
    }
    mount('/sms', Sms); await tick();
    const checkbox = document.querySelector('main input[type=checkbox]');
    checkbox.click(); await tick();
    assert(checkbox.checked && !dialog(), 'Reminder checkbox opened a dialog or did not select');
    checkbox.closest('li').querySelector('button').click(); await tick();
    assert(dialog()?.getAttribute('aria-label') === 'Send SMS reminder', 'Reminder card did not open the preview');
    fit('SMS preview', dialog());
    mount('/sms?view=history', Sms); await tick();
    const uncertainKpi = document.querySelector('[aria-label="SMS totals"] button:nth-child(3)');
    uncertainKpi.click(); await tick();
    assert(uncertainKpi.getAttribute('aria-pressed') === 'true', 'Uncertain SMS KPI did not activate');
    assert(document.querySelector('main').textContent.includes('Fictional message') &&
      !document.querySelector('main').textContent.includes('Fictional accepted message'), 'SMS status filter did not isolate uncertain messages');
    fit('SMS History');
    mount('/reports', Reports); await tick();
    assert(document.querySelectorAll('[aria-label="Current registry summary"] a.kpi-card').length === 4, 'Reports KPI links missing');
    assert(document.querySelector('main').textContent.includes('Weekly doses given'), 'Reports weekly chart missing');
    assert(document.querySelector('main table caption') && document.querySelector('[class~="print:block"] tbody tr'), 'Printable report tables missing');
    fit('Reports');
    inFilterCard('Print / Save as PDF', '[aria-label="Report purok"]');
    let printRequested = false;
    window.print = () => { printRequested = true; };
    button('Print / Save as PDF').click();
    assert(printRequested, 'Reports print action did not run');
  }
}

async function checkDashboardAndProfile() {
  const child = { id: 'preview', firstName: 'Fictional', lastName: 'Infant', birthDate: daysFromNow(-140), sex: 'Female',
    guardian: 'Fictional Guardian', guardianMobile: '', purok: 'Purok 1', notes: 'Layout test only' };
  const appointment = { id: 'overdue-preview', childId: child.id, vaccineId: 'penta', doseNumber: 1,
    scheduledDate: daysFromNow(-1), scheduledTime: '09:00' };
  api.latestGrowthMeasurements = async () => [];
  for (const theme of ['light', 'dark']) {
    document.documentElement.dataset.theme = theme;
    const role = theme === 'light' ? 'midwife' : 'bhw';
    flushSync(() => root.render(el(StoreContext.Provider, {
      value: { connected: true, dataReady: true, children: [child], appointments: [appointment], records: [],
        smsLog: [], demoGrowth: [], demoUser: { name: 'Fictional staff', role } },
    }, el(MemoryRouter, { key: theme }, el(Routes, {}, el(Route, { element: el(Layout) },
      el(Route, { index: true, element: el(Dashboard) }),
      el(Route, { path: 'children', element: el('a', { href: '#child' }, 'Fixture directory') }),
      el(Route, { path: 'children/:id', element: el(ChildProfile) })))))));
    await tick(); await tick();
    window.scrollTo(0, 0);
    const header = document.querySelector('.app-header').getBoundingClientRect();
    assert(header.height <= 56, 'Shared header is taller than the compact layout');
    if (matchMedia('(min-width: 1024px)').matches) {
      const brand = document.querySelector('.sidebar-brand').getBoundingClientRect();
      assert(Math.abs(brand.bottom - header.bottom) <= 1,
        `Sidebar and header borders do not align (${brand.bottom}, ${header.bottom}, scroll ${window.scrollY})`);
    } else {
      assert(document.querySelector('[aria-label="Open navigation"]').getBoundingClientRect().height >= 44,
        'Compact header reduced the navigation touch target');
    }
    const series = document.querySelector('.overview-chart-reveal');
    assert(series, 'Dashboard chart data series missing');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('output').dataset.motion = reducedMotion ? 'reduced' : 'normal';
    const reveal = getComputedStyle(series).animationName;
    assert(reducedMotion ? reveal === 'none' : reveal === 'overview-chart-sweep', 'Dashboard chart motion preference was not applied');
    if (!reducedMotion) {
      const keyframes = series.getAnimations()[0]?.effect.getKeyframes();
      assert(keyframes?.[0].clipPath.includes('100%') && !keyframes.at(-1).clipPath.includes('100%'),
        'Dashboard chart reveal did not open from the left');
    }
    const calendarDay = document.querySelector('.dashboard-calendar button[aria-label*=", 1 appointment"]');
    if (renderError) throw renderError;
    assert(calendarDay, 'Dashboard calendar appointment missing: ' + document.querySelector('main')?.textContent.slice(0,250));
    assert(document.querySelector('a[href="/children?age=three-to-five"]'), 'Infant age link missing');
    const dashboardCard = (title) => [...document.querySelectorAll('main h2')]
      .find(heading => heading.textContent.trim() === title)?.closest('.health-card');
    const growth = dashboardCard('Growth Monitoring Summary');
    const infants = dashboardCard('Infants by age');
    const summaryRow = infants.parentElement;
    assert(growth?.parentElement === summaryRow && growth.nextElementSibling === infants &&
      summaryRow.previousElementSibling.matches('.dashboard-stats') &&
      summaryRow.nextElementSibling.matches('.dashboard-overview'), 'Growth and age summaries must follow the totals together');
    const growthBounds = growth.getBoundingClientRect();
    const ageBounds = infants.getBoundingClientRect();
    assert(Math.abs(growthBounds.width - ageBounds.width) <= 1, 'Dashboard summary columns have different widths');
    if (matchMedia('(min-width: 1024px)').matches) {
      assert(Math.abs(growthBounds.top - ageBounds.top) <= 1 && growthBounds.right < ageBounds.left,
        'Growth must be to the left of infants on desktop');
    } else {
      assert(growthBounds.bottom < ageBounds.top, 'Summary cards should stack on narrow screens');
    }
    const growthTileButtons = () => dashboardCard('Growth Monitoring Summary')?.querySelectorAll(':scope > .grid > button');
    // Wait for both the lazy widget and its measurements request.
    for (let i = 0; i < 35 && growthTileButtons()?.length !== 4; i++) await tick();
    const viewGrowth = dashboardCard('Growth Monitoring Summary')?.querySelector('button');
    assert(viewGrowth, 'Growth summary did not finish loading');
    if (matchMedia('(min-width: 1024px)').matches) {
      const growthTiles = growthTileButtons();
      const ageTiles = infants.querySelectorAll('li a');
      assert(growthTiles?.length === 4 && ageTiles.length === 4, 'Dashboard summary tiles missing');
      assert([0, 2].every(index => Math.abs(growthTiles[index].getBoundingClientRect().top -
        ageTiles[index].getBoundingClientRect().top) <= 1), 'Growth and age tiles must line up');
      assert(summaryRow.getBoundingClientRect().height <= 160, 'Dashboard summary row is too tall');
    }
    viewGrowth.click(); await tick();
    const growthDialog = document.querySelector('[role=dialog][aria-label="All growth monitoring records"]');
    assert(growthDialog?.querySelector('a[href="/children/preview?tab=growth"]'), 'Growth summary no longer links to child growth');
    growthDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    calendarDay.click(); await tick();
    const preview = document.querySelector('#dashboard-date-preview');
    assert(preview?.textContent.includes('Fictional Infant'), 'Calendar did not preview the fictional appointment');
    const bounds = preview.getBoundingClientRect();
    assert(bounds.left >= 0 && bounds.right <= window.innerWidth + 1 && bounds.top >= 0, 'Calendar preview extends outside viewport');
    calendarDay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    assert(!document.querySelector('#dashboard-date-preview'), 'Escape did not close calendar preview');
    const bell = document.querySelector('button[aria-label^="Notifications"]');
    if (bell?.getClientRects().length) {
      bell.click(); await tick();
      const panel = document.querySelector('#header-follow-up');
      assert(panel?.textContent.includes('Fictional Infant') && panel.getBoundingClientRect().right <= window.innerWidth + 1, 'Notification panel missing or clipped');
      bell.click(); await tick();
    }
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'Dashboard horizontal overflow in ' + theme);
    const link = [...document.querySelectorAll('a[href="/children/preview"]')].find(a => a.getClientRects().length);
    if (link) { link.click(); await tick(); }
    else flushSync(() => root.render(el(StoreContext.Provider, {
      value: { connected: true, children: [child], appointments: [appointment], records: [], smsLog: [], demoUser: { name: 'Fictional staff', role } },
    }, el(MemoryRouter, { initialEntries: ['/children/preview'] }, el(Routes, {}, el(Route, { element: el(Layout) },
      el(Route, { path: 'children/:id', element: el(ChildProfile) })))))));
    await tick();
    assert(document.querySelector('main h1')?.textContent.includes('Fictional Infant'), 'Child profile unavailable');
    assert(Boolean(document.querySelector('main details')) === (role === 'midwife'), 'Child profile role actions incorrect');
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'Child profile horizontal overflow in ' + theme);
  }
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
      uniqueChildren: mode === 'empty' ? 0 : 12,
      statuses: available ? { pending: 11 + Number(status === 'pending'), verified: Number(status === 'verified'),
        escalated: Number(status === 'escalated'), resolved: Number(status === 'resolved') } : null,
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
  const findNav = () => [...document.querySelectorAll('nav a')].find(a => a.textContent.trim() === 'AI Record Review' && a.getClientRects().length);
  const main = () => document.querySelector('main');
  const headings = () => [...main().querySelectorAll('ul[aria-label="Review findings"] strong')].map(n => n.textContent);
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
  assert(parseFloat(getComputedStyle(main()).paddingTop) <= 12, 'Record Review content starts too far below the header');
  assert(main().textContent.includes('Loading review findings'), 'Loading state missing');
  await settle();
  assert(main().querySelector('[role=alert]')?.textContent.includes('could not be loaded'), 'Timeout error state missing');
  mode = 'empty'; button('Try again').click(); await settle();
  assert(main().textContent.includes('No findings to review'), 'Empty state missing');
  mode = 'unavailable'; window.dispatchEvent(new Event('focus')); await settle();
  assert(main().textContent.includes('Review tracking is unavailable') && main().textContent.includes('Reference guidance'), 'Unavailable tracking or fallback absent');
  assert(main().querySelector('dd')?.textContent === '12', 'Daily findings count incorrect');
  assert(headings().length === 8 && headings()[0] === 'Child 11 Fixture', 'Priority order or first page incorrect');
  button('Next').click(); await settle();
  assert(headings().length === 4, 'Next page incorrect');
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
  const pendingKpi = main().querySelector('#daily-review-summary .kpi-card');
  pendingKpi.click(); await settle();
  assert(pendingKpi.getAttribute('aria-pressed') === 'true' && headings().length === 1, 'Review KPI did not filter pending findings');
  pendingKpi.click(); await settle();
  const trigger = main().querySelector('button[aria-haspopup=dialog]');
  trigger.focus(); trigger.click(); await settle();
  const detail = () => document.querySelector('[role=dialog]');
  assert(detail()?.getAttribute('aria-label')?.includes('Child 11 Fixture'), 'Finding dialog did not open');
  const remarks = detail().querySelector('textarea');
  change(remarks, draft); await tick();
  assert(writes === 0 && button('Save review').disabled, 'Copying draft saved automatically');
  const select = detail().querySelector('form select');
  change(select, 'verified'); await tick(); button('Save review').click(); await settle();
  assert(writes === 1 && detail().textContent.includes('Verified'), 'BHW verification UI failed');
  change(detail().querySelector('form select'), 'escalated'); await tick(); button('Save review').click(); await settle();
  assert(writes === 2 && !detail().querySelector('form select'), 'BHW retention or escalation controls failed');
  role = 'midwife'; mount(); await settle();
  change(detail().querySelector('form select'), 'resolved'); await tick(); button('Save review').click(); await settle();
  assert(writes === 3 && detail().textContent.includes('Resolved'), 'Midwife resolution UI failed');
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'Horizontal page overflow');
  detail().querySelector('[aria-label="Close dialog"]').click(); await settle();
  assert(!detail() && document.activeElement === trigger, 'Closing review did not restore card focus');
  trigger.click(); await settle();
  const child = detail().querySelector('a[href*="/children/"]');
  child.focus(); assert(document.activeElement === child, 'Child link is not focusable');
  child.click(); await settle();
  assert(main().textContent.includes('/children/fictional-11?tab=history'), 'Child history link incorrect');
  document.querySelector('output').dataset.viewport = String(window.innerWidth);
}
checkPanel().catch(error => { document.querySelector('output').textContent = String(error); });

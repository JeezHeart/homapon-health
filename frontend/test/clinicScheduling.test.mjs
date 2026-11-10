import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const scheduling = await server.ssrLoadModule('/src/utils/clinicScheduling.ts');
const { default: AppointmentDialog } = await server.ssrLoadModule('/src/components/AppointmentDialog.tsx');
const { default: DashboardPage } = await server.ssrLoadModule('/src/pages/DashboardPage.tsx');
const { default: SchedulePage } = await server.ssrLoadModule('/src/pages/SchedulePage.tsx');
const { StoreContext } = await server.ssrLoadModule('/src/state/store-context.ts');
const child = { id: 'fictional-child', firstName: 'Fictional', lastName: 'Child', birthDate: '2026-01-01', sex: 'Female', guardian: 'Fictional Guardian', guardianMobile: '09000000000', purok: 'Purok 1' };

function renderAppointment(initial) {
  return renderToStaticMarkup(createElement(AppointmentDialog, {
    childList: [child], records: [], initial, onSave() {}, onClose() {},
  }));
}

function renderDashboard(appointments) {
  return renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(StoreContext.Provider, {
      value: { children: [child], records: [], appointments, smsLog: [] },
    }, createElement(DashboardPage))));
}

test('regular appointments default to Wednesday, including today and calendar boundaries', () => {
  for (const [day, expected] of [
    ['2026-10-28', '2026-10-28'], ['2026-10-29', '2026-11-04'],
    ['2026-10-30', '2026-11-04'], ['2026-12-31', '2027-01-06'],
    ['2028-02-29', '2028-03-01'],
  ]) assert.equal(scheduling.nextRegularClinicDate(day), expected);
  assert.equal(scheduling.isRegularClinicDay('2026-11-04'), true);
  assert.equal(scheduling.isRegularClinicDay('2026-11-05'), false);
});

test('next session groups the earliest pending date and counts children separately from appointments', () => {
  const session = scheduling.nextClinicSession([
    { childId: 'later', scheduledDate: '2026-11-11', status: 'upcoming' },
    { childId: 'done', scheduledDate: '2026-10-28', status: 'completed' },
    { childId: 'missed', scheduledDate: '2026-10-29', status: 'overdue' },
    { childId: 'a', scheduledDate: '2026-11-05', status: 'due-today' },
    { childId: 'a', scheduledDate: '2026-11-05', status: 'upcoming' },
    { childId: 'b', scheduledDate: '2026-11-05', status: 'upcoming' },
  ]);
  assert.deepEqual(session, { date: '2026-11-05', appointmentCount: 3, childCount: 2 });
});

test('no pending bookings means no confirmed session', () => {
  assert.equal(scheduling.nextClinicSession([]), null);
  assert.equal(scheduling.nextClinicSession([
    { childId: 'a', scheduledDate: '2026-11-04', status: 'completed' },
  ]), null);
});

test('new booking renders the next Wednesday without an exception field', () => {
  const html = renderAppointment();
  assert.match(html, new RegExp(`id="ap-date"[^>]*value="${scheduling.nextRegularClinicDate()}"`));
  assert.doesNotMatch(html, /id="ap-exception-reason"/);
});

test('existing Thursday booking retains its date and exposes its saved exception reason', () => {
  const html = renderAppointment({ id: 'booking', childId: child.id, vaccineId: 'bcg', doseNumber: 1,
    scheduledDate: '2099-01-08', scheduleExceptionReason: 'Wednesday holiday',
  });
  assert.match(html, /id="ap-date"[^>]*value="2099-01-08"/);
  assert.match(html, /id="ap-exception-reason"[^>]*required=""[^>]*value="Wednesday holiday"/);
});

test('dashboard session links to its booked date and empty state avoids confirming a session', () => {
  const html = renderDashboard([{ id: 'booking', childId: child.id, vaccineId: 'bcg', doseNumber: 1, scheduledDate: '2099-01-08' }]);
  assert.match(html, /href="\/schedule\?date=2099-01-08"/);
  assert.match(html, /View session/);
  const empty = renderDashboard([]);
  assert.match(empty, /No upcoming appointments booked/);
  assert.match(empty, /Confirm any holiday changes/);
  assert.doesNotMatch(empty, /View session/);
});

test('session date links select the correct calendar month and day; invalid dates are ignored', () => {
  function renderSchedule(date) {
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/schedule?date=${date}`] },
      createElement(StoreContext.Provider, {
        value: { children: [child], records: [], appointments: [] },
      }, createElement(SchedulePage))));
  }
  const html = renderSchedule('2099-01-08');
  assert.match(html, /January 2099/);
  assert.match(html, /Jan 8, 2099/);
  assert.doesNotMatch(html, /No day selected/);
  assert.match(renderSchedule('2099-02-31'), /No day selected/);
  assert.match(renderSchedule('not-a-date'), /No day selected/);
});

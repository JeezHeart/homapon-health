import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const backend = require('../../backend/src/lib/sms.js');
const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
const frontend = await server.ssrLoadModule('/src/utils/sms.ts');
test.after(() => server.close());

test('frontend and backend compose identical populated reminders', () => {
  assert.equal(frontend.SMS_TEMPLATE, backend.SMS_TEMPLATE);
  for (const time of [undefined, '00:00', '09:05', '12:00', '23:59:00']) {
    const args = ['Maria Pe\u00f1a', 'Ana Ni\u00f1o', '2026-11-18', time, '2026-11-11'];
    const message = frontend.renderSmsMessage(...args);
    assert.equal(message, backend.composeMessage(...args));
    assert.match(message, /^Good day Maria Pena! Brgy Homapon HC: Ana Nino has a vaccination on Nov 18, 2026/);
    assert.ok(message.endsWith('Bring the Brgy. Booklet. Thank you. (Ref: Nov 11, 2026)'));
    assert.equal(frontend.smsMessageError(message), backend.smsMessageError(message));
  }
});

test('normalization handles names, quotes, whitespace, and unsupported characters', () => {
  const input = '  Pe\u00f1a \u00d1 \u201cAna\u201d O\u2019Neil \u2014 caf\u00e9 \u{1f600} `  ';
  const expected = 'Pena N "Ana" O\'Neil - cafe ? ?';
  assert.equal(frontend.normalizeSmsText(input), expected);
  assert.equal(backend.normalizeSmsText(input), expected);
});

test('one-segment boundary counts GSM extension units and rejects Unicode', () => {
  for (const helper of [frontend, backend]) {
    assert.equal(helper.smsMessageError('a'.repeat(160)), '');
    assert.match(helper.smsMessageError('a'.repeat(161)), /one-SMS/);
    assert.equal(helper.smsMessageError('a'.repeat(158) + '^'), '');
    assert.match(helper.smsMessageError('a'.repeat(159) + '^'), /one-SMS/);
    assert.equal(helper.smsUnits('^{}\\[~]|\u20ac'), 18);
    assert.match(helper.smsMessageError('\u{1f600}'), /unsupported/);
    assert.ok(helper.smsMessageError(''));
  }
});

test('full names remain intact and long reminders are blocked', () => {
  for (const time of [undefined, '09:00']) {
    const args = ['Maria '.repeat(15).trim(), 'Ana Santos', '2026-11-18', time, '2026-11-11'];
    const message = frontend.renderSmsMessage(...args);
    assert.ok(message.includes(args[0]));
    assert.match(frontend.smsMessageError(message), /one-SMS/);
    assert.equal(message, backend.composeMessage(...args));
  }
  const valid = frontend.renderSmsMessage('Maria', 'Ana', '2026-11-18', undefined, '2026-11-11');
  const invalid = frontend.renderSmsMessage('Maria'.repeat(40), 'Ana', '2026-11-18', undefined, '2026-11-11');
  assert.deepEqual([valid, invalid].map((m) => Boolean(frontend.smsMessageError(m))), [false, true]);
});

test('missing names and invalid dates/time are blocked', () => {
  for (const args of [
    ['', 'Ana', '2026-11-18', undefined, '2026-11-11'],
    ['Maria', '', '2026-11-18', undefined, '2026-11-11'],
    ['Maria', 'Ana', '2026-02-30', undefined, '2026-11-11'],
    ['Maria', 'Ana', '2026-11-18', '25:00', '2026-11-11'],
    ['Maria', 'Ana', '2026-11-18', undefined, 'invalid'],
  ]) {
    assert.ok(frontend.smsMessageError(frontend.renderSmsMessage(...args)));
    assert.equal(frontend.renderSmsMessage(...args), backend.composeMessage(...args));
  }
});

test('clinic transaction date rolls over at Manila midnight', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T15:59:59Z') });
  assert.equal(frontend.smsTodayISO(), '2026-11-11');
  t.mock.timers.tick(1000);
  assert.equal(frontend.smsTodayISO(), '2026-11-12');
});

test('single and batch dialogs render guardian, transaction date, preview, and blocked confirmation', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { StoreContext } = await server.ssrLoadModule('/src/state/store-context.ts');
  const { default: Single } = await server.ssrLoadModule('/src/components/SmsDialog.tsx');
  const { default: Batch } = await server.ssrLoadModule('/src/components/BatchSmsDialog.tsx');
  const child = { id: 'fictional-child', firstName: 'Ana', lastName: 'Santos', guardian: 'Maria', guardianMobile: '09000000000', purok: 'Purok 1' };
  const appointment = { id: 'fictional-appointment', child, childId: child.id, vaccineId: 'penta', doseNumber: 1, scheduledDate: '2026-11-18' };
  const render = (Component, props) => renderToStaticMarkup(createElement(StoreContext.Provider,
    { value: { logSms: () => { throw new Error('No sends during rendering'); }, refreshSms: async () => {} } },
    createElement(Component, { ...props, onClose: () => {} })));
  const valid = render(Single, { appointment });
  assert.match(valid, /Parent\/Guardian/);
  assert.match(valid, /Transaction Date/);
  assert.match(valid, /Good day Maria!/);
  assert.doesNotMatch(valid, /<button[^>]*disabled=""[^>]*>Confirm &amp; send/);
  const long = { ...appointment, id: 'long', child: { ...child, guardian: 'Maria '.repeat(40) } };
  const blocked = render(Single, { appointment: long });
  assert.match(blocked, /one-SMS limit/);
  assert.match(blocked, /<button[^>]*disabled=""[^>]*>Confirm &amp; send/);
  const batch = render(Batch, { appointments: [appointment, long] });
  assert.match(batch, /Deselect the affected reminders/);
  assert.match(batch, /<button[^>]*disabled=""[^>]*>Send to 2 Guardians/);
  const validBatch = render(Batch, { appointments: [appointment] });
  assert.doesNotMatch(validBatch, /<button[^>]*disabled=""[^>]*>Send to 1 Guardian/);
});

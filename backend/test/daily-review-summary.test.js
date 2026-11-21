const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDailySummary } = require('../src/lib/dailyReviewSummary');
const { createSelectionService } = require('../src/lib/reviewGuidance');

const today = '2026-11-21';
const finding = (childId, issueType = 'missing_date', reviewStatus = 'pending') => ({
  childId, issueType, reviewStatus,
  name: 'Fictional Private Name', recordIds: ['private-record'],
  dateAdministered: '2024-07-08', vaccineId: 'penta', weightKg: 12,
  remarks: 'Private internal remarks',
});

test('keeps exact totals internal and sends only approved categories with enough distinct children', async () => {
  const fetcher = test.mock.fn(async () => Response.json({
    choices: [{ finish_reason: 'stop', message: { content: '{"explanation":1,"order":[1,0,2]}' } }],
  }));
  const select = createSelectionService({ apiKey: () => 'mock-key', fetcher });
  const result = await buildDailySummary([
    ...Array.from({ length: 5 }, (_, index) => finding(`private-child-${index}`)),
    ...Array.from({ length: 6 }, () => finding('private-child-0', 'potential_duplicate', 'verified')),
    finding('private-child-0', 'reversed_dates', 'escalated'),
    finding('private-child-1', 'below_minimum_interval', 'resolved'),
  ], true, today, select);
  assert.equal(result.findings, 13);
  assert.equal(result.uniqueChildren, 5);
  assert.deepEqual(result.statuses, { pending: 5, verified: 6, escalated: 1, resolved: 1 });
  assert.equal(result.guidance.source, 'ai_assisted');
  assert.match(result.guidance.checklist[0], /vaccine, dose number/);
  assert.equal(fetcher.mock.callCount(), 1);
  const [, request] = fetcher.mock.calls[0].arguments;
  const outbound = JSON.parse(request.body);
  const payload = JSON.parse(outbound.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['categories', 'excerpt']);
  assert.deepEqual(payload.categories, ['date_documentation']);
  assert.doesNotMatch(request.body, /private|2026-11-21|2024-07-08|penta|\b(?:escalated|resolved)\b|potential_duplicate/i);
});

test('suppresses small groups, skips empty requests and distinguishes unavailable tracking', async () => {
  const select = test.mock.fn(async () => null);
  const small = await buildDailySummary(Array.from({ length: 9 }, () => finding('one-child')), false, today, select);
  assert.equal(small.uniqueChildren, 1);
  assert.equal(small.statuses, null);
  assert.equal(small.guidance.source, 'reference');
  const empty = await buildDailySummary([], true, today, select);
  assert.deepEqual(empty.statuses, { pending: 0, verified: 0, escalated: 0, resolved: 0 });
  assert.deepEqual(empty.guidance.checklist, []);
  assert.equal(select.mock.callCount(), 0);
});

test('rejects model-supplied statistics and falls back on invalid output, quota or missing credentials', async () => {
  const findings = Array.from({ length: 5 }, (_, index) => finding(`fictional-${index}`));
  const options = [
    { apiKey: () => 'mock-key', fetcher: async () => Response.json({ choices: [{
      finish_reason: 'stop', message: { content: '{"explanation":0,"order":[0,1,2],"statistics":"999 fake findings"}' },
    }] }) },
    { apiKey: () => 'mock-key', fetcher: async () => new Response(null, { status: 429 }) },
    { apiKey: () => '', fetcher: async () => { assert.fail('Missing key must prevent calls'); } },
  ];
  for (const config of options) {
    const result = await buildDailySummary(findings, false, today, createSelectionService(config));
    assert.equal(result.guidance.source, 'reference');
    assert.equal(result.findings, 5);
    assert.doesNotMatch(JSON.stringify(result), /999 fake/);
  }
});

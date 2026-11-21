const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuidanceService, createSelectionService, createPreparationService } = require('../src/lib/reviewGuidance');

const answer = (content) => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
});
const accepted = { explanation: 1, order: [1, 0, 2] };
const apiKey = () => 'test-only';

test('preparation selects only approved worksheets and rejects added advice', async () => {
  const fetcher = test.mock.fn(async (_, request) => {
    const { messages } = JSON.parse(request.body);
    const payload = JSON.parse(messages[1].content);
    assert.deepEqual(Object.keys(payload).sort(), ['excerpts', 'issue']);
    assert.equal(payload.issue, 'reversed_dates');
    assert.equal(payload.excerpts.length, 1);
    return answer({ explanation: 1, order: [1, 0, 2] });
  });
  const live = await createPreparationService(createSelectionService({ apiKey, fetcher }))('reversed_dates');
  assert.equal(fetcher.mock.callCount(), 1);
  assert.equal(live.source, 'ai_assisted');
  assert.equal(live.worksheet.title, 'Dose entry check');
  assert.ok(live.questions.every(question => question.en && question.fil && question.url));
  const invalid = createSelectionService({ apiKey, fetcher: async () => answer({
    ...accepted, advice: 'Administer a dose',
  }) });
  const fallback = await createPreparationService(invalid)('reversed_dates');
  assert.equal(fallback.source, 'reference');
  assert.equal(fallback.worksheet.title, 'Source comparison');
  assert.deepEqual(fallback.checklist, live.checklist);
  assert.deepEqual(fallback.references, live.references);
});

test('coalesces same-issue requests and caches only approved wording and citations', async () => {
  const fetcher = test.mock.fn(async () => answer(accepted));
  const guidance = createGuidanceService({ apiKey, fetcher });
  const [first, second] = await Promise.all([guidance('below_minimum_interval'), guidance('below_minimum_interval')]);
  assert.deepEqual(second, first);
  assert.deepEqual(await guidance('below_minimum_interval'), first);
  assert.equal(fetcher.mock.callCount(), 1);
  assert.equal(first.source, 'ai_assisted');
  assert.match(first.checklist[0], /primary-series interval/);
  assert.match(first.references[0].url, /^https:\/\/hta\.dost\.gov\.ph\//);
});

test('discards invented references, invalid selections and oversized provider responses', async () => {
  for (const fetcher of [
    async () => answer({ ...accepted, citation: 'https://example.invalid' }),
    async () => answer({ ...accepted, order: [0, 0, 2] }),
    async () => new Response('x'.repeat(16_385)),
  ]) {
    const guidance = await createGuidanceService({ apiKey, fetcher })('potential_duplicate');
    assert.equal(guidance.source, 'reference');
    assert.match(guidance.explanation, /may document/);
    assert.doesNotMatch(JSON.stringify(guidance), /example\.invalid/);
  }
});

test('uses reference fallback after quota failure without immediately calling Groq again', async () => {
  const fetcher = test.mock.fn(async () => new Response(null, { status: 429 }));
  const guidance = createGuidanceService({ apiKey, fetcher });
  assert.equal((await guidance('future_date')).source, 'reference');
  assert.equal((await guidance('reversed_dates')).source, 'reference');
  assert.equal(fetcher.mock.callCount(), 1);
});

test('bounds a stalled provider request and limits requests per minute', async () => {
  const stalled = createGuidanceService({ apiKey, timeout: 5, fetcher: async (_, { signal }) => {
    await new Promise((resolve) => {
      const keepAlive = setTimeout(resolve, 1000);
      signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        resolve();
      }, { once: true });
    });
    assert.equal(signal.aborted, true);
    throw signal.reason;
  } });
  assert.equal((await stalled('future_date')).source, 'reference');

  const fetcher = test.mock.fn(async () => answer(accepted));
  const guidance = createGuidanceService({ apiKey, fetcher });
  for (const issue of ['missing_date', 'invalid_date', 'ambiguous_date', 'future_date', 'reversed_dates', 'same_day_doses']) {
    assert.equal((await guidance(issue)).source, 'ai_assisted');
  }
  assert.equal((await guidance('potential_duplicate')).source, 'reference');
  assert.equal(fetcher.mock.callCount(), 6);
});

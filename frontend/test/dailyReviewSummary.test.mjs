import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ envDir: false, server: { middlewareMode: true, watch: null, hmr: false } });
test.after(() => server.close());
const { default: Summary } = await server.ssrLoadModule('/src/components/DailyReviewSummaryCard.tsx');
const data = {
  date: '2026-11-21', findings: 4, uniqueChildren: 2,
  guidance: { source: 'reference', explanation: 'Check source documentation.', checklist: ['Check clinic register.'], references: [] },
};

test('labels exact findings and children separately and omits unavailable status figures', () => {
  const html = renderToStaticMarkup(createElement(Summary, { summary: { ...data, statuses: null } }));
  assert.match(html, /Active findings<\/dt><dd[^>]*>4<\/dd>/);
  assert.match(html, /Affected children<\/dt><dd[^>]*>2<\/dd>/);
  assert.match(html, /Saved review statuses are unavailable/);
  assert.doesNotMatch(html, /Pending findings/);
});

test('renders supplied status counts and distinguishes model-assisted from reference guidance', () => {
  const summary = { ...data, statuses: { pending: 0, verified: 1, escalated: 2, resolved: 1 } };
  const html = renderToStaticMarkup(createElement(Summary, { summary }));
  assert.match(html, /Pending findings<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(html, /Reference guidance/);
  const assisted = { ...summary, guidance: { ...summary.guidance, source: 'ai_assisted' } };
  assert.match(renderToStaticMarkup(createElement(Summary, { summary: assisted })), /AI-assisted documentation checklist/);
});

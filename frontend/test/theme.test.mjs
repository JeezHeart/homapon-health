import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const bootstrap = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
function resolveTheme({ saved = null, dark = false, blocked = false, mediaAvailable = true } = {}) {
  const document = { documentElement: { dataset: {} } };
  runInNewContext(bootstrap, {
    document,
    window: mediaAvailable ? { matchMedia: () => ({ matches: dark }) } : {},
    localStorage: { getItem() { if (blocked) throw new Error('Storage unavailable'); return saved; } },
  });
  return document.documentElement.dataset.theme;
}

test('first-visit appearance defaults to light mode before React loads', () => {
  assert.equal(resolveTheme({ dark: true }), 'light');
  assert.equal(resolveTheme({ dark: false }), 'light');
});

test('saved light and dark preferences override the default', () => {
  assert.equal(resolveTheme({ saved: 'light', dark: true }), 'light');
  assert.equal(resolveTheme({ saved: 'dark', dark: false }), 'dark');
});

test('unavailable storage and invalid preferences safely use light mode', () => {
  assert.equal(resolveTheme({ blocked: true, dark: true }), 'light');
  assert.equal(resolveTheme({ saved: 'invalid', dark: true }), 'light');
  assert.equal(resolveTheme({ mediaAvailable: false }), 'light');
});

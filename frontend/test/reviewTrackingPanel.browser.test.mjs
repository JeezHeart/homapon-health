import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

// Point this at a Chromium-family executable to exercise a mounted React panel.
test('fictional Record Review workflow in desktop and narrow Edge windows', {
  skip: !process.env.REVIEW_TEST_BROWSER && 'Set REVIEW_TEST_BROWSER to a Chromium executable',
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'review-panel-'));
  t.after(() => rm(profile, { recursive: true, force: true, maxRetries: 5 }));
  const entry = fileURLToPath(new URL('./review-panel.fixture.mjs', import.meta.url));
  const outDir = join(profile, 'fixture');
  await build({ envDir: false, logLevel: 'warn', define: { 'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_API_URL': '"https://fixture.invalid"' },
    build: { outDir, lib: { entry, formats: ['iife'], name: 'ReviewTest', cssFileName: 'ReviewTest', fileName: () => 'fixture.js' } } });
  const page = join(outDir, 'index.html');
  await writeFile(page, '<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="ReviewTest.css"><div id="root"></div><output id="result"></output><script src="fixture.js"></script>');
  for (const width of [1280, 500]) {
    const { stdout } = await promisify(execFile)(process.env.REVIEW_TEST_BROWSER, [
    '--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    '--user-data-dir=' + join(profile, 'browser-' + width), '--window-size=' + width + ',900',
    '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(page).href,
  ], { timeout: 45000 });
    assert.match(stdout.match(/<output[^>]*>.*?<\/output>/)?.[0] ?? '', /PASS/, `Viewport ${width}`);
  }
});

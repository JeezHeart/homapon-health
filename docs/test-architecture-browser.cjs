// Usage: node docs/test-architecture-browser.cjs <playwright-module> <browser-executable>
// Uses a temporary browser profile; no operational app or patient records are opened.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright');
const { diagrams } = require('../scripts/architecture-diagrams.cjs');
(async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'homapon-diagram-qa-'));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
    await page.goto(pathToFileURL(path.resolve('docs/architecture-viewer.html')).href);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('section').count(), 9);
    const fonts = await page.locator('svg text').evaluateAll(nodes => [...new Set(nodes.map(n => getComputedStyle(n).fontFamily))]);
    assert.deepEqual(fonts, ['"Courier New"']);
    assert(await page.evaluate(() => document.fonts.check('16px "Courier New"')));
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    for (const d of diagrams) {
      for (const format of ['drawio', 'svg', 'png']) {
        const pending = page.waitForEvent('download');
        await page.locator(`[data-export="${d.id}"][data-format="${format}"]`).click();
        const download = await pending;
        assert.equal(download.suggestedFilename(), `${d.id}.${format}`);
        const dest = path.join(output, `${d.id}.${format}`);
        await download.saveAs(dest);
        const data = fs.readFileSync(dest);
        if (format === 'drawio') assert.equal(data.toString(), fs.readFileSync(`docs/diagrams/${d.id}.drawio`, 'utf8'));
        if (format === 'png') {
          assert.equal(data.readUInt32BE(16), d.width * 3);
          assert.equal(data.readUInt32BE(20), d.height * 3);
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pathToFileURL(path.resolve('docs/architecture-viewer.html')).href);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'The mobile page must not overflow; diagrams have local scrolling.');
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: path.join(output, 'report.pdf'), preferCSSPageSize: true, printBackground: true });
    const clipping = [], overlaps = [];
    await page.emulateMedia({ media: 'screen' });
    for (const d of diagrams) {
      await page.setViewportSize({ width: d.width, height: d.height });
      await page.goto(pathToFileURL(path.resolve(`docs/diagrams/${d.id}.svg`)).href);
      await page.screenshot({ path: path.join(output, `${d.id}-preview.png`) });
      const issues = await page.evaluate(() => {
        const clip = [], overlap = [];
        const nodes = [...document.querySelectorAll('g[data-node]')].filter(n => !['figure-title', 'figure-status', 'boundary'].includes(n.dataset.node));
        for (const n of nodes) {
          const shape = n.querySelector('rect,polygon,ellipse,path').getBBox();
          for (const t of n.querySelectorAll('text')) {
            const r = t.getBBox();
            if (r.x < shape.x + 3 || r.x + r.width > shape.x + shape.width - 3 || r.y < shape.y || r.y + r.height > shape.y + shape.height) clip.push(n.dataset.node + ': ' + t.textContent);
          }
        }
        for (const t of document.querySelectorAll('g[data-edge] text')) {
          const a = t.getBBox();
          for (const n of nodes) {
            const b = n.querySelector('rect,polygon,ellipse,path').getBBox();
            if (a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y) overlap.push(t.textContent + ' / ' + n.dataset.node);
          }
        }
        return { clip, overlap };
      });
      clipping.push(...issues.clip.map(s => d.id + ': ' + s));
      overlaps.push(...issues.overlap.map(s => d.id + ': ' + s));
    }
    const report = { output, browser: browser.version(), fonts, exports: 24, errors, networkRequests: requests, clipping, overlaps };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    assert.deepEqual(clipping, []);
    assert.deepEqual(overlaps, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

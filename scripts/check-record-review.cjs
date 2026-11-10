const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:5189/') ? r.continue() : r.abort());
    await page.goto('http://127.0.0.1:5189');
    await page.locator('#login-name').fill('Fictional Review Tester');
    await page.locator('button[type=submit]').click();
    await page.getByRole('link', { name: 'Record Review', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Record Review', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Try fictional practice dates' }).click();
    await page.getByRole('button', { name: 'Run experimental review' }).click();
    await page.getByRole('status').filter({ hasText: /Review suggested|No unusual pattern flagged/ }).waitFor();
    const output = await page.getByRole('status').last().innerText();
    await page.getByRole('button', { name: 'Try same-day fictional dates' }).click();
    await page.getByRole('button', { name: 'Run experimental review' }).click();
    await page.getByText('Review suggested', { exact: true }).waitFor();
    const screenshot = path.join(os.tmpdir(), 'homapon-record-review.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    const firstChild = await page.locator('#review-child option').nth(1).getAttribute('value');
    await page.locator('#review-child').selectOption(firstChild);
    await page.getByText('Not enough information for ML review.', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Run experimental review' }).isDisabled());
    assert.equal(await page.getByText('Review suggested', { exact: true }).count(), 0);
    assert.equal(await page.getByText('No unusual pattern flagged', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: ['BHW navigation', 'both fictional ML outcomes', 'missing-data block', 'old result clears after selection change', 'mobile containment', 'no browser page errors'], output, screenshot }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mountFrontend } = require('../src/lib/frontend');

test('one web service serves SPA routes and assets while preserving API failures', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'homapon-hosting-'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<html>Fictional frontend</html>');
  fs.writeFileSync(path.join(directory, 'app.js'), '/* fictional asset */');
  const app = express();
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  mountFrontend(app, directory);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/', '/children/fictional?tab=growth', '/schedule']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Fictional frontend/);
  }
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal((await fetch(base + '/missing.js')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const missing = await fetch(base + '/api/missing');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).ok, false);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('production fails clearly if the frontend build is absent', () => {
  assert.throws(() => mountFrontend(express(), path.join(os.tmpdir(), 'homapon-nonexistent-build')), /Frontend build missing/);
});

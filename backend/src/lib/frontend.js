/*
 * FILE GUIDE: Production Static Frontend Mounting (backend/src/lib/frontend.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Nagse-serve ng compiled React single-page app (frontend/dist) mula mismo sa
 *   Express server kapag NODE_ENV === 'production', habang pinapanatiling JSON 404
 *   ang mga maling /api path at naka-block ang hidden dotfiles.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - Startup crash na "Frontend build missing" kapag nakalimutang i-build yung frontend
 *   - Client-side React Router page na nag-404 kapag ni-refresh (hawak ng '*' fallback dito)
 *   - Missing .js/.css files na aksidenteng bumabalik ng HTML imbes na 404
 */
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

// Ikakabit yung static file hosting at SPA fallback routing sa Express app.
// Input: app (Express instance), directory (optional path papuntang frontend/dist).
// Output: Minu-mutate yung app routes; nag-t-throw agad kapag wala pang index.html build.
// Debugging tip: sinisiguro nito na hindi makakatanggap ng index.html ang maling /api/* calls
// at hindi magka-cache ng lumang index.html yung browser pagkatapos mag-deploy.
function mountFrontend(app, directory = path.resolve(__dirname, '../../../frontend/dist')) {
  const index = path.join(directory, 'index.html');
  // Startup guard: fail fast kapag nag-production start nang wala pang compiled frontend.
  if (!fs.existsSync(index)) throw new Error('Frontend build missing. Build frontend before starting production.');
  // Dapat laging JSON ang balik ng maling /api paths, hindi dapat maligaw sa React index.html.
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));
  // Hashed Vite bundles sa /assets/* ay safe i-cache nang matagal (1y immutable) dahil nagbabago ang hash bawat build.
  app.use('/assets', express.static(path.join(directory, 'assets'), { index: false, dotfiles: 'deny', maxAge: '1y', immutable: true }));
  // Sine-serve yung ibang static assets (logos, favicon, theme.js) na naka-deny yung hidden dotfiles (gaya ng .env).
  app.use(express.static(directory, { index: false, dotfiles: 'deny' }));
  // SPA fallback: ibigay yung index.html sa normal page routes, pero i-404 yung may file extension o dot segment.
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) || req.path.split('/').some((part) => part.startsWith('.'))) return next();
    res.set('Cache-Control', 'no-store');
    res.sendFile(index);
  });
}

module.exports = { mountFrontend };

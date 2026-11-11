const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

function mountFrontend(app, directory = path.resolve(__dirname, '../../../frontend/dist')) {
  const index = path.join(directory, 'index.html');
  if (!fs.existsSync(index)) throw new Error('Frontend build missing. Build frontend before starting production.');
  // API failures must stay JSON, never fall through to the React document.
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));
  app.use(express.static(directory, { index: false, dotfiles: 'deny' }));
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) || req.path.split('/').some((part) => part.startsWith('.'))) return next();
    res.set('Cache-Control', 'no-store');
    res.sendFile(index);
  });
}

module.exports = { mountFrontend };

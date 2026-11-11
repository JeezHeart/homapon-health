const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireAuth } = require('./lib/auth');

// Builds the Express app without listening, so tests can import it.
const app = express();
app.disable('x-powered-by');
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const authOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  contentSecurityPolicy: { directives: { connectSrc: ["'self'", ...(authOrigin ? [authOrigin] : [])] } },
}));
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'homapon-immunization-server', phase: 2 });
});

// Resource routes (all behind login) with server-side validation.
app.use('/api/children', requireAuth, require('./routes/children'));
app.use('/api/dose-records', requireAuth, require('./routes/doseRecords'));
app.use('/api/appointments', requireAuth, require('./routes/appointments'));
app.use('/api/sms-log', requireAuth, require('./routes/smsLog'));
app.use('/api/growth-measurements', requireAuth, require('./routes/growth'));

// Who am I? Role comes from the staff table, never from the client.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: { name: req.staff.name, role: req.staff.role },
  });
});

if (process.env.NODE_ENV === 'production') require('./lib/frontend').mountFrontend(app);

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

// Central error handler: ensures malformed JSON, oversized bodies,
// and unexpected async/DB errors return safe JSON without stack traces.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (
    err &&
    (err.type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && err.status === 400))
  ) {
    return res
      .status(400)
      .json({ ok: false, error: 'Malformed JSON in request body.' });
  }
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res
      .status(413)
      .json({ ok: false, error: 'Request payload is too large.' });
  }
  console.error('Unhandled API error:', err && err.message ? err.message : err);
  return res.status(500).json({
    ok: false,
    error: 'Server error while processing the request. Please try again.',
  });
});

module.exports = app;

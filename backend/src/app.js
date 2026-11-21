/*
 * FILE GUIDE: Express Application Setup (backend/src/app.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Dito binubuo at nise-setup yung buong Express HTTP server: security headers
 *   (Helmet), CORS rules, JSON body parsing, route mounting na may login gate,
 *   production frontend static hosting, 404 handler, at central error handler.
 *   Naka-export lang 'to nang hindi nag-a-app.listen() para ma-import agad sa tests.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - CORS error galing frontend (i-check yung CORS_ORIGINS sa .env)
 *   - Content Security Policy (CSP) na nagbo-block ng Supabase login request
 *   - Bagong API route group na kailangan lagyan ng requireAuth
 *   - Biglang 400 / 413 / 404 / 500 JSON error responses
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireAuth } = require('./lib/auth');

// Binubuo yung Express app nang hindi pa nag-li-listen, para madaling ma-import ng tests.
const app = express();
// Tinatago yung "X-Powered-By: Express" header para mas konti yung info na kita ng attackers.
app.disable('x-powered-by');
// Hini-split yung comma-separated allowed frontend URLs para sa CORS; default ay Vite dev server.
// Kapag na-block ng browser yung API call dahil sa CORS, check agad yung CORS_ORIGINS sa .env.
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Kinukuha yung Supabase origin para payagan ng Helmet CSP yung browser auth calls papuntang Supabase.
const authOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
// Security headers guard: nagse-set ng CSP at naka-off yung HSTS kapag local/dev para gumana ang HTTP.
app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  contentSecurityPolicy: { directives: { connectSrc: ["'self'", ...(authOrigin ? [authOrigin] : [])] } },
}));
// Pinapayagan lang yung naka-whitelist na frontend origins na tumawag sa API na 'to.
app.use(cors({ origin: origins }));
// Nagpa-parse ng JSON request body hanggang 256 KB max para iwas oversized payload abuse.
app.use(express.json({ limit: '256kb' }));

// Public health check endpoint (hindi kailangan ng login).
// Output: { ok: true, service, phase } para ma-check kung buhay pa yung API server.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'homapon-immunization-server', phase: 2 });
});

// Resource routes (lahat nasa likod ng login) na may server-side validation.
// Security guard: lahat ng routes dito dadaan muna sa requireAuth bago maka-touch ng DB.
app.use('/api/children', requireAuth, require('./routes/children'));
app.use('/api/dose-records', requireAuth, require('./routes/doseRecords'));
app.use('/api/appointments', requireAuth, require('./routes/appointments'));
app.use('/api/sms-log', requireAuth, require('./routes/smsLog'));
app.use('/api/growth-measurements', requireAuth, require('./routes/growth'));

// GET /api/me — "Sino ako?" endpoint para sa naka-login na staff.
// Output: { ok: true, user: { name, role } } galing mismo sa staff table sa DB, hindi galing sa client.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: { name: req.staff.name, role: req.staff.role },
  });
});

// Kapag production build na, dito sine-serve yung compiled React frontend galing frontend/dist.
if (process.env.NODE_ENV === 'production') require('./lib/frontend').mountFrontend(app);

// Catch-all 404 handler para sa mga route na hindi nage-exist.
// Laging JSON ang balik para hindi mabigyan ng HTML page yung API callers.
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

// Central error handler: sinisiguro na yung sira/malformed JSON, sobrang laking body,
// at biglaang async/DB errors ay safe JSON ang balik nang walang leaked stack trace.
// Debugging tip: kapag nag-500 yung endpoint, silipin sa server console yung "Unhandled API error:".
app.use((err, _req, res, next) => {
  // Kapag na-send na yung headers, ipasa na sa default error handler ng Express.
  if (res.headersSent) return next(err);
  // Kapag sira yung JSON syntax galing express.json(), ibalik agad na 400 Bad Request.
  if (
    err &&
    (err.type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && err.status === 400))
  ) {
    return res
      .status(400)
      .json({ ok: false, error: 'Malformed JSON in request body.' });
  }
  // Kapag lumagpas sa 256kb limit yung request payload, ibalik na 413 Payload Too Large.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res
      .status(413)
      .json({ ok: false, error: 'Request payload is too large.' });
  }
  // I-log lang yung error message sa server console at magbalik ng safe generic message sa user.
  console.error('Unhandled API error:', err && err.message ? err.message : err);
  return res.status(500).json({
    ok: false,
    error: 'Server error while processing the request. Please try again.',
  });
});

module.exports = app;

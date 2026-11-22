/*
 * GABAY SA FILE: General Per-IP API Rate Limiter (backend/src/lib/apiRateLimit.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Sliding-window rate limiter para sa pangkalahatang `/api/*` endpoints (default:
 *   240 requests bawat 60 seconds per client IP) para protektado yung server at DB
 *   sa flooding o script abuse, habang maluwag pa rin para sa maraming staff na
 *   naka-share sa iisang Wi-Fi router sa Barangay Health Center.
 *
 * Madalas na bugs o features na dapat silipin dito (pang-debug sa defense):
 *   - HTTP 429 "Too many requests" + Retry-After header kapag may nag-spam ng API
 *   - Exempted yung `/api/health` dahil naka-mount 'to pagkatapos ng health route sa app.js
 *   - Process-local memory Map lang 'to (may max bucket cap na 10,000 IPs iwas memory bloat)
 */
const DEFAULT_MAX_REQUESTS = 240;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Gumagawa ng reusable sliding-window rate limiter instance (madaling i-unit-test gamit custom clock).
function createApiRateLimiter({
  maxRequests = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS),
  windowMs = parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
  now = () => Date.now(),
} = {}) {
  const hitsByKey = new Map();

  function consume(rawKey) {
    const key = String(rawKey || 'unknown');
    const time = now();
    const cutoff = time - windowMs;

    // Linisin yung mga expired IP buckets para hindi lumobo ang memory habang tumatagal yung server.
    for (const [entryKey, timestamps] of hitsByKey) {
      if (timestamps[timestamps.length - 1] <= cutoff) {
        hitsByKey.delete(entryKey);
      }
    }

    // Hard cap sa dami ng tracked keys iwas memory exhaustion kapag may nag-flood gamit random IPs.
    if (!hitsByKey.has(key) && hitsByKey.size >= MAX_TRACKED_KEYS) {
      const oldestKey = hitsByKey.keys().next().value;
      if (oldestKey !== undefined) hitsByKey.delete(oldestKey);
    }

    const recent = (hitsByKey.get(key) || []).filter((ts) => ts > cutoff);
    if (recent.length >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - time) / 1000));
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    recent.push(time);
    hitsByKey.set(key, recent);
    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - recent.length),
      retryAfterSeconds: 0,
    };
  }

  function middleware(req, res, next) {
    const clientKey = req.ip || req.socket?.remoteAddress || 'unknown';
    const result = consume(clientKey);
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    return next();
  }

  return { consume, middleware };
}

module.exports = { createApiRateLimiter };

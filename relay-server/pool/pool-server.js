/**
 * Pool Server — HTTP Handler for Pool Endpoints.
 *
 * Routes:
 *  - POST /api/pool/contribute — accepts JSON body, validates, stores via aggregator
 *  - GET /api/pool/prices?storeId=X — returns currently-valid pooled prices for store
 *
 * All responses include CORS headers. Returns proper HTTP status codes.
 */

const { aggregatePriceReports } = require('./aggregator');

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

/**
 * Per-IP rate limiter for pool endpoints.
 * Map<ip, { count: number, windowStart: number }>
 */
const ipRateLimiters = new Map();

/** Max requests per IP per minute. */
const IP_RATE_LIMIT = 60;

/** Rate limit window in milliseconds. */
const IP_RATE_WINDOW_MS = 60_000;

/**
 * Check if an IP has exceeded the rate limit.
 * @param {string} ip
 * @returns {boolean} true if request is allowed
 */
function checkIpRateLimit(ip) {
  const now = Date.now();
  let limiter = ipRateLimiters.get(ip);

  if (!limiter || now - limiter.windowStart > IP_RATE_WINDOW_MS) {
    // Start a new window
    limiter = { count: 1, windowStart: now };
    ipRateLimiters.set(ip, limiter);
    return true;
  }

  limiter.count++;
  if (limiter.count > IP_RATE_LIMIT) {
    return false; // Rate limited
  }

  return true;
}

/**
 * Clean expired rate limit entries to prevent memory leaks.
 */
function cleanIpRateLimiters() {
  const now = Date.now();
  for (const [ip, limiter] of ipRateLimiters) {
    if (now - limiter.windowStart > IP_RATE_WINDOW_MS * 2) {
      ipRateLimiters.delete(ip);
    }
  }
}

// Clean rate limiters every 5 minutes
setInterval(cleanIpRateLimiters, 5 * 60_000);

// ─── Validation Helpers ──────────────────────────────────────────────────────

const FLYER_WEEK_REGEX = /^\d{4}-W\d{2}$/;

/**
 * Validate the contribution request body.
 * @param {object} body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateContribution(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const { storeId, itemName, price, flyerWeek, validTo } = body;

  if (!storeId || typeof storeId !== 'string') {
    return { valid: false, error: 'storeId is required and must be a string' };
  }

  if (!itemName || typeof itemName !== 'string') {
    return { valid: false, error: 'itemName is required and must be a string' };
  }

  if (typeof price !== 'number' || isNaN(price)) {
    return { valid: false, error: 'price is required and must be a number' };
  }

  if (price < 0.01 || price > 999.99) {
    return { valid: false, error: 'price must be between $0.01 and $999.99' };
  }

  if (!flyerWeek || typeof flyerWeek !== 'string' || !FLYER_WEEK_REGEX.test(flyerWeek)) {
    return { valid: false, error: 'flyerWeek is required and must match format YYYY-WXX (e.g. 2026-W22)' };
  }

  if (!validTo || typeof validTo !== 'number' || isNaN(validTo)) {
    return { valid: false, error: 'validTo is required and must be a number (epoch ms)' };
  }

  return { valid: true };
}

// ─── Request Handler ─────────────────────────────────────────────────────────

/**
 * Handle pool-related HTTP requests.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {import('./store').PoolStore} store - PoolStore instance
 */
function handlePoolRequest(req, res, store) {
  // CORS headers (same as main server)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Per-IP rate limiting (last resort before anonymous tokens)
  // Use X-Forwarded-For if behind proxy, otherwise use remote address
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (!checkIpRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  // POST /api/pool/contribute
  if (url.pathname === '/api/pool/contribute' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Enforce body size limit
      if (body.length > 4096) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large (max 4096 bytes)' }));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const validation = validateContribution(parsed);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.error }));
        return;
      }

      const { storeId, itemName, price, flyerWeek, validTo } = parsed;
      const normalizedName = itemName.toLowerCase().trim();
      const key = `${storeId}:${normalizedName}:${flyerWeek}`;

      store.addReport(key, price, validTo);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', key }));
    });
    return;
  }

  // GET /api/pool/prices?storeId=X
  if (url.pathname === '/api/pool/prices' && req.method === 'GET') {
    const storeId = url.searchParams.get('storeId');
    if (!storeId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'storeId query parameter is required' }));
      return;
    }

    const aggregates = store.getAggregates(storeId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ storeId, prices: aggregates }));
    return;
  }

  // Unknown pool endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

module.exports = { handlePoolRequest };

/**
 * Pool Server — HTTP Handler for Pool Endpoints.
 *
 * Routes:
 *  - POST /api/pool/contribute — accepts JSON body, validates, stores via aggregator
 *  - GET /api/pool/prices?storeId=X — returns currently-valid pooled prices for store
 *
 * Token-gated: when ISSUER_SECRET is set, contributions require a valid
 * blind-signed token via Authorization: Bearer header.
 * When ISSUER_SECRET is not set, the pool operates in open mode (no token required).
 *
 * All responses include CORS headers. Returns proper HTTP status codes.
 */

const { aggregatePriceReports } = require('./aggregator');
const { verifyToken } = require('../tokens/token-verifier');

// ─── Token Configuration ────────────────────────────────────────────────────

/**
 * ISSUER_SECRET from environment.
 * If not set, the pool operates in open mode (no token required for contributions).
 */
const ISSUER_SECRET = process.env.ISSUER_SECRET || null;

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

  const url = new URL(req.url, 'http://localhost');

  // POST /api/pool/contribute
  if (url.pathname === '/api/pool/contribute' && req.method === 'POST') {
    // ── Token Verification ──────────────────────────────────────────────
    // If ISSUER_SECRET is set, require a valid blind-signed token.
    // The token system provides abuse control (rate limiting moved to issuer)
    // and IP isolation (pool never reads client IP).
    if (ISSUER_SECRET) {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid Authorization header. Expected: Bearer <token>' }));
        return;
      }

      const token = authHeader.slice('Bearer '.length).trim();
      const verification = verifyToken(token, ISSUER_SECRET);

      if (!verification.valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: verification.error || 'Invalid contribution token' }));
        return;
      }
    }
    // If ISSUER_SECRET is not set, open mode: no token required (self-host/users on own LAN)
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

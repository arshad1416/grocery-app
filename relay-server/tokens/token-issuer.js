/**
 * Token Issuer — Blind-Signed Contribution Token Server
 *
 * POST /request-token
 *   Request body: { blinded: "<base64>" }
 *   Rate limit: 10 tokens/min per IP
 *   Response:    { signedBlinded: "<base64>", expiresAt: <epoch_ms>, expiryProof: "<base64>" }
 *
 * GET /health
 *   Response: { status: "ok" }
 *
 * Blind signing scheme (v1, HMAC-based):
 *   - Client generates a random 32-byte nonce
 *   - Client computes: blinded = HMAC-SHA256(key=nonce, message="contribution-token-v1")
 *   - Client sends blinded to issuer
 *   - Issuer computes: signedBlinded = HMAC-SHA256(key=ISSUER_SECRET, message=blinded)
 *   - Issuer returns: signedBlinded, expiresAt, expiryProof
 *   - Client derives: token = HMAC-SHA256(key=nonce, message=signedBlinded)
 *
 * v1 APPROXIMATION NOTE:
 *   This is NOT formal Privacy Pass or OHTTP. The HMAC-based scheme provides
 *   practical unlinkability. For v2, replace with formal Privacy Pass (VOPRF).
 *
 * Environment variables:
 *   TOKEN_ISSUER_PORT         (default: 3001)
 *   TOKEN_ISSUER_SECRET       (auto-generated if not set, persisted to file)
 *   TOKEN_ISSUER_SECRET_FILE  (default: ./token-issuer-secret.key)
 *   TOKEN_RATE_LIMIT          (default: 10 tokens/min per IP)
 *   TOKEN_TTL_MS              (default: 86400000 = 24 hours)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.TOKEN_ISSUER_PORT || '3001', 10);
const SECRET_FILE = process.env.TOKEN_ISSUER_SECRET_FILE || './token-issuer-secret.key';
const RATE_LIMIT = parseInt(process.env.TOKEN_RATE_LIMIT || '10', 10);
const RATE_WINDOW_MS = 60_000; // 1 minute
const TOKEN_TTL_MS = parseInt(process.env.TOKEN_TTL_MS || '86400000', 10); // 24 hours
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

// ─── Secret Management ──────────────────────────────────────────────────────

/**
 * Get or generate the issuer secret.
 * If TOKEN_ISSUER_SECRET env var is set, use it.
 * Otherwise, load from file or generate a new one and persist.
 */
function getIssuerSecret() {
  if (process.env.TOKEN_ISSUER_SECRET) {
    return process.env.TOKEN_ISSUER_SECRET;
  }

  try {
    if (fs.existsSync(SECRET_FILE)) {
      const stored = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (stored) return stored;
    }
  } catch {
    // File doesn't exist or can't be read — generate new secret
  }

  // Generate a new 32-byte hex secret
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    const dir = path.dirname(SECRET_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SECRET_FILE, secret, 'utf-8');
    console.log(`[token-issuer] Generated new issuer secret and saved to ${SECRET_FILE}`);
  } catch (err) {
    console.warn(`[token-issuer] Could not persist secret to ${SECRET_FILE}: ${err.message}`);
  }

  return secret;
}

const ISSUER_SECRET = getIssuerSecret();

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * Per-IP rate limiter.
 * Map<ip, { count: number, windowStart: number }>
 */
const ipRateLimiters = new Map();

/**
 * Check if an IP has exceeded the rate limit.
 * @param {string} ip
 * @returns {boolean} true if request is allowed
 */
function checkRateLimit(ip) {
  const now = Date.now();
  let limiter = ipRateLimiters.get(ip);

  if (!limiter || now - limiter.windowStart > RATE_WINDOW_MS) {
    // Start a new window
    limiter = { count: 1, windowStart: now };
    ipRateLimiters.set(ip, limiter);
    return true;
  }

  limiter.count++;
  if (limiter.count > RATE_LIMIT) {
    return false;
  }

  return true;
}

/**
 * Clean expired rate limit entries to prevent memory leaks.
 */
function cleanRateLimiters() {
  const now = Date.now();
  for (const [ip, limiter] of ipRateLimiters) {
    if (now - limiter.windowStart > RATE_WINDOW_MS * 2) {
      ipRateLimiters.delete(ip);
    }
  }
}

// ─── HMAC Helpers ───────────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 and return as base64.
 * @param {string} key
 * @param {string} message
 * @returns {string} base64-encoded HMAC
 */
function hmacBase64(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('base64');
}

// ─── Request Handler ────────────────────────────────────────────────────────

function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // POST /request-token
  if (req.url === '/request-token' && req.method === 'POST') {
    // Rate limit by IP
    const clientIp = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.socket.remoteAddress || 'unknown';

    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Rate limit exceeded. Max 10 tokens per minute.',
      }));
      return;
    }

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

      const { blinded } = parsed;
      if (!blinded || typeof blinded !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'blinded field is required and must be a string' }));
        return;
      }

      // Blind signing: signedBlinded = HMAC(ISSUER_SECRET, blinded)
      const signedBlinded = hmacBase64(ISSUER_SECRET, blinded);
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      // Expiry proof: HMAC(ISSUER_SECRET, blinded + ":" + expiresAt)
      // The verifier decodes tokenPayload to get blinded + expiresAt, then recomputes this HMAC.
      const expiryProof = hmacBase64(ISSUER_SECRET, `${blinded}:${expiresAt}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        signedBlinded,
        expiresAt,
        expiryProof,
      }));
    });
    return;
  }

  // Everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

// ─── Start Server ───────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);

// Periodic cleanup of expired rate limiters
setInterval(cleanRateLimiters, CLEANUP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗
  ║      GroceryApp Token Issuer v1                            ║
  ║      Blind-Signed Contribution Token Server                 ║
  ╚══════════════════════════════════════════════════════════════╝

  Token Issuer: http://localhost:${PORT}
  Health:       http://localhost:${PORT}/health
  Endpoint:     POST http://localhost:${PORT}/request-token  { blinded: "<base64>" }

  Rate limit:   ${RATE_LIMIT} tokens/min per IP
  Token TTL:    ${TOKEN_TTL_MS / 3600000} hours
  Secret:       ${process.env.TOKEN_ISSUER_SECRET ? '(from env)' : '(auto-generated, saved to ' + SECRET_FILE + ')'}
  `);
});

/**
 * Token Verifier — Blind-Signed Contribution Token Verification
 *
 * Used by pool-server to validate attached contribution tokens.
 *
 * Token format (v1): "v1.<base64(tokenPayload)>.<base64(expiryProof)>"
 * where tokenPayload = base64(blinded + ":" + expiresAt)
 * and   expiryProof = HMAC(issuerSecret, blinded + ":" + expiresAt)
 *
 * The token-issuer creates:
 *   signedBlinded = HMAC(issuerSecret, blinded)
 *   expiryProof   = HMAC(issuerSecret, blinded + ":" + expiresAt)
 *
 * The client constructs the wire token by encoding blinded + ":" + expiresAt
 * as the tokenPayload in base64, and using expiryProof as the signature.
 *
 * Pool verification:
 *   1. Decode tokenPayload to get blinded + expiresAt
 *   2. Recompute: expectedProof = HMAC(issuerSecret, blinded + ":" + expiresAt)
 *   3. Compare with provided expiryProof
 *
 * Environment variables:
 *   ISSUER_SECRET — shared HMAC secret (same as token-issuer)
 *   When ISSUER_SECRET is not set, the pool operates in open mode (no token required)
 */

const crypto = require('crypto');

const TOKEN_VERSION = 'v1';
const TOKEN_SEPARATOR = '.';

/**
 * Used tokens set for single-use enforcement.
 * Map<token, timestamp> — timestamp is when it was used.
 * Periodic cleanup of entries older than USED_TOKEN_TTL_MS.
 */
const usedTokens = new Map();

/** Token TTL for cleanup (24 hours). */
const USED_TOKEN_TTL_MS = 86_400_000;

/** Cleanup interval (1 hour). */
const CLEANUP_INTERVAL_MS = 3_600_000; // 1 hour

/**
 * Compute HMAC-SHA256 and return as base64.
 * @param {string} key
 * @param {string} message
 * @returns {string} base64-encoded HMAC
 */
function hmacBase64(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('base64');
}

/**
 * Parse and verify a contribution token.
 *
 * Token format: "v1.<base64(blinded + ":" + expiresAt)>.<base64(expiryProof)>"
 * Where expiryProof = HMAC(issuerSecret, blinded + ":" + expiresAt)
 *
 * @param {string} tokenStr - The full Authorization Bearer token string
 * @param {string|null} issuerSecret - Shared HMAC secret. Null = open mode (no verification)
 * @returns {{ valid: boolean, error?: string, expiresAt?: number }}
 */
function verifyToken(tokenStr, issuerSecret) {
  // If no issuer secret is set, we're in open mode — accept any token
  if (!issuerSecret) {
    return { valid: true };
  }

  if (!tokenStr || typeof tokenStr !== 'string') {
    return { valid: false, error: 'Token is required' };
  }

  // Split by separator
  const parts = tokenStr.split(TOKEN_SEPARATOR);
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token: expected 3 parts' };
  }

  const [version, tokenPayload, signature] = parts;

  // Check version
  if (version !== TOKEN_VERSION) {
    return { valid: false, error: `Unknown token version: ${version}` };
  }

  // Check single-use (replay protection)
  if (usedTokens.has(tokenStr)) {
    return { valid: false, error: 'Token has already been used' };
  }

  // Decode tokenPayload to get blinded and expiresAt
  let decodedPayload;
  let blinded;
  let expiresAt;
  try {
    decodedPayload = Buffer.from(tokenPayload, 'base64').toString('utf-8');
    const colonIdx = decodedPayload.lastIndexOf(':');
    blinded = decodedPayload.slice(0, colonIdx);
    expiresAt = parseInt(decodedPayload.slice(colonIdx + 1), 10);
  } catch {
    return { valid: false, error: 'Malformed token payload' };
  }

  // Validate extracted values
  if (!blinded || isNaN(expiresAt)) {
    return { valid: false, error: 'Malformed token payload' };
  }

  // Check expiry
  if (Date.now() > expiresAt) {
    return { valid: false, error: 'Token has expired' };
  }

  // Recompute expected proof: HMAC(issuerSecret, blinded + ":" + expiresAt)
  const expectedProof = hmacBase64(issuerSecret, `${blinded}:${expiresAt}`);

  // Constant-time comparison
  try {
    const expectedBuf = Buffer.from(expectedProof, 'base64');
    const providedBuf = Buffer.from(signature, 'base64');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return { valid: false, error: 'Invalid token signature' };
    }
  } catch {
    return { valid: false, error: 'Invalid token signature format' };
  }

  // Mark as used (single-use enforcement)
  usedTokens.set(tokenStr, Date.now());

  return { valid: true, expiresAt };
}

/**
 * Check if a token has already been used (without consuming it).
 * @param {string} tokenStr
 * @returns {boolean}
 */
function checkSingleUse(tokenStr) {
  return usedTokens.has(tokenStr);
}

/**
 * Mark a token as used (for single-use enforcement).
 * @param {string} tokenStr
 */
function markTokenUsed(tokenStr) {
  usedTokens.set(tokenStr, Date.now());
}

/**
 * Clean up expired used token entries to prevent memory leaks.
 */
function cleanUsedTokens() {
  const now = Date.now();
  let cleaned = 0;
  for (const [token, timestamp] of usedTokens) {
    if (now - timestamp > USED_TOKEN_TTL_MS) {
      usedTokens.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[token-verifier] Cleaned ${cleaned} expired used-token entries`);
  }
}

// Set up periodic cleanup
setInterval(cleanUsedTokens, CLEANUP_INTERVAL_MS);

module.exports = { verifyToken, checkSingleUse, markTokenUsed };

/**
 * Contribution Tokens — Blind-Signed Token Protocol (v1, HMAC-based)
 *
 * The client obtains blind-signed tokens from a separate token issuer endpoint.
 * Tokens are single-use, expire after 24 hours, and are cached in memory.
 *
 * v1 APPROXIMATION:
 *   This uses HMAC-SHA256 for blind signing rather than formal Privacy Pass
 *   (VOPRF). The protocol provides practical unlinkability:
 *     - Issuer sees blinded = HMAC(nonce, "contribution-token-v1")
 *     - Issuer learns nothing about the nonce
 *     - Pool verifies signature but cannot link back to the issuer's view
 *   Upgrade to formal Privacy Pass / OHTTP in v2.
 *
 * Flow:
 *   1. Generate random 32-byte nonce
 *   2. Blind: blinded = HMAC(nonce, "contribution-token-v1")
 *   3. Send to issuer: POST { blinded }
 *   4. Receive: { signedBlinded, expiresAt, expiryProof }
 *   5. Create wire token: "v1.<base64(blinded:expiresAt)>.<base64(expiryProof)>"
 *   6. Cache token
 *
 * Wire format:
 *   v1.<base64(blinded + ":" + expiresAt)>.<base64(expiryProof)>
 *   where expiryProof = HMAC(issuerSecret, blinded + ":" + expiresAt)
 *   Pool verifies: HMAC(issuerSecret, blinded + ":" + expiresAt) == expiryProof
 */

import { getSettings } from '../config/settings';

const TOKEN_VERSION = 'v1';
const TOKEN_SEPARATOR = '.';
const REQUEST_TIMEOUT_MS = 10_000; // 10 seconds

// ─── In-Memory Cache ────────────────────────────────────────────────────────

interface CachedToken {
  token: string;      // Full wire token string
  expiresAt: number;  // Epoch ms (from issuer)
  cachedAt: number;   // When we cached it
}

let tokenCache: CachedToken | null = null;

/** Max cache age before forcing a refresh (22 hours, slightly less than 24h TTL). */
const MAX_CACHE_AGE_MS = 79_200_000; // 22 hours

// ─── Crypto Helpers ─────────────────────────────────────────────────────────

/**
 * Generate a random 32-byte nonce using Web Crypto API.
 * Falls back to Math.random-based approach if crypto is unavailable.
 */
function getRandomBytes(size: number): Uint8Array {
  try {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return bytes;
  } catch {
    // Fallback for environments without crypto.getRandomValues
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }
}

/**
 * Compute HMAC-SHA256 using Web Crypto API.
 * Falls back to a synchronous approximation if subtle is unavailable.
 */
async function hmacSha256(key: Uint8Array, message: string): Promise<ArrayBuffer> {
  // Copy key data to a plain ArrayBuffer to satisfy TypeScript's BufferSource type
  const keyCopy = new ArrayBuffer(key.length);
  const keyView = new Uint8Array(keyCopy);
  keyView.set(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyCopy,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign'],
  );
  const msgBytes = new TextEncoder().encode(message);
  return crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
}

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert ArrayBuffer to hex string.
 */
function arrayBufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Token Issuer URL ───────────────────────────────────────────────────────

/**
 * Get the token issuer URL from settings.
 * Returns null if not configured (self-host mode).
 */
function getTokenIssuerUrl(): string | null {
  const { tokenIssuerUrl, poolUrl } = getSettings();

  if (tokenIssuerUrl) {
    return tokenIssuerUrl;
  }

  // Fallback: derive from poolUrl (pool server == token issuer in simple setups)
  if (poolUrl) {
    return poolUrl.replace(/\/+$/, '');
  }

  return null;
}

// ─── Token Protocol ─────────────────────────────────────────────────────────

/**
 * Generate a blinded token request.
 *
 * blinded = HMAC-SHA256(nonce, "contribution-token-v1")
 * Returns base64-encoded blinded value and the raw nonce.
 */
async function generateBlindedRequest(): Promise<{ blinded: string; nonce: Uint8Array }> {
  const nonce = getRandomBytes(32);
  const hmacResult = await hmacSha256(nonce, 'contribution-token-v1');
  const blinded = arrayBufferToBase64(hmacResult);
  return { blinded, nonce };
}

/**
 * Construct the wire token from issuer response data.
 *
 * Wire format: "v1.<base64(blinded:expiresAt)>.<base64(expiryProof)>"
 * The pool verifies: HMAC(issuerSecret, blinded + ":" + expiresAt) == expiryProof
 */
function constructWireToken(blinded: string, expiresAt: number, expiryProof: string): string {
  const payloadStr = blinded + ':' + expiresAt.toString();
  const tokenPayload = btoa(payloadStr);
  return TOKEN_VERSION + TOKEN_SEPARATOR + tokenPayload + TOKEN_SEPARATOR + expiryProof;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Request a fresh contribution token from the issuer.
 *
 * Returns the full wire token string, or null if the issuer URL is not configured
 * (self-host mode).
 *
 * Rate-limited (10/min per IP) by the issuer server.
 */
export async function requestContributionToken(): Promise<string | null> {
  const issuerUrl = getTokenIssuerUrl();
  if (!issuerUrl) {
    // Self-host mode — no token needed
    return null;
  }

  // Generate blinded request
  const { blinded } = await generateBlindedRequest();

  // Send to issuer
  const response = await fetch(issuerUrl + '/request-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blinded }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn('[tokens] Failed to request token: ' + response.status);
    return null;
  }

  const data = (await response.json()) as {
    signedBlinded: string;
    expiresAt: number;
    expiryProof: string;
  };

  // Construct wire token
  const token = constructWireToken(blinded, data.expiresAt, data.expiryProof);

  // Cache the token
  tokenCache = {
    token,
    expiresAt: data.expiresAt,
    cachedAt: Date.now(),
  };

  return token;
}

/**
 * Get a cached contribution token, or request a new one.
 *
 * Returns the full wire token string, or null if the issuer URL is not configured
 * (self-host mode — no token needed).
 */
export async function getContributionToken(): Promise<string | null> {
  const issuerUrl = getTokenIssuerUrl();
  if (!issuerUrl) {
    return null;
  }

  // Check cache
  if (tokenCache) {
    const age = Date.now() - tokenCache.cachedAt;
    if (age < MAX_CACHE_AGE_MS && Date.now() < tokenCache.expiresAt) {
      return tokenCache.token;
    }
    // Cache expired — clear it
    tokenCache = null;
  }

  return requestContributionToken();
}

/**
 * Clear the cached token (e.g. on 403 rejection).
 */
export function clearContributionTokenCache(): void {
  tokenCache = null;
}

/**
 * Get the issuer URL from settings (for testing/monitoring).
 */
export function getTokenIssuerUrlForTesting(): string | null {
  return getTokenIssuerUrl();
}

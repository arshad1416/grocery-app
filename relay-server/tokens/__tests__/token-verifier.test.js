/**
 * Token Verifier — Tests
 *
 * Tests:
 *  - verifyToken accepts valid token
 *  - verifyToken rejects invalid signature
 *  - verifyToken rejects replayed token
 *  - verifyToken rejects expired token
 *  - verifyToken rejects malformed token string
 *  - checkSingleUse works correctly
 *  - markTokenUsed works correctly
 *  - Open mode (no issuerSecret) accepts any token
 */

const crypto = require('crypto');
const { verifyToken, checkSingleUse, markTokenUsed } = require('../token-verifier');

// ─── Helpers ────────────────────────────────────────────────────────────────

const ISSUER_SECRET='test-i...only';

function hmacBase64(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('base64');
}

/**
 * Create a valid token for testing.
 * @param {string} blinded - The blinded value
 * @param {string} issuerSecret - The issuer secret
 * @param {number} expiresAt - Expiry timestamp (default: far future)
 * @returns {string} Full token string
 */
function createValidToken(blinded, issuerSecret = ISSUER_SECRET, expiresAt = Date.now() + 86_400_000) {
  const tokenPayload = Buffer.from(`${blinded}:${expiresAt}`).toString('base64');
  const expiryProof = hmacBase64(issuerSecret, `${blinded}:${expiresAt}`);
  return `v1.${tokenPayload}.${expiryProof}`;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  it('accepts a valid token', () => {
    const blinded = hmacBase64('test-nonce', 'contribution-token-v1');
    const token = createValidToken(blinded);

    const result = verifyToken(token, ISSUER_SECRET);
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a token with invalid signature', () => {
    const blinded = hmacBase64('test-nonce', 'contribution-token-v1');
    const tokenPayload = Buffer.from(`${blinded}:${Date.now() + 86_400_000}`).toString('base64');
    // Use a different secret to create the signature
    const wrongProof = hmacBase64('wrong-secret', `${blinded}:${Date.now() + 86_400_000}`);
    const token = `v1.${tokenPayload}.${wrongProof}`;

    const result = verifyToken(token, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('rejects a token with tampered signature', () => {
    const blinded = hmacBase64('test-nonce', 'contribution-token-v1');
    const expiresAt = Date.now() + 86_400_000;
    const tokenPayload = Buffer.from(`${blinded}:${expiresAt}`).toString('base64');
    // Use a completely different signature (not valid for any payload)
    const tamperedSig = hmacBase64('different-secret', 'completely-different-payload');
    const token = `v1.${tokenPayload}.${tamperedSig}`;

    const result = verifyToken(token, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('rejects a replayed token (single-use)', () => {
    const blinded = hmacBase64('test-nonce-replay', 'contribution-token-v1');
    const token = createValidToken(blinded);

    // First use succeeds
    const first = verifyToken(token, ISSUER_SECRET);
    expect(first.valid).toBe(true);

    // Second use fails (replay)
    const second = verifyToken(token, ISSUER_SECRET);
    expect(second.valid).toBe(false);
    expect(second.error).toContain('already been used');
  });

  it('rejects an expired token', () => {
    const blinded = hmacBase64('test-nonce-expired', 'contribution-token-v1');
    const expiresAt = Date.now() - 1000; // 1 second ago
    const token = createValidToken(blinded, ISSUER_SECRET, expiresAt);

    const result = verifyToken(token, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('rejects malformed token string (no dots)', () => {
    const result = verifyToken('not-a-valid-token', ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed');
  });

  it('rejects malformed token string (wrong version)', () => {
    const blinded = hmacBase64('test-nonce', 'contribution-token-v1');
    const tokenPayload = Buffer.from(`${blinded}:${Date.now() + 86_400_000}`).toString('base64');
    const expiryProof = hmacBase64(ISSUER_SECRET, `${blinded}:${Date.now() + 86_400_000}`);
    const token = `v2.${tokenPayload}.${expiryProof}`;

    const result = verifyToken(token, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('version');
  });

  it('rejects token with too many parts', () => {
    const result = verifyToken('v1.part1.part2.part3', ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed');
  });

  it('rejects null token', () => {
    const result = verifyToken(null, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('rejects undefined token', () => {
    const result = verifyToken(undefined, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  describe('Open mode (no issuerSecret)', () => {
    it('accepts any token when issuerSecret is null', () => {
      const result = verifyToken('any-old-token', null);
      expect(result.valid).toBe(true);
    });

    it('accepts null token when issuerSecret is null', () => {
      const result = verifyToken(null, null);
      expect(result.valid).toBe(true);
    });

    it('accepts undefined token when issuerSecret is undefined', () => {
      const result = verifyToken('some-token', undefined);
      expect(result.valid).toBe(true);
    });

    it('accepts empty string token when issuerSecret is empty string', () => {
      const result = verifyToken('', '');
      expect(result.valid).toBe(true);
    });
  });
});

describe('checkSingleUse', () => {
  it('returns false for a token that has not been used', () => {
    // A token that hasn't gone through verifyToken should not be tracked
    const token = 'v1.test.test';
    expect(checkSingleUse(token)).toBe(false);
  });

  it('returns true for a token that has been verified (used)', () => {
    const blinded = hmacBase64('test-nonce-check', 'contribution-token-v1');
    const token = createValidToken(blinded);

    // First use via verifyToken
    verifyToken(token, ISSUER_SECRET);

    // Now checkSingleUse should return true
    expect(checkSingleUse(token)).toBe(true);
  });
});

describe('markTokenUsed', () => {
  it('manually marks a token as used', () => {
    const token = 'v1.manually-marked.token';

    expect(checkSingleUse(token)).toBe(false);
    markTokenUsed(token);
    expect(checkSingleUse(token)).toBe(true);
  });

  it('verifyToken rejects a manually marked token', () => {
    const blinded = hmacBase64('test-nonce-manual', 'contribution-token-v1');
    const token = createValidToken(blinded);

    // Manually mark as used
    markTokenUsed(token);

    // verifyToken should now reject it
    const result = verifyToken(token, ISSUER_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already been used');
  });
});

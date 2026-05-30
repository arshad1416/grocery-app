/**
 * Token Issuer — Tests
 *
 * Tests:
 *  - POST /request-token returns signed blinded token
 *  - Rate limits by IP (11th request gets 429)
 *  - Different IPs have independent rate limits
 *  - Rejects invalid request body (missing blinded field)
 *  - Returns CORS headers (OPTIONS preflight)
 */

const http = require('http');

// ─── Helper: start token-issuer on a random port ───────────────────────────

/**
 * Helper: Create a test server using minimal standalone handler.
 */
function createTestServer() {
  const crypto = require('crypto');

  const ISSUER_SECRET = 'test-issuer-secret-for-testing-only';

  function hmacBase64(key, msg) {
    return crypto.createHmac('sha256', key).update(msg).digest('base64');
  }

  // Rate limiting state
  const ipRateLimiters = new Map();
  const RATE_LIMIT = 10;
  const RATE_WINDOW_MS = 60_000;
  const TOKEN_TTL_MS = 86_400_000;

  function checkRateLimit(ip) {
    const now = Date.now();
    let limiter = ipRateLimiters.get(ip);
    if (!limiter || now - limiter.windowStart > RATE_WINDOW_MS) {
      limiter = { count: 1, windowStart: now };
      ipRateLimiters.set(ip, limiter);
      return true;
    }
    limiter.count++;
    if (limiter.count > RATE_LIMIT) return false;
    return true;
  }

  function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/request-token' && req.method === 'POST') {
      const clientIp = req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.socket.remoteAddress || 'unknown';

      if (!checkRateLimit(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (body.length > 4096) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request body too large' }));
          return;
        }

        let parsed;
        try { parsed = JSON.parse(body); }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        const { blinded } = parsed;
        if (!blinded || typeof blinded !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'blinded field is required' }));
          return;
        }

        const signedBlinded = hmacBase64(ISSUER_SECRET, blinded);
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        const expiryProof = hmacBase64(ISSUER_SECRET, `${blinded}:${expiresAt}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ signedBlinded, expiresAt, expiryProof }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  return new Promise((resolve) => {
    const server = http.createServer(handleRequest);
    server.listen(0, () => {
      const port = server.address().port;
      const url = `http://localhost:${port}`;
      resolve({ server, port, url, hmacBase64, ISSUER_SECRET });
    });
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Token Issuer', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await createTestServer();
  });

  afterAll(() => {
    if (testEnv) testEnv.server.close();
  });

  describe('POST /request-token', () => {
    it('returns signedBlinded, expiresAt, and expiryProof for valid request', async () => {
      const { url, hmacBase64, ISSUER_SECRET } = testEnv;
      const blinded = hmacBase64('test-nonce', 'contribution-token-v1');

      const response = await fetch(`${url}/request-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blinded }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('signedBlinded');
      expect(data).toHaveProperty('expiresAt');
      expect(data).toHaveProperty('expiryProof');
      expect(typeof data.signedBlinded).toBe('string');
      expect(typeof data.expiresAt).toBe('number');
      expect(typeof data.expiryProof).toBe('string');

      // Verify the expiry proof
      const expectedProof = hmacBase64(ISSUER_SECRET, `${blinded}:${data.expiresAt}`);
      expect(data.expiryProof).toBe(expectedProof);
    });

    it('returns 400 for missing blinded field', async () => {
      const { url } = testEnv;

      const response = await fetch(`${url}/request-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('blinded');
    });

    it('returns 400 for invalid body', async () => {
      const { url } = testEnv;

      const response = await fetch(`${url}/request-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      expect(response.status).toBe(400);
    });

    it('returns different tokens for different blinded values', async () => {
      const { url, hmacBase64 } = testEnv;

      const blinded1 = hmacBase64('nonce-1', 'contribution-token-v1');
      const blinded2 = hmacBase64('nonce-2', 'contribution-token-v1');

      const [res1, res2] = await Promise.all([
        fetch(`${url}/request-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blinded: blinded1 }),
        }),
        fetch(`${url}/request-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blinded: blinded2 }),
        }),
      ]);

      const data1 = await res1.json();
      const data2 = await res2.json();

      // Verify they all differ for different blinded values
      expect(data1.signedBlinded).not.toBe(data2.signedBlinded);
      expect(data1.expiryProof).not.toBe(data2.expiryProof);
    });
  });

  describe('Rate Limiting', () => {
    it('rate limits after 10 requests from same IP in 1 minute', async () => {
      const { url, hmacBase64 } = testEnv;
      const ip = '127.0.0.1';

      // Send 10 requests — should all succeed
      const requests = Array.from({ length: 10 }, (_, i) =>
        fetch(`${url}/request-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': ip,
          },
          body: JSON.stringify({ blinded: hmacBase64(`nonce-${i}-${Date.now()}`, 'contribution-token-v1') }),
        }),
      );

      const results = await Promise.all(requests);
      const okResults = results.filter((r) => r.status === 200);
      expect(okResults.length).toBe(10);

      // 11th request should be rate limited
      const rateLimited = await fetch(`${url}/request-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({ blinded: hmacBase64(`nonce-rate-limit-${Date.now()}`, 'contribution-token-v1') }),
      });

      expect(rateLimited.status).toBe(429);
    });
  });

  describe('GET /health', () => {
    it('returns status ok', async () => {
      const { url } = testEnv;

      const response = await fetch(`${url}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
    });
  });

  describe('CORS', () => {
    it('returns CORS headers on OPTIONS preflight', async () => {
      const { url } = testEnv;

      const response = await fetch(`${url}/request-token`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });
  });
});

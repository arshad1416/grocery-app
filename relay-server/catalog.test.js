/**
 * Catalog endpoints — the relay-side half of moving the Turso credential off
 * the client.
 *
 * What these protect:
 *   - the credential is read from the process environment and never returned
 *   - there is no SQL passthrough: request input reaches Turso only as bound
 *     parameters to fixed statements
 *   - the endpoint authenticates and fails closed when unconfigured
 */

const { EventEmitter } = require('events');

const CATALOG_PATH = './catalog/catalog-server';
const TURSO_PATH = './catalog/turso-client';

// ─── Test doubles ───────────────────────────────────────────────────────────

/** Minimal IncomingMessage stand-in that emits a JSON body. */
function makeReq(url, method, body, headers = {}) {
  const req = new EventEmitter();
  req.url = url;
  req.method = method;
  req.headers = { authorization: 'Bearer valid-token', ...headers };
  req.destroy = () => {};

  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });

  return req;
}

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(code) { this.statusCode = code; },
    end(payload) { this.body = payload ? JSON.parse(payload) : null; },
  };
}

function enrolled() {
  return new Map([
    ['valid-token', { deviceId: 'device-1', expiresAt: Date.now() + 3_600_000 }],
    ['expired-token', { deviceId: 'device-2', expiresAt: Date.now() - 1000 }],
  ]);
}

/** Captures what would have been sent to Turso. */
let fetchCalls = [];
let fetchResponse = { cols: [], rows: [] };

function installFetchSpy() {
  fetchCalls = [];
  global.fetch = jest.fn(async (url, init) => {
    fetchCalls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ type: 'ok', response: fetchResponse }],
      }),
    };
  });
}

describe('catalog endpoints', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.TURSO_URL = 'https://catalog-test.example.invalid';
    process.env.TURSO_TOKEN = 'test-token-value-not-a-real-credential';
    process.env.CATALOG_RATE_LIMIT = '1000';
    fetchResponse = { cols: [], rows: [] };
    installFetchSpy();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('rejects a request with no Authorization header', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }, { authorization: undefined }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an unknown relay token', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }, { authorization: 'Bearer nope' }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an expired relay token', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }, { authorization: 'Bearer expired-token' }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(403);
  });

  // ── Fail closed ───────────────────────────────────────────────────────────

  it('returns 503 when the relay operator has not provisioned Turso', async () => {
    delete process.env.TURSO_URL;
    delete process.env.TURSO_TOKEN;
    jest.resetModules();
    const { handleCatalogRequest } = require(CATALOG_PATH);

    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }),
      res,
      enrolled(),
    );

    expect(res.statusCode).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── No SQL passthrough ────────────────────────────────────────────────────

  it('exposes only the six intended operations', () => {
    const { _operations } = require(CATALOG_PATH);
    expect(Object.keys(_operations).sort()).toEqual([
      'deals',
      'price-history',
      'product',
      'product-submit',
      'store-branding',
      'store-prices',
    ]);
  });

  it('404s an operation that is not on the list', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/query', 'POST', { sql: 'SELECT 1' }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied sql field entirely', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const { QUERIES } = require(TURSO_PATH);

    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', {
        barcode: '012345678905',
        sql: 'DROP TABLE products',
      }),
      res,
      enrolled(),
    );

    expect(res.statusCode).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    const stmt = fetchCalls[0].body.requests[0].stmt;
    expect(stmt.sql).toBe(QUERIES.productByBarcode);
    expect(stmt.sql).not.toContain('DROP');
    expect(stmt.args).toEqual(['012345678905']);
  });

  it('binds the barcode as a parameter rather than interpolating it', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '000000000000' }),
      res,
      enrolled(),
    );

    const stmt = fetchCalls[0].body.requests[0].stmt;
    expect(stmt.sql).not.toContain('000000000000');
    expect(stmt.args).toContain('000000000000');
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it.each([
    ["' OR 1=1 --", 'SQL-ish string'],
    ['12345', 'too short'],
    ['0123456789012345678901', 'too long'],
    ['abc123456789', 'non-numeric'],
    [12345678, 'not a string'],
    [null, 'null'],
  ])('rejects barcode %p (%s) without calling Turso', async (barcode) => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['%', 'bare wildcard'],
    ["L0R' OR '1'='1", 'injection attempt'],
    ['123', 'wrong shape'],
    ['', 'empty'],
  ])('rejects FSA %p (%s) without calling Turso', async (fsa) => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(makeReq('/api/catalog/deals', 'POST', { fsa }), res, enrolled());
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('normalises a valid FSA and appends the wildcard server-side', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/deals', 'POST', { fsa: 'l0r 1b0' }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(200);
    expect(fetchCalls[0].body.requests[0].stmt.args[0]).toBe('L0R%');
  });

  it('clamps an oversized limit instead of trusting the client', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/price-history', 'POST', { barcode: '012345678905', limit: 999999 }),
      res,
      enrolled(),
    );
    expect(fetchCalls[0].body.requests[0].stmt.args[1]).toBe(100);
  });

  // ── Credential containment ────────────────────────────────────────────────

  it('sends the credential to Turso and never back to the client', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }),
      res,
      enrolled(),
    );

    expect(fetchCalls[0].init.headers.Authorization).toBe(
      `Bearer ${process.env.TURSO_TOKEN}`,
    );
    expect(JSON.stringify(res.body)).not.toContain(process.env.TURSO_TOKEN);
    expect(JSON.stringify(res.body)).not.toContain(process.env.TURSO_URL);
  });

  it('does not leak the upstream error body when Turso fails', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      // A real upstream error page can echo the request, headers included.
      text: async () => `Unauthorized: Bearer ${process.env.TURSO_TOKEN}`,
      json: async () => ({}),
    }));

    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }),
      res,
      enrolled(),
    );

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain(process.env.TURSO_TOKEN);
  });

  // ── Reads ─────────────────────────────────────────────────────────────────

  it('maps a product row to the shape the client expects', async () => {
    fetchResponse = {
      cols: [],
      rows: [{ columns: ['Oat Milk', 'Oatly', 'dairy', null, '1 L'] }],
    };
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }),
      res,
      enrolled(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.product).toEqual({
      barcode: '012345678905',
      productName: 'Oat Milk',
      brand: 'Oatly',
      category: 'dairy',
      imageUrl: null,
      quantityLabel: '1 L',
    });
  });

  it('returns product: null for an unknown barcode', async () => {
    fetchResponse = { cols: [], rows: [] };
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product', 'POST', { barcode: '012345678905' }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.product).toBeNull();
  });

  it('serves store branding over GET', async () => {
    fetchResponse = {
      cols: [],
      rows: [{ columns: ['no-frills', 'No Frills', 'https://x/logo.png', '#FFDD00'] }],
    };
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/store-branding', 'GET', undefined),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.branding).toHaveLength(1);
    expect(res.body.branding[0].store_id).toBe('no-frills');
  });

  it('rejects the wrong HTTP method for an operation', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/store-branding', 'POST', {}),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(405);
  });

  // ── Writes ────────────────────────────────────────────────────────────────

  it('writes a submitted product through the fixed INSERT', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const { QUERIES } = require(TURSO_PATH);

    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product-submit', 'POST', {
        barcode: '012345678905',
        productName: 'Oat Milk',
        brand: 'Oatly',
        aiCleaned: true,
      }),
      res,
      enrolled(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(fetchCalls[0].body.requests[0].stmt.sql).toBe(QUERIES.insertProduct);
  });

  it('writes the product before the price, so the foreign key holds', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const { QUERIES } = require(TURSO_PATH);

    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product-submit', 'POST', {
        barcode: '012345678905',
        productName: 'Oat Milk',
        price: { amount: 4.99, storeName: 'No Frills', storeId: 'no-frills' },
      }),
      res,
      enrolled(),
    );

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].body.requests[0].stmt.sql).toBe(QUERIES.insertProduct);
    expect(fetchCalls[1].body.requests[0].stmt.sql).toBe(QUERIES.insertProductPrice);
    expect(fetchCalls[1].body.requests[0].stmt.args).toEqual([
      '012345678905',
      4.99,
      'No Frills',
      'no-frills',
    ]);
  });

  it('keeps the product write when the price payload is malformed', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product-submit', 'POST', {
        barcode: '012345678905',
        productName: 'Oat Milk',
        price: { amount: 'free', storeName: '', storeId: 'NOT A SLUG' },
      }),
      res,
      enrolled(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, priceRejected: true });
    expect(fetchCalls).toHaveLength(1);
  });

  it('requires a product name on submit', async () => {
    const { handleCatalogRequest } = require(CATALOG_PATH);
    const res = makeRes();
    await handleCatalogRequest(
      makeReq('/api/catalog/product-submit', 'POST', { barcode: '012345678905' }),
      res,
      enrolled(),
    );
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('catalog turso-client', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('reports unconfigured when the environment has no credentials', () => {
    delete process.env.TURSO_URL;
    delete process.env.TURSO_TOKEN;
    jest.resetModules();
    const { isCatalogConfigured } = require(TURSO_PATH);
    expect(isCatalogConfigured()).toBe(false);
  });

  it('reports unconfigured when only the URL is set', () => {
    process.env.TURSO_URL = 'https://catalog-test.example.invalid';
    delete process.env.TURSO_TOKEN;
    jest.resetModules();
    const { isCatalogConfigured } = require(TURSO_PATH);
    expect(isCatalogConfigured()).toBe(false);
  });

  it('throws rather than issuing an unauthenticated request when unconfigured', async () => {
    delete process.env.TURSO_URL;
    delete process.env.TURSO_TOKEN;
    jest.resetModules();
    const { executeFixed, QUERIES } = require(TURSO_PATH);
    global.fetch = jest.fn();

    await expect(executeFixed(QUERIES.storeBranding, [])).rejects.toThrow(
      /not provisioned/,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('every statement is a literal with no template interpolation', () => {
    process.env.TURSO_URL = 'https://catalog-test.example.invalid';
    process.env.TURSO_TOKEN = 'test-token-value-not-a-real-credential';
    jest.resetModules();
    const { QUERIES } = require(TURSO_PATH);

    // storeBranding takes no arguments, so it legitimately has no placeholder.
    // Everything else must bind its input rather than embed it.
    const PARAMETERLESS = new Set(['storeBranding']);

    for (const [name, sql] of Object.entries(QUERIES)) {
      expect(typeof sql).toBe('string');
      // A `${` surviving into a query string would mean input was interpolated.
      expect(sql).not.toContain('${');
      if (!PARAMETERLESS.has(name)) {
        expect(`${name}:${sql}`).toMatch(/\?/);
      }
    }
  });
});

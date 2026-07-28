/**
 * Product Catalog — HTTP handler for the narrow Turso-backed endpoints.
 *
 * Replaces the app's direct client→Turso connection. The mobile client used to
 * hold a read-write Turso token and issue arbitrary SQL through
 * `/v2/pipeline`; it now calls the six fixed operations below and the
 * credential never leaves the relay's process environment.
 *
 * Follows the POST /api/extract/flyer precedent: Bearer relayToken against
 * enrolledDevices, per-device rate limiting, bounded body, validated input,
 * typed output.
 *
 * ⚠️  THERE IS NO SQL PASSTHROUGH HERE, AND THERE MUST NEVER BE ONE.  ⚠️
 * A passthrough endpoint is the same read-write credential with a different
 * hostname. Request input reaches Turso only as bound positional parameters
 * to the fixed statements in catalog/turso-client.js.
 *
 * PRIVACY NOTE — this channel is NOT zero-knowledge. Barcodes, postal FSA
 * prefixes, and store identifiers are visible in plaintext to the relay
 * operator (over TLS). The zero-knowledge guarantee (AC-11) covers only the
 * Yjs + libsodium grocery-list sync path. Same posture as
 * /api/extract/flyer — see src/pricing/relay-extractor.ts.
 *
 * @module catalog/catalog-server
 */

const { isCatalogConfigured, executeFixed, QUERIES } = require('./turso-client');

// ─── Rate limiting ──────────────────────────────────────────────────────────

/** Map<deviceId, { count: number, windowStart: number }> */
const catalogRateLimiters = new Map();
const CATALOG_RATE_LIMIT = parseInt(process.env.CATALOG_RATE_LIMIT || '60', 10);
const CATALOG_RATE_WINDOW_MS = 60_000;

function checkCatalogRateLimit(deviceId) {
  const now = Date.now();
  let limiter = catalogRateLimiters.get(deviceId);

  if (!limiter || now - limiter.windowStart > CATALOG_RATE_WINDOW_MS) {
    catalogRateLimiters.set(deviceId, { count: 1, windowStart: now });
    return true;
  }

  limiter.count++;
  return limiter.count <= CATALOG_RATE_LIMIT;
}

function cleanCatalogRateLimiters() {
  const now = Date.now();
  for (const [deviceId, limiter] of catalogRateLimiters) {
    if (now - limiter.windowStart > CATALOG_RATE_WINDOW_MS * 2) {
      catalogRateLimiters.delete(deviceId);
    }
  }
}

const cleanupTimer = setInterval(cleanCatalogRateLimiters, 5 * 60_000);
if (cleanupTimer.unref) cleanupTimer.unref();

// ─── Input validation ───────────────────────────────────────────────────────
//
// Every one of these returns null rather than throwing, and the handler turns
// a null into a 400. Nothing that fails validation reaches Turso.

/** Barcodes are EAN/UPC/GTIN — digits, 6-18 of them. */
function validBarcode(v) {
  return typeof v === 'string' && /^[0-9]{6,18}$/.test(v) ? v : null;
}

/**
 * Canadian FSA — letter, digit, letter — returned uppercased.
 *
 * Accepts a bare FSA ("L0R") or a full postal code ("l0r 1b0", "L0R1B0",
 * "L0R-1B0") and keeps only the FSA. The WHOLE string must be a plausible
 * postal code: slicing the first three characters and testing only those
 * would silently accept "L0R' OR '1'='1" as "L0R". That is harmless here —
 * the value is bound as a parameter, never interpolated — but an endpoint
 * should reject input that is not what it claims to be rather than quietly
 * truncating it into something valid.
 */
function validFsa(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!/^[A-Za-z][0-9][A-Za-z]([ -]?[0-9][A-Za-z][0-9])?$/.test(trimmed)) return null;
  return trimmed.slice(0, 3).toUpperCase();
}

/** Store ids are slugs produced by normalizeStoreId() on the client. */
function validStoreId(v) {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v) ? v : null;
}

/** Bounded integer, with a default. */
function validLimit(v, fallback, max) {
  const n = typeof v === 'number' ? Math.floor(v) : parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** Free text the user typed — length-capped, or null when absent. */
function validText(v, maxLen) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLen);
}

// ─── Operations ─────────────────────────────────────────────────────────────

async function opProduct(body) {
  const barcode = validBarcode(body.barcode);
  if (!barcode) return { status: 400, payload: { error: 'barcode must be 6-18 digits' } };

  const { rows } = await executeFixed(QUERIES.productByBarcode, [barcode]);
  if (rows.length === 0) return { status: 200, payload: { product: null } };

  const r = rows[0];
  return {
    status: 200,
    payload: {
      product: {
        barcode,
        productName: String(r[0] ?? 'Unknown Product'),
        brand: r[1] != null ? String(r[1]) : null,
        category: r[2] != null ? String(r[2]) : null,
        imageUrl: r[3] != null ? String(r[3]) : null,
        quantityLabel: r[4] != null ? String(r[4]) : null,
      },
    },
  };
}

async function opPriceHistory(body) {
  const barcode = validBarcode(body.barcode);
  if (!barcode) return { status: 400, payload: { error: 'barcode must be 6-18 digits' } };
  const limit = validLimit(body.limit, 20, 100);

  const { rows } = await executeFixed(QUERIES.priceHistoryByBarcode, [barcode, limit]);
  return {
    status: 200,
    payload: {
      prices: rows.map((r) => ({
        price: Number(r[0]),
        storeName: String(r[1] ?? ''),
        scannedAt: String(r[2] ?? ''),
      })),
    },
  };
}

async function opDeals(body) {
  const fsa = validFsa(body.fsa);
  if (!fsa) return { status: 400, payload: { error: 'fsa must be a 3-character forward sortation area' } };
  const limit = validLimit(body.limit, 1000, 2000);

  const { rows } = await executeFixed(QUERIES.dealsByFsa, [`${fsa}%`, limit]);
  return {
    status: 200,
    payload: {
      deals: rows.map((r) => ({
        merchant: String(r[0] ?? ''),
        name: String(r[1] ?? ''),
        price: String(r[2] ?? ''),
        price_real: r[3] != null ? Number(r[3]) : null,
        image_url: r[4] != null ? String(r[4]) : null,
        valid_to: String(r[5] ?? ''),
      })),
    },
  };
}

async function opStorePrices(body) {
  const storeId = validStoreId(body.storeId);
  if (!storeId) return { status: 400, payload: { error: 'storeId must be a lowercase slug' } };
  const limit = validLimit(body.limit, 200, 500);

  const { columns, rows } = await executeFixed(QUERIES.storePricesByStore, [storeId, limit]);
  return {
    status: 200,
    payload: {
      columns,
      rows,
    },
  };
}

async function opStoreBranding() {
  const { rows } = await executeFixed(QUERIES.storeBranding, []);
  return {
    status: 200,
    payload: {
      branding: rows
        .map((r) => ({
          store_id: String(r[0] ?? ''),
          store_name: String(r[1] ?? ''),
          logo_url: r[2] != null ? String(r[2]) : null,
          color: r[3] != null ? String(r[3]) : null,
        }))
        .filter((b) => b.store_id),
    },
  };
}

async function opSubmitProduct(body) {
  const barcode = validBarcode(body.barcode);
  if (!barcode) return { status: 400, payload: { error: 'barcode must be 6-18 digits' } };

  const productName = validText(body.productName, 200);
  if (!productName) return { status: 400, payload: { error: 'productName is required' } };

  await executeFixed(QUERIES.insertProduct, [
    barcode,
    productName,
    validText(body.brand, 100),
    validText(body.category, 100),
    validText(body.quantityLabel, 60),
    validText(body.rawInput, 200),
    body.aiCleaned ? 1 : 0,
  ]);

  // Optional price observation submitted alongside the product. The product
  // INSERT runs first because product_prices.barcode is a foreign key to it.
  const price = body.price;
  if (price && typeof price === 'object') {
    const amount = typeof price.amount === 'number' ? price.amount : NaN;
    const storeName = validText(price.storeName, 100);
    const storeId = validStoreId(price.storeId);

    if (Number.isFinite(amount) && amount >= 0 && amount < 1e6 && storeName && storeId) {
      await executeFixed(QUERIES.insertProductPrice, [barcode, amount, storeName, storeId]);
    } else {
      // Bad price data does not lose the product write that already landed.
      return { status: 200, payload: { ok: true, priceRejected: true } };
    }
  }

  return { status: 200, payload: { ok: true } };
}

/** path suffix → handler. The complete surface. */
const OPERATIONS = {
  'product': { method: 'POST', run: opProduct },
  'price-history': { method: 'POST', run: opPriceHistory },
  'deals': { method: 'POST', run: opDeals },
  'store-prices': { method: 'POST', run: opStorePrices },
  'store-branding': { method: 'GET', run: opStoreBranding },
  'product-submit': { method: 'POST', run: opSubmitProduct },
};

// ─── Handler ────────────────────────────────────────────────────────────────

/**
 * Handle /api/catalog/* requests.
 *
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {Map<string, object>} enrolledDevices - relayToken → enrollment
 */
async function handleCatalogRequest(req, res, enrolledDevices) {
  res.setHeader('Content-Type', 'application/json');

  const pathname = (req.url || '').split('?')[0];
  const op = pathname.replace(/^\/api\/catalog\//, '').replace(/\/+$/, '');
  const operation = OPERATIONS[op];

  if (!operation) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Unknown catalog operation' }));
    return;
  }

  if (req.method !== operation.method) {
    res.writeHead(405);
    res.end(JSON.stringify({ error: `Expected ${operation.method}` }));
    return;
  }

  // 1. Authenticate — same Bearer relayToken as /api/extract/flyer.
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Missing or invalid Authorization header. Expected: Bearer <relayToken>' }));
    return;
  }

  const relayToken = authHeader.slice('Bearer '.length).trim();
  const enrollment = enrolledDevices.get(relayToken);

  if (!enrollment) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Invalid relay token' }));
    return;
  }

  if (Date.now() > enrollment.expiresAt) {
    enrolledDevices.delete(relayToken);
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Relay token has expired' }));
    return;
  }

  // 2. Rate limit per device.
  if (!checkCatalogRateLimit(enrollment.deviceId)) {
    res.writeHead(429);
    res.end(JSON.stringify({
      error: `Catalog rate limit exceeded. Max ${CATALOG_RATE_LIMIT} requests per minute per device.`,
    }));
    return;
  }

  // 3. Fail closed when the relay operator has not provisioned Turso. The
  //    error names the variables but of course never their values.
  if (!isCatalogConfigured()) {
    res.writeHead(503);
    res.end(JSON.stringify({
      error: 'Product catalog is not configured on this relay. Set TURSO_URL and TURSO_TOKEN in the relay environment.',
    }));
    return;
  }

  // 4. Body (small — these are scalars, not images).
  let body = {};
  if (operation.method === 'POST') {
    const raw = await collectBody(req, 64 * 1024);
    if (raw === null) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: 'Request body too large (max 64KB)' }));
      return;
    }
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Body must be a JSON object' }));
      return;
    }
  }

  // 5. Run it.
  try {
    const { status, payload } = await operation.run(body);
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  } catch (err) {
    // Upstream detail is logged, never returned — an upstream error body can
    // echo the request, and the Authorization header is in the request.
    console.warn(`[catalog] ${op} failed: ${err.message}`);
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'Catalog upstream request failed' }));
  }
}

/**
 * Collect a bounded request body.
 *
 * @param {object} req
 * @param {number} maxBytes
 * @returns {Promise<string|null>} null when the limit is exceeded
 */
function collectBody(req, maxBytes) {
  return new Promise((resolve) => {
    const declared = req.headers['content-length'];
    if (declared && parseInt(declared, 10) > maxBytes) {
      resolve(null);
      return;
    }

    let body = '';
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      body += chunk;
    });

    req.on('end', () => resolve(body));
    req.on('error', () => resolve(null));
  });
}

module.exports = {
  handleCatalogRequest,
  // exported for tests
  _validators: { validBarcode, validFsa, validStoreId, validLimit, validText },
  _operations: OPERATIONS,
};

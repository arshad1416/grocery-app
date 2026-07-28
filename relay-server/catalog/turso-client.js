/**
 * Server-side Turso client — the ONLY place in this project that holds a
 * Turso credential.
 *
 * ⚠️  READ THIS BEFORE CHANGING ANYTHING HERE  ⚠️
 *
 * A read-write Turso token used to ship inside the mobile app as a
 * client-side fallback (`settings.tursoToken || '<literal>'`, later
 * `settings.tursoToken || process.env.EXPO_PUBLIC_TURSO_TOKEN`). Both shapes
 * are extractable from a built APK with nothing but `unzip` and `strings` —
 * demonstrated by bundling with `EXPO_PUBLIC_TURSO_TOKEN` set and finding the
 * value verbatim in the minified bundle. See GOAL_PROMPT_NOTES.md.
 *
 * The credential therefore lives here, in the relay's process environment,
 * and nowhere else:
 *   - NEVER commit a token to this repository, in any file, for any reason.
 *   - NEVER expose it through an endpoint, a health check, or an error body.
 *   - NEVER reintroduce an `EXPO_PUBLIC_*` Turso variable — Expo inlines every
 *     `EXPO_PUBLIC_*` value into the client bundle at build time.
 *
 * This module deliberately exposes NO general query function to callers
 * outside `catalog-server.js`. Every statement is a fixed, parameterised
 * string defined in this file. A general SQL passthrough would be the same
 * read-write credential behind a different hostname.
 *
 * @module catalog/turso-client
 */

const TURSO_TIMEOUT_MS = parseInt(process.env.TURSO_TIMEOUT_MS || '10000', 10);

/**
 * Read Turso connection details from the process environment.
 *
 * @returns {{url: string, token: string}|null} null when not provisioned
 */
function getTursoConfig() {
  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/** True when the relay has been given Turso credentials. */
function isCatalogConfigured() {
  return getTursoConfig() !== null;
}

/**
 * Execute one fixed, parameterised statement against Turso.
 *
 * Not exported for general use — `catalog-server.js` is the only caller, and
 * every `sql` value it passes is a literal defined in this module's QUERIES.
 *
 * @param {string} sql   Fixed statement text. Never built from request input.
 * @param {Array<string|number|null>} args Positional parameters.
 * @returns {Promise<{columns: string[], rows: Array<Array<any>>}>}
 */
async function executeFixed(sql, args = []) {
  const config = getTursoConfig();
  if (!config) {
    throw new Error('Turso is not provisioned on this relay');
  }

  const res = await fetch(`${config.url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args } }],
    }),
    signal: AbortSignal.timeout(TURSO_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Deliberately does NOT include the response body: an upstream error page
    // could echo request headers, and the Authorization header is in them.
    throw new Error(`Turso HTTP ${res.status}`);
  }

  const data = await res.json();
  const result = data.results && data.results[0];

  if (!result || result.type === 'error') {
    throw new Error('Turso query failed');
  }

  const columns = (result.response && result.response.cols || []).map((c) => c.name);
  const rows = (result.response && result.response.rows || []).map((r) => r.columns);
  return { columns, rows };
}

// ─── The complete set of statements this relay will ever run ────────────────
//
// Adding one is a deliberate act. Each is a fixed string; request input only
// ever reaches Turso as a bound positional parameter.

const QUERIES = {
  productByBarcode:
    'SELECT product_name, brand, category, image_url, quantity_label ' +
    'FROM products WHERE barcode = ? LIMIT 1',

  priceHistoryByBarcode:
    'SELECT price, store_name, scanned_at FROM product_prices ' +
    'WHERE barcode = ? ORDER BY scanned_at DESC LIMIT ?',

  dealsByFsa:
    'SELECT merchant, name, price, price_real, image_url, valid_to ' +
    'FROM flipp_deals ' +
    "WHERE postal_code LIKE ? AND valid_to >= datetime('now') " +
    'ORDER BY merchant, price_real ASC LIMIT ?',

  storePricesByStore:
    'SELECT store_id, store_name, name, name_clean, price, price_real, ' +
    'unit_price, unit_price_real, unit, image_url, scraped_at ' +
    'FROM store_prices ' +
    "WHERE store_id = ? AND scraped_at > datetime('now', '-7 days') " +
    'ORDER BY scraped_at DESC LIMIT ?',

  storeBranding:
    'SELECT store_id, store_name, logo_url, color FROM store_branding LIMIT 500',

  insertProduct:
    'INSERT INTO products ' +
    '(barcode, product_name, brand, category, quantity_label, source, raw_input, ai_cleaned) ' +
    "VALUES (?, ?, ?, ?, ?, 'user', ?, ?) " +
    'ON CONFLICT(barcode) DO UPDATE SET ' +
    "product_name = excluded.product_name, brand = excluded.brand, " +
    'category = excluded.category, quantity_label = excluded.quantity_label, ' +
    "raw_input = excluded.raw_input, updated_at = datetime('now')",

  insertProductPrice:
    'INSERT INTO product_prices ' +
    '(barcode, price, store_name, store_id, scanned_at, submitted_by) ' +
    "VALUES (?, ?, ?, ?, datetime('now'), 'relay')",
};

module.exports = {
  getTursoConfig,
  isCatalogConfigured,
  executeFixed,
  QUERIES,
};

# Barcode Scanner + Product Database Feature

## What Was Built

### New Files

| File | Purpose |
|------|---------|
| `src/types/product.ts` | ProductInfo, ScanResult, NewProductSubmission types |
| `src/services/productCache.ts` | In-memory session cache (max 200 items) |
| `src/services/catalogClient.ts` | Client for the relay's `/api/catalog/*` endpoints (no DB credential) |
| `relay-server/catalog/turso-client.js` | **Relay-side** Turso client — the only place a token exists |
| `relay-server/catalog/catalog-server.js` | The six fixed catalog operations; no SQL passthrough |
| `relay-server/catalog/migrations.js` | SQL migrations for `products` + `product_prices` tables |
| `src/services/productLookup.ts` | Lookup chain: cache → relay catalog → Open Food Facts → USDA |
| `src/services/aiCleanup.ts` | Heuristic + AI product name normalization (MiMo via OpenCode Go) |
| `src/components/BarcodeScannerScreen.tsx` | Full-screen barcode scanner (expo-camera, EAN-13/UPC) |

### Modified Files

| File | Change |
|------|--------|
| `src/types/index.ts` | Added `tursoEnabled` to AppSettings (catalog on/off) |
| `App.tsx` | No database client is initialised — catalog calls go through the relay |
| `src/screens/AddItemSheet.tsx` | Scan button, scanner overlay, lookup, new-product form |

---

## What You Need to Do to Activate

### 1. Install expo-camera (barcode scanning)

```bash
npx expo install expo-camera
```

This is the same library already used dynamically in `CameraScanner.tsx`. Installing it makes the real camera available.

### 2. Create a Turso database (operator step — never the app)

```bash
# Install Turso CLI
curl -sSfL https://get.turso.tech/install.sh | bash

# Login
turso auth login

# Create a database for PantryRun products
turso db create pantryrun-products

# Get the database URL + token
turso db show pantryrun-products --url      # → https://pantryrun-products-<org>.turso.io
turso db tokens create pantryrun-products --read-only   # prefer read-only where the product allows

# Initialize the schema
turso db shell pantryrun-products < schema.sql
```

### 3. Apply the schema

The statements below also live in `relay-server/catalog/migrations.js`. Run
them against your Turso DB to create the tables:

```sql
CREATE TABLE IF NOT EXISTS products (
  barcode        TEXT PRIMARY KEY,
  product_name   TEXT NOT NULL,
  brand          TEXT,
  category       TEXT,
  image_url      TEXT,
  quantity_label TEXT,
  source         TEXT NOT NULL DEFAULT 'user',
  raw_input      TEXT,
  ai_cleaned     INTEGER DEFAULT 0,
  first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_prices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode      TEXT NOT NULL REFERENCES products(barcode),
  price        REAL NOT NULL,
  store_name   TEXT NOT NULL,
  store_id     TEXT NOT NULL,
  quantity     REAL,
  unit         TEXT,
  scanned_at   TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_prices_barcode ON product_prices(barcode);
CREATE INDEX IF NOT EXISTS idx_prices_scanned ON product_prices(scanned_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
```

### 4. Get a USDA API key (free)

Sign up at https://fdc.nal.usda.gov/api-key-signup.html — instant, no wait.

Then add to `.env`:
```
EXPO_PUBLIC_USDA_API_KEY=your_key_here
EXPO_PUBLIC_AI_CLEANUP_URL=https://opencode.ai/zen/go/v1/chat/completions
EXPO_PUBLIC_AI_CLEANUP_KEY=your_opencode_go_key
```

### 5. Set the Turso credentials on the RELAY — never in the app

```bash
# On the relay host only. These never appear in this repository, in a .env
# that is committed, or in any EXPO_PUBLIC_* variable.
TURSO_URL=https://pantryrun-products-<org>.turso.io
TURSO_TOKEN=<token>
```

⚠️ **Do not add a Turso URL or token field to SettingsScreen, and do not
introduce an `EXPO_PUBLIC_*` variable carrying either.** An earlier build did
both. Expo inlines
every `EXPO_PUBLIC_*` value into the JS bundle at build time, and a value in
app settings ends up in the bundle or on the device either way — both are
extractable from a shipped APK with `unzip` and `strings`. A read-write token
committed this way is why the credentials in this repo's history had to be
revoked. See `GOAL_PROMPT_NOTES.md`.

---

## Architecture Diagram

```
User scans barcode (expo-camera → ML Kit)
        │
        ▼
BarcodeScannerScreen ── onScan(barcode) ──► AddItemSheet
                                               │
                                               ▼
                                        lookupProduct(barcode)
                                               │
                                    ┌──────────┼──────────┐
                                    ▼          ▼          ▼
                               In-memory   Relay       Open Food Facts
                                cache      /api/catalog (free, no key)
                                (session   (your products)  │
                                 only)                      ▼
                                                         USDA
                                                         (free fallback)
                                               │
                                    ┌──────────┘
                                    ▼
                              Found? ──Yes──► Pre-fill form
                                │
                                No
                                │
                                ▼
                         Show "New Product"
                         form → user types name
                                │
                                ▼
                         submitNewProduct()
                                │
                                ▼
                          AI Cleanup → POST /api/catalog/product-submit
                          (heuristic + MiMo)   (relay writes to Turso)
```

## Edge Cases Handled

1. **Camera not available** → falls back to manual barcode entry (type digits)
2. **No network** → cache hit works, otherwise shows error
3. **Relay catalog unavailable** → lookup still works (OFF + USDA), save disabled
4. **Product not in any DB** → new product form, user enters name
5. **All-caps names** → AI cleanup normalizes to title case
6. **Rapid scanning** → `scanned` flag prevents duplicate triggers
7. **Non-retail barcodes** → regex validates 8-14 digit codes only

## What's Not Built (For Your Next Session)

1. ~~Turso settings UI in SettingsScreen (URL + token fields)~~ — **deliberately
   never building this.** The app holds no database credential; see step 5.
2. **Schema auto-migration** on relay start (the `migrations` table check)
3. **AI cleanup server endpoint** (currently configured to hit OpenCode Go API directly — a Cloudflare Worker wrapper would be cleaner)
4. **Price history view** in ItemEditScreen (data is stored, UI not wired)
5. **expo-camera install** — you need to `npx expo install expo-camera`
6. **Turso database creation** — via CLI, by the relay operator

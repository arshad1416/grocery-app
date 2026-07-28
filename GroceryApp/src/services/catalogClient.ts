/**
 * CatalogClient — product/deal/price lookups via the relay's /api/catalog/*
 * endpoints.
 *
 * This module replaces the former `tursoClient.ts`, which opened a direct
 * connection from the app to Turso using a token the app itself held. That
 * token shipped inside the built APK: first as a hardcoded literal, later as
 * a user-settings value falling back to a build-time `EXPO_PUBLIC_*`
 * variable. Both are extractable with `unzip` + `strings` — Expo inlines
 * every `EXPO_PUBLIC_*` value into the client bundle at build time, so the
 * second shape was the same exposure with extra steps.
 *
 * ⚠️  THE CLIENT HOLDS NO DATABASE CREDENTIAL, AND MUST NEVER HOLD ONE.  ⚠️
 * The Turso credential lives only in the relay's process environment. Do not
 * add database URL or token settings, an `EXPO_PUBLIC_*` variable carrying
 * either, or any other client-side database credential path. See
 * GOAL_PROMPT_NOTES.md.
 *
 * ⚠️  PRIVACY — THIS CHANNEL IS NOT ZERO-KNOWLEDGE  ⚠️
 * Barcodes, postal FSA prefixes, and store identifiers travel to the relay in
 * plaintext (over TLS), so the relay operator can see them. The
 * zero-knowledge guarantee (AC-11) covers only the Yjs + libsodium grocery
 * list sync path. Same posture as the flyer extraction channel — see
 * `src/pricing/relay-extractor.ts`.
 *
 * Never throws. Every call returns null / an empty result on failure so the
 * lookup chain falls through to its next source.
 */

import { getSettings } from '../config/settings';
import { getRelayToken } from '../identity/enroll';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CatalogProduct {
  barcode: string;
  productName: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  quantityLabel: string | null;
}

export interface CatalogPricePoint {
  price: number;
  storeName: string;
  scannedAt: string;
}

export interface CatalogDeal {
  merchant: string;
  name: string;
  price: string;
  price_real: number | null;
  image_url: string | null;
  valid_to: string;
}

export interface CatalogBranding {
  store_id: string;
  store_name: string;
  logo_url: string | null;
  color: string | null;
}

/** Shape the store-prices adapter consumes — column names plus raw rows. */
export interface CatalogRowSet {
  columns: string[];
  rows: any[][];
}

export interface CatalogProductSubmission {
  barcode: string;
  productName: string;
  brand?: string | null;
  category?: string | null;
  quantityLabel?: string | null;
  rawInput?: string | null;
  aiCleaned?: boolean;
  /** Optional price observation recorded alongside the product. */
  price?: {
    amount: number;
    storeName: string;
    storeId: string;
  };
}

// ─── Endpoint resolution ─────────────────────────────────────────────────────

const CATALOG_TIMEOUT_MS = 10_000;

/**
 * Build the relay's HTTP base URL from settings.
 *
 * Mirrors the helper in `src/pricing/relay-extractor.ts`. The two are
 * deliberately not shared yet — consolidating them touches the flyer path,
 * which is outside this change's scope.
 */
function getRelayHttpBaseUrl(): string | null {
  try {
    const settings = getSettings();
    if (!settings.relayUrl) return null;

    const httpUrl = settings.relayUrl
      .replace(/^ws:/, 'http:')
      .replace(/^wss:/, 'https:');

    const hasPort = /:\d+/.test(httpUrl.replace(/^https?:\/\//, ''));
    if (hasPort) return httpUrl;
    return `${httpUrl}:${settings.relayPort || 8080}`;
  } catch {
    // getSettings() throws before initSettings() has run.
    return null;
  }
}

/**
 * Whether catalog lookups should be attempted at all.
 *
 * Synchronous, because it replaces the old `isTursoReady()` gate at call
 * sites that cannot await. It reports intent — the user has catalog features
 * on and a relay is configured — not reachability. An unreachable relay or an
 * unenrolled device surfaces as an empty result from the call itself.
 *
 * This is also what makes the "Flipp Deal Matching" toggle real: with it off,
 * no catalog request is issued at all. It previously gated nothing.
 */
export function isCatalogAvailable(): boolean {
  try {
    const settings = getSettings();
    if (settings.tursoEnabled === false) return false;
    return getRelayHttpBaseUrl() !== null;
  } catch {
    return false;
  }
}

// ─── Transport ───────────────────────────────────────────────────────────────

/**
 * POST/GET a catalog operation. Returns null on any failure.
 */
async function callCatalog<T>(
  operation: string,
  body?: Record<string, unknown>,
): Promise<T | null> {
  if (!isCatalogAvailable()) return null;

  const baseUrl = getRelayHttpBaseUrl();
  if (!baseUrl) return null;

  let relayToken: string | null = null;
  try {
    relayToken = await getRelayToken();
  } catch {
    return null;
  }
  if (!relayToken) return null;

  try {
    const res = await fetch(`${baseUrl}/api/catalog/${operation}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    });

    if (!res.ok) {
      if (res.status === 503) {
        console.warn('[catalog] Relay has no product catalog configured');
      }
      return null;
    }

    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Public operations ───────────────────────────────────────────────────────

/** Look up a single product by barcode. */
export async function fetchProduct(barcode: string): Promise<CatalogProduct | null> {
  const data = await callCatalog<{ product: CatalogProduct | null }>('product', { barcode });
  return data?.product ?? null;
}

/** Recent price observations for a barcode, newest first. */
export async function fetchPriceHistory(
  barcode: string,
  limit = 20,
): Promise<CatalogPricePoint[]> {
  const data = await callCatalog<{ prices: CatalogPricePoint[] }>('price-history', {
    barcode,
    limit,
  });
  return data?.prices ?? [];
}

/** Current flyer deals for a forward sortation area. */
export async function fetchDeals(fsa: string): Promise<CatalogDeal[]> {
  const data = await callCatalog<{ deals: CatalogDeal[] }>('deals', { fsa });
  return data?.deals ?? [];
}

/** Recent shelf prices for one store. */
export async function fetchStorePrices(
  storeId: string,
  limit = 200,
): Promise<CatalogRowSet | null> {
  return callCatalog<CatalogRowSet>('store-prices', { storeId, limit });
}

/** All known store branding rows. */
export async function fetchStoreBranding(): Promise<CatalogBranding[]> {
  const data = await callCatalog<{ branding: CatalogBranding[] }>('store-branding');
  return data?.branding ?? [];
}

/** Contribute a product record. Returns true when the relay accepted it. */
export async function submitProduct(
  submission: CatalogProductSubmission,
): Promise<boolean> {
  const data = await callCatalog<{ ok: boolean }>('product-submit', {
    barcode: submission.barcode,
    productName: submission.productName,
    brand: submission.brand ?? null,
    category: submission.category ?? null,
    quantityLabel: submission.quantityLabel ?? null,
    rawInput: submission.rawInput ?? null,
    aiCleaned: submission.aiCleaned ?? false,
    ...(submission.price ? { price: submission.price } : {}),
  });
  return data?.ok === true;
}

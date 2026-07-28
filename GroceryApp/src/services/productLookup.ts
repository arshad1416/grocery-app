/**
 * ProductLookup — the lookup chain for barcode product data.
 *
 * Order: in-memory cache → relay catalog → Open Food Facts API → USDA API
 *
 * Results are cached in-memory so repeated scans of the same item
 * in one session are instant. The relay-backed catalog is the long-term
 * persistent cache. Open Food Facts and USDA are free external sources.
 *
 * The catalog was formerly queried directly from the app with a Turso token
 * the app itself carried. It now goes through the relay's /api/catalog/*
 * endpoints and the app holds no database credential — see
 * src/services/catalogClient.ts.
 */

import { getCachedProduct, setCachedProduct } from './productCache';
import {
  isCatalogAvailable,
  fetchProduct,
  fetchPriceHistory,
  submitProduct,
} from './catalogClient';
import { cleanProductName } from './aiCleanup';
import type { ProductInfo, CleanedProduct, NewProductSubmission, ScanResult } from '../types/product';

// ─── Config ──────────────────────────────────────────────────────────────────

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? '';

// ─── External API helpers ─────────────────────────────────────────────────────

/** Look up a product via Open Food Facts. Free, no key, 15 req/min. */
async function lookupOpenFoodFacts(barcode: string): Promise<ProductInfo | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.status === 429) {
      console.warn('[productLookup] Open Food Facts rate limited (429). Backing off.');
      return null;
    }
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    return {
      barcode,
      productName: p.product_name || p.product_name_en || 'Unknown Product',
      brand: p.brands || undefined,
      category: p.categories ? p.categories.split(',').map((c: string) => c.trim()).filter(Boolean)[0] : undefined,
      imageUrl: p.image_url || undefined,
      quantityLabel: p.quantity || undefined,
      source: 'open_food_facts',
    };
  } catch {
    return null;
  }
}

/** Look up a product via USDA FoodData Central. Free, needs API key. */
async function lookupUSDA(barcode: string): Promise<ProductInfo | null> {
  if (!USDA_API_KEY) return null;

  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(barcode)}&api_key=${USDA_API_KEY}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.foods || data.foods.length === 0) return null;

    const p = data.foods[0];
    // USDA returns GTIN/UPC in the foodCode or gtinUpc field
    return {
      barcode,
      productName: p.description || 'Unknown Product',
      brand: p.brandName || undefined,
      category: p.foodCategory ? p.foodCategory.split(',').map((c: string) => c.trim())[0] : undefined,
      quantityLabel: p.servingSize
        ? `${p.servingSize} ${p.servingSizeUnit ?? 'g'}`
        : undefined,
      source: 'usda',
    };
  } catch {
    return null;
  }
}

/** Look up in the relay catalog (user-contributed products). */
async function lookupCatalog(barcode: string): Promise<ProductInfo | null> {
  if (!isCatalogAvailable()) return null;

  const product = await fetchProduct(barcode);
  if (!product) return null;

  return {
    barcode,
    productName: product.productName || 'Unknown Product',
    brand: product.brand ?? undefined,
    category: product.category ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    quantityLabel: product.quantityLabel ?? undefined,
    source: 'turso',
  };
}

// ─── Main public functions ───────────────────────────────────────────────────

/**
 * Look up a product by barcode through the full chain.
 * Results are cached in-memory regardless of source.
 */
export async function lookupProduct(barcode: string): Promise<ScanResult> {
  // 1. In-memory cache
  const cached = getCachedProduct(barcode);
  if (cached) return { status: 'found', product: cached };

  try {
    let product: ProductInfo | null = null;

    // 2. Relay catalog (user-contributed)
    if (!product) product = await lookupCatalog(barcode);

    // 3. Open Food Facts (free, no key)
    if (!product) product = await lookupOpenFoodFacts(barcode);

    // 4. USDA (free fallback)
    if (!product) product = await lookupUSDA(barcode);

    if (product) {
      setCachedProduct(product);
      return { status: 'found', product };
    }

    return { status: 'not_found', barcode };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown lookup error';
    return { status: 'lookup_error', barcode, error: errorMsg };
  }
}

/**
 * Save a user-submitted product through the relay catalog.
 * The raw name is passed through AI cleanup before storing.
 */
export async function submitNewProduct(submission: NewProductSubmission): Promise<CleanedProduct> {
  if (!isCatalogAvailable()) {
    throw new Error(
      'Product catalog is unavailable. Check that your relay is reachable and that Product Catalog Lookups are enabled in Settings.',
    );
  }

  // AI cleanup — normalize the raw name
  const cleaned = await cleanProductName(submission.rawName);

  const product: CleanedProduct = {
    barcode: submission.barcode,
    productName: cleaned.productName || submission.rawName.trim(),
    brand: cleaned.brand ?? submission.brand ?? null,
    category: cleaned.category ?? submission.category ?? null,
    imageUrl: null,
    quantityLabel: submission.quantityLabel ?? cleaned.quantityLabel ?? null,
    source: 'turso',
    rawInput: submission.rawName.trim(),
    aiCleaned: true,
    firstSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Write through the relay. The client no longer issues SQL: the relay owns
  // the statements and the credential (see relay-server/catalog/).
  const accepted = await submitProduct({
    barcode: product.barcode,
    productName: product.productName,
    brand: product.brand,
    category: product.category,
    quantityLabel: product.quantityLabel,
    rawInput: product.rawInput,
    aiCleaned: true,
    price: submission.price
      ? {
          amount: submission.price.amount,
          storeName: submission.price.storeName,
          storeId: submission.price.storeId,
        }
      : undefined,
  });

  if (!accepted) {
    throw new Error('The relay could not save this product. Please try again.');
  }

  // Cache the result for this session
  setCachedProduct({
    barcode: product.barcode,
    productName: product.productName,
    brand: product.brand ?? undefined,
    category: product.category ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    quantityLabel: product.quantityLabel ?? undefined,
    source: 'turso',
  });

  return product;
}

/**
 * Load recent price history for a product from the relay catalog.
 */
export async function getPriceHistory(
  barcode: string,
  limit = 20,
): Promise<{ price: number; storeName: string; scannedAt: string }[]> {
  if (!isCatalogAvailable()) return [];
  return fetchPriceHistory(barcode, limit);
}

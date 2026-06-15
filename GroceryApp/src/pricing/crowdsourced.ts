/**
 * Price Subsystem — Crowd-Sourced Adapter.
 *
 * Full implementation of the PriceAdapter interface using locally submitted
 * prices from family members. Prices are stored in-memory (Map) keyed by
 * normalized item name and store ID.
 *
 * Confidence scoring:
 *   - 0 submissions        → not available
 *   - 1-2 submissions      → estimated
 *   - 3-5 submissions      → recent
 *   - 5+ submissions       → real_time
 */

import type { PriceAdapter } from './adapter';
import type {
  PriceResult,
  PriceSourceTier,
  ConfidenceLevel,
  SubmittedPrice,
} from './types';
import { normalizeUnitPrice } from './normalizer';
import { generateUUID } from '../crypto';

// ─── Types ─────────────────────────────────────────────────────────────────

type StorePriceMap = Map<string, SubmittedPrice[]>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeItemName(name: string): string {
  return name.toLowerCase().trim();
}

function getConfidenceLevel(count: number): ConfidenceLevel {
  if (count >= 5) return 'real_time';
  if (count >= 3) return 'recent';
  if (count >= 1) return 'estimated';
  return 'estimated';
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class CrowdsourcedAdapter implements PriceAdapter {
  id = 'crowdsourced';
  name = 'Crowd-Sourced';
  tier: PriceSourceTier = 'crowd';

  /**
   * Internal price store: storeId → (normalizedItemName → SubmittedPrice[])
   */
  private prices: Map<string, StorePriceMap> = new Map();

  /** Maximum age of submissions to consider (30 days in ms) */
  private readonly maxAgeMs = 30 * 24 * 60 * 60 * 1000;

  isAvailable(): boolean {
    return true; // always available locally
  }

  /**
   * Submit a price from a user. Automatically generates id and timestamp.
   */
  async submitPrice(
    price: Omit<SubmittedPrice, 'id' | 'timestamp'>,
  ): Promise<void> {
    const id = await generateUUID();
    const submission: SubmittedPrice = {
      ...price,
      id,
      timestamp: Date.now(),
    };

    const storeId = price.storeId;
    const key = normalizeItemName(price.itemName);

    if (!this.prices.has(storeId)) {
      this.prices.set(storeId, new Map());
    }
    const storeMap = this.prices.get(storeId)!;

    if (!storeMap.has(key)) {
      storeMap.set(key, []);
    }
    storeMap.get(key)!.push(submission);
  }

  /**
   * Get price for an item by aggregating submissions from the last 30 days.
   */
  async getPrice(
    itemName: string,
    storeId: string,
  ): Promise<PriceResult | null> {
    const key = normalizeItemName(itemName);
    const storeMap = this.prices.get(storeId);
    if (!storeMap) return null;

    const submissions = storeMap.get(key);
    if (!submissions || submissions.length === 0) return null;

    // Filter to last 30 days
    const cutoff = Date.now() - this.maxAgeMs;
    const recent = submissions.filter((s) => s.timestamp >= cutoff);

    if (recent.length === 0) return null;

    // Use median price (more robust than mean)
    const prices = recent.map((s) => s.price).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];

    // Average unit/quantity for normalization
    const avgQuantity =
      recent.reduce((sum, s) => sum + s.quantity, 0) / recent.length;
    const unit = recent[0].unit;

    const { unitPrice, displayUnit } = normalizeUnitPrice(
      medianPrice,
      avgQuantity,
      unit,
    );

    return {
      price: medianPrice,
      unitPrice,
      unit,
      displayUnit,
      saleInfo: null, // crowd-sourced can't detect sales
      source: {
        adapterId: this.id,
        tier: this.tier,
        storeId,
        storeName: recent[0].storeName,
      },
      timestamp: Math.max(...recent.map((s) => s.timestamp)),
      confidence: getConfidenceLevel(recent.length),
    };
  }

  /**
   * Get prices for multiple items.
   */
  async getPrices(
    items: string[],
    storeId: string,
  ): Promise<Map<string, PriceResult>> {
    const results = new Map<string, PriceResult>();
    for (const item of items) {
      const price = await this.getPrice(item, storeId);
      if (price) {
        results.set(item, price);
      }
    }
    return results;
  }

  /**
   * Get price history for an item.
   */
  async getPriceHistory(
    itemName: string,
    storeId: string,
    days: number,
  ): Promise<PriceResult[]> {
    const key = normalizeItemName(itemName);
    const storeMap = this.prices.get(storeId);
    if (!storeMap) return [];

    const submissions = storeMap.get(key);
    if (!submissions) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = submissions.filter((s) => s.timestamp >= cutoff);
    const unit = recent.length > 0 ? recent[0].unit : 'each';

    return recent.map((s) => {
      const { unitPrice, displayUnit } = normalizeUnitPrice(s.price, s.quantity, unit);
      return {
        price: s.price,
        unitPrice,
        unit,
        displayUnit,
        saleInfo: null,
        source: {
          adapterId: this.id,
          tier: this.tier,
          storeId,
          storeName: s.storeName,
        },
        timestamp: s.timestamp,
        confidence: getConfidenceLevel(1),
      };
    });
  }

  /**
   * Scan a receipt image for prices.
   * Placeholder — OCR not yet implemented.
   */
  async scanReceipt(
    _imageUri: string,
  ): Promise<SubmittedPrice[]> {
    console.log('OCR not yet implemented — scanReceipt is a placeholder');
    return [];
  }

  /**
   * Clear all stored prices (for testing / user request).
   */
  clearAllPrices(): void {
    this.prices.clear();
  }

  /**
   * Get list of stores that have crowd-sourced price data.
   */
  async getAvailableStores(): Promise<{ storeId: string; storeName: string }[]> {
    const stores: { storeId: string; storeName: string }[] = [];
    for (const [storeId, itemMap] of this.prices) {
      if (itemMap.size > 0) {
        // Get store name from first submission
        const items = Array.from(itemMap.values());
        const firstItem = items.find(arr => arr.length > 0);
        const name = firstItem && firstItem[0] ? firstItem[0].storeName : storeId;
        stores.push({ storeId, storeName: name });
      }
    }
    return stores.sort((a, b) => a.storeName.localeCompare(b.storeName));
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const crowdsourcedAdapter = new CrowdsourcedAdapter();
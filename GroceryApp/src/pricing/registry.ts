/**
 * Price Subsystem — Adapter Registry.
 *
 * Manages the chain of price adapters with fallback:
 *   official → crowd → scraping
 *
 * Each adapter can be individually enabled/disabled by the user via Settings.
 * The enabled state is stored in encrypted settings.
 */

import type { PriceAdapter } from './adapter';
import type { PriceResult } from './types';
import { getSettings, updateSettings } from '../config/settings';
import { adapterRequiresHash, normalizeForLookup, hashItemName } from './privacy';
import { instacartAdapter } from './instacart';
import { scrapingAdapter } from './scraping';
import { crowdsourcedAdapter } from './crowdsourced';
import { cloudFlyerAdapter } from './cloud-flyer';
import { flyerScanAdapter } from './flyer-scan';
import { flippDealsAdapter } from './flipp-deals-adapter';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AdapterEnableMap = Record<string, boolean>;

// ─── Registry ───────────────────────────────────────────────────────────────

class PriceRegistry {
  private adapters: PriceAdapter[] = [];

  constructor() {
    this.registerAdapter(instacartAdapter);
    this.registerAdapter(scrapingAdapter);
    this.registerAdapter(crowdsourcedAdapter);
    this.registerAdapter(cloudFlyerAdapter);
    this.registerAdapter(flyerScanAdapter);
    this.registerAdapter(flippDealsAdapter);
    this.seedMockPrices();
  }

  private seedPromise: Promise<void> | null = null;

  private seedMockPrices() {
    const stores = [
      { id: 'no-frills', name: 'No Frills' },
      { id: 'loblaws', name: 'Loblaws' },
      { id: 'freshco', name: 'FreshCo' },
      { id: 'metro', name: 'Metro' },
      { id: 'walmart', name: 'Walmart' },
      { id: 'food-basics', name: 'Food Basics' },
    ];
    const items = [
      { name: 'Apples', unit: 'pcs', quantity: 6, prices: { 'no-frills': 1.99, 'loblaws': 3.49, 'freshco': 2.29, 'metro': 2.99, 'walmart': 2.49, 'food-basics': 2.09 } },
      { name: 'Bananas', unit: 'bunch', quantity: 1, prices: { 'no-frills': 1.19, 'loblaws': 1.79, 'freshco': 1.25, 'metro': 1.49, 'walmart': 1.29, 'food-basics': 1.15 } },
      { name: 'Milk', unit: 'L', quantity: 1, prices: { 'no-frills': 3.89, 'loblaws': 4.49, 'freshco': 3.95, 'metro': 4.29, 'walmart': 3.99, 'food-basics': 3.79 } },
      { name: 'Tomatoes', unit: 'pcs', quantity: 4, prices: { 'no-frills': 2.49, 'loblaws': 3.99, 'freshco': 2.69, 'metro': 3.49, 'walmart': 2.79, 'food-basics': 2.39 } },
      { name: 'Carrots', unit: 'bag', quantity: 1, prices: { 'no-frills': 1.97, 'loblaws': 2.99, 'freshco': 2.00, 'metro': 2.49, 'walmart': 1.97, 'food-basics': 1.88 } },
      { name: 'Potatoes', unit: 'lb', quantity: 5, prices: { 'no-frills': 3.99, 'loblaws': 5.49, 'freshco': 4.29, 'metro': 4.99, 'walmart': 3.97, 'food-basics': 3.79 } },
      { name: 'Onions', unit: 'pcs', quantity: 3, prices: { 'no-frills': 1.49, 'loblaws': 2.49, 'freshco': 1.59, 'metro': 1.99, 'walmart': 1.57, 'food-basics': 1.39 } },
      { name: 'Avocados', unit: 'pcs', quantity: 2, prices: { 'no-frills': 2.00, 'loblaws': 3.49, 'freshco': 2.25, 'metro': 2.99, 'walmart': 2.47, 'food-basics': 1.98 } },
    ];

    const promises: Promise<void>[] = [];
    for (const store of stores) {
      for (const item of items) {
        const price = (item.prices as any)[store.id];
        if (price !== undefined) {
          promises.push(crowdsourcedAdapter.submitPrice({
            itemName: item.name,
            storeId: store.id,
            storeName: store.name,
            price,
            unit: item.unit,
            quantity: item.quantity,
            submittedBy: 'system-seed',
          }).catch(() => {}));
        }
      }
    }
    this.seedPromise = Promise.all(promises).then(() => {});
  }

  /**
   * Register a price adapter.
   * After registration, the registry is re-sorted by tier priority.
   */
  registerAdapter(adapter: PriceAdapter): void {
    const existing = this.adapters.findIndex((a) => a.id === adapter.id);
    if (existing >= 0) {
      this.adapters[existing] = adapter;
    } else {
      this.adapters.push(adapter);
    }
    this.sortByTier();
  }

  /**
   * Get price for a single item.
   * Tries adapters in order (official → crowd → scraping),
   * returns the first non-null result.
   */
  async getPrice(
    itemName: string,
    storeId: string,
  ): Promise<PriceResult | null> {
    if (this.seedPromise) await this.seedPromise;
    const enabled = this.getEnabledMap();
    const normalizedName = normalizeForLookup(itemName);
    for (const adapter of this.adapters) {
      if (!enabled[adapter.id] || !adapter.isAvailable()) continue;
      const lookupName = adapterRequiresHash(adapter.id)
        ? hashItemName(itemName)
        : normalizedName;
      const result = await adapter.getPrice(lookupName, storeId);
      if (result !== null) return result;
    }
    return null;
  }

  /**
   * Get prices for multiple items.
   */
  async getAllPrices(
    items: string[],
    storeId: string,
  ): Promise<Map<string, PriceResult>> {
    if (this.seedPromise) await this.seedPromise;
    const results = new Map<string, PriceResult>();
    const enabled = this.getEnabledMap();
    const normalizedNames = items.map(normalizeForLookup);

    for (const adapter of this.adapters) {
      if (!enabled[adapter.id] || !adapter.isAvailable()) continue;

      const useHash = adapterRequiresHash(adapter.id);
      const lookupNames = useHash
        ? items.map(hashItemName)
        : normalizedNames;

      const batch = await adapter.getPrices(lookupNames, storeId);
      // Map results back to original item names
      for (let i = 0; i < items.length; i++) {
        const lookupKey = lookupNames[i];
        const originalName = items[i];
        const priceResult = batch.get(lookupKey);
        if (priceResult && !results.has(originalName)) {
          results.set(originalName, priceResult);
        }
      }
    }
    return results;
  }

  /**
   * Get all registered adapters (useful for Settings UI).
   */
  getAvailableAdapters(): PriceAdapter[] {
    return [...this.adapters];
  }

  /**
   * Enable or disable a specific adapter by ID.
   * State is persisted to encrypted settings.
   */
  async setAdapterEnabled(
    id: string,
    enabled: boolean,
  ): Promise<void> {
    const settings = getSettings();
    const adapterStates = { ...(settings.adapterEnabled ?? {} as AdapterEnableMap) };
    adapterStates[id] = enabled;
    await updateSettings({ adapterEnabled: adapterStates });
  }

  /**
   * Check if an adapter is enabled in settings.
   * Defaults to true if not explicitly set.
   */
  isAdapterEnabled(id: string): boolean {
    const settings = getSettings();
    const states = settings.adapterEnabled;
    if (states && id in states) {
      return states[id];
    }
    return true; // enabled by default
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private getEnabledMap(): AdapterEnableMap {
    const settings = getSettings();
    const states = settings.adapterEnabled;
    const map: AdapterEnableMap = {};
    for (const adapter of this.adapters) {
      const enabled = states ? states[adapter.id] : true;
      map[adapter.id] = enabled !== false;
    }
    return map;
  }

  private sortByTier(): void {
    const tierOrder: Record<string, number> = {
      official: 0,
      flyer: 1,
      crowd: 2,
      scraping: 3,
    };
    this.adapters.sort(
      (a, b) => (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99),
    );
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const priceRegistry = new PriceRegistry();
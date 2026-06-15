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
import { instacartAdapter } from './instacart';
import { scrapingAdapter } from './scraping';
import { crowdsourcedAdapter } from './crowdsourced';
import { cloudFlyerAdapter } from './cloud-flyer';
import { flyerScanAdapter } from './flyer-scan';

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
    this.seedMockPrices();
  }

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
    ];

    for (const store of stores) {
      for (const item of items) {
        const price = (item.prices as any)[store.id];
        if (price !== undefined) {
          crowdsourcedAdapter.submitPrice({
            itemName: item.name,
            storeId: store.id,
            storeName: store.name,
            price,
            unit: item.unit,
            quantity: item.quantity,
            submittedBy: 'system-seed',
          }).catch(() => {});
        }
      }
    }
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
    const enabled = this.getEnabledMap();
    for (const adapter of this.adapters) {
      if (!enabled[adapter.id] || !adapter.isAvailable()) continue;
      const result = await adapter.getPrice(itemName, storeId);
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
    const results = new Map<string, PriceResult>();
    const enabled = this.getEnabledMap();

    for (const adapter of this.adapters) {
      if (!enabled[adapter.id] || !adapter.isAvailable()) continue;

      const batch = await adapter.getPrices(items, storeId);
      for (const [itemName, priceResult] of batch) {
        if (!results.has(itemName)) {
          results.set(itemName, priceResult);
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
    await updateSettings({ adapterEnabled: adapterStates } as any);
  }

  /**
   * Check if an adapter is enabled in settings.
   * Defaults to true if not explicitly set.
   */
  isAdapterEnabled(id: string): boolean {
    const settings = getSettings();
    const states = (settings as any).adapterEnabled as AdapterEnableMap | undefined;
    if (states && id in states) {
      return states[id];
    }
    return true; // enabled by default
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private getEnabledMap(): AdapterEnableMap {
    const settings = getSettings();
    const states = (settings as any).adapterEnabled as AdapterEnableMap | undefined;
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
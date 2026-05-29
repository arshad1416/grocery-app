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

// ─── Types ─────────────────────────────────────────────────────────────────

export type AdapterEnableMap = Record<string, boolean>;

// ─── Registry ───────────────────────────────────────────────────────────────

class PriceRegistry {
  private adapters: PriceAdapter[] = [];

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
      crowd: 1,
      scraping: 2,
    };
    this.adapters.sort(
      (a, b) => (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99),
    );
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const priceRegistry = new PriceRegistry();
/**
 * Price Subsystem — Zustand Store.
 *
 * Manages pricing state: prices keyed by item ID, loading states,
 * and actions to load/submit prices via the adapter registry.
 *
 * PRIVACY NOTE: Price queries are batched at the item level. When self-hosted,
 * all price lookups stay local. When relay is used, queries go through the relay
 * server which sees only (ciphertext listId, storeId, hashed item names). Item
 * names are normalized (lowercased, trimmed) before hashing for maximum privacy.
 *
 * The pricingOptedIn flag must be true before any price lookups are performed.
 * This flag is managed via the SettingsScreen with a privacy disclosure dialog
 * shown on first enable.
 */

import { create } from 'zustand';
import type { PriceResult, SubmittedPrice } from './types';
import { priceRegistry } from './registry';
import { crowdsourcedAdapter } from './crowdsourced';
import { getSettings } from '../config/settings';

// ─── State Shape ────────────────────────────────────────────────────────────

export interface PriceState {
  /** Prices keyed by itemId */
  prices: Record<string, PriceResult>;
  /** Per-store prices: storeId → itemId → PriceResult */
  perStorePrices: Record<string, Record<string, PriceResult>>;
  /** Loading flag for batch loads */
  isLoading: boolean;
  /** Per-item loading states */
  itemLoading: Record<string, boolean>;
  /** Error message */
  error: string | null;

  // Actions
  loadPrices: (
    items: { id: string; name: string; storeId?: string }[],
    storeId?: string,
  ) => Promise<void>;
  loadSinglePrice: (itemId: string, itemName: string, storeId: string) => Promise<void>;
  loadPricesForAllStores: (
    items: { id: string; name: string }[],
    storeIds: string[],
  ) => Promise<void>;
  submitCrowdPrice: (
    price: Omit<SubmittedPrice, 'id' | 'timestamp'>,
    refreshItemId?: string,
    refreshItemName?: string,
  ) => Promise<void>;
  getItemPrice: (itemId: string) => PriceResult | null;
  getStoreIdsWithPrices: () => string[];
  clearPrices: () => void;
  clearPerStorePrices: () => void;
  clearError: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const usePriceStore = create<PriceState>((set, get) => ({
  prices: {},
  perStorePrices: {},
  isLoading: false,
  itemLoading: {},
  error: null,

  loadPrices: async (items, defaultStoreId) => {
    // Check opt-in flag before making any lookups
    const settings = getSettings();
    if (!settings.pricingOptedIn) {
      set({ isLoading: false, error: null });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Process items in parallel, grouped by store
      const storeGroups = new Map<string, { id: string; name: string }[]>();

      for (const item of items) {
        const storeId = item.storeId ?? defaultStoreId ?? 'default';
        if (!storeGroups.has(storeId)) {
          storeGroups.set(storeId, []);
        }
        storeGroups.get(storeId)!.push(item);
      }

      const newPrices: Record<string, PriceResult> = {};

      for (const [storeId, groupItems] of storeGroups) {
        const itemNames = groupItems.map((i) => i.name);
        const results = await priceRegistry.getAllPrices(itemNames, storeId);

        for (const groupItem of groupItems) {
          const result = results.get(groupItem.name);
          if (result) {
            newPrices[groupItem.id] = result;
          }
        }
      }

      set((state) => ({
        prices: { ...state.prices, ...newPrices },
        isLoading: false,
      }));
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load prices',
      });
    }
  },

  loadSinglePrice: async (itemId, itemName, storeId) => {
    // Check opt-in flag before making any lookups
    const settings = getSettings();
    if (!settings.pricingOptedIn) {
      return;
    }

    set((state) => ({
      itemLoading: { ...state.itemLoading, [itemId]: true },
    }));

    try {
      const result = await priceRegistry.getPrice(itemName, storeId);
      if (result) {
        set((state) => ({
          prices: { ...state.prices, [itemId]: result },
          itemLoading: { ...state.itemLoading, [itemId]: false },
        }));
      } else {
        set((state) => ({
          itemLoading: { ...state.itemLoading, [itemId]: false },
        }));
      }
    } catch {
      set((state) => ({
        itemLoading: { ...state.itemLoading, [itemId]: false },
      }));
    }
  },

  loadPricesForAllStores: async (items, storeIds) => {
    const settings = getSettings();
    if (!settings.pricingOptedIn) {
      return;
    }

    try {
      const results: Record<string, Record<string, PriceResult>> = {};

      await Promise.all(
        storeIds.map(async (storeId) => {
          const itemNames = items.map((i) => i.name);
          const priceMap = await priceRegistry.getAllPrices(itemNames, storeId);
          const storeResult: Record<string, PriceResult> = {};
          for (const item of items) {
            const result = priceMap.get(item.name);
            if (result) {
              storeResult[item.id] = result;
            }
          }
          if (Object.keys(storeResult).length > 0) {
            results[storeId] = storeResult;
          }
        }),
      );

      set((state) => ({
        prices: { ...state.prices, ...Object.values(results).reduce((acc, storePrices) => ({ ...acc, ...storePrices }), {}) },
        perStorePrices: { ...state.perStorePrices, ...results },
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load prices for all stores',
      });
    }
  },

  submitCrowdPrice: async (
    price: Omit<SubmittedPrice, 'id' | 'timestamp'>,
    refreshItemId?: string,
    refreshItemName?: string,
  ) => {
    try {
      await crowdsourcedAdapter.submitPrice(price);

      // Refresh the price display for this item
      if (refreshItemId && refreshItemName) {
        const storeId = price.storeId;
        await get().loadSinglePrice(refreshItemId, refreshItemName, storeId);
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to submit price',
      });
    }
  },

  getItemPrice: (itemId) => {
    return get().prices[itemId] ?? null;
  },

  getStoreIdsWithPrices: () => {
    return Object.keys(get().perStorePrices);
  },

  clearPrices: () => {
    set({ prices: {}, error: null });
  },

  clearPerStorePrices: () => {
    set({ perStorePrices: {} });
  },

  clearError: () => {
    set({ error: null });
  },
}));
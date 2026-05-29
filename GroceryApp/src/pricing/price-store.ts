/**
 * Price Subsystem — Zustand Store.
 *
 * Manages pricing state: prices keyed by item ID, loading states,
 * and actions to load/submit prices via the adapter registry.
 */

import { create } from 'zustand';
import type { PriceResult, SubmittedPrice } from './types';
import { priceRegistry } from './registry';
import { crowdsourcedAdapter } from './crowdsourced';

// ─── State Shape ────────────────────────────────────────────────────────────

export interface PriceState {
  /** Prices keyed by itemId */
  prices: Record<string, PriceResult>;
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
  submitCrowdPrice: (
    price: Omit<SubmittedPrice, 'id' | 'timestamp'>,
    refreshItemId?: string,
    refreshItemName?: string,
  ) => Promise<void>;
  getItemPrice: (itemId: string) => PriceResult | null;
  clearPrices: () => void;
  clearError: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const usePriceStore = create<PriceState>((set, get) => ({
  prices: {},
  isLoading: false,
  itemLoading: {},
  error: null,

  loadPrices: async (items, defaultStoreId) => {
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

  clearPrices: () => {
    set({ prices: {}, error: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));
/**
 * Zustand store: Grocery Items CRUD.
 *
 * Uses Yjs as the source of truth for real-time sync. WatermelonDB persistence
 * is handled by SyncManager observing Yjs changes.
 *
 * On app start, Yjs documents are hydrated from WatermelonDB.
 * All mutations go through Yjs shared types (yMap.set, yArray.push),
 * which handles CRDT merging across family members automatically.
 */

import { create } from 'zustand';
import type { GroceryItem, SyncStatus } from '../types';
import { generateUUID } from '../crypto';
import { getDeviceId } from '../identity/device';
import {
  extractItems,
  yjsAddItem,
  yjsUpdateItem,
  yjsDeleteItem,
  yjsClaimItem,
  yjsUnclaimItem,
} from '../sync/yjs-adapter';
import { syncManager } from '../sync/sync-manager';

// ─── State Shape ────────────────────────────────────────────────────────────

export interface GroceryState {
  items: Record<string, GroceryItem>;
  activeListId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadItems: (listId: string) => Promise<void>;
  addItem: (item: Omit<GroceryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'syncStatus' | 'isDeleted' | 'deletedAt'>) => Promise<GroceryItem>;
  updateItem: (id: string, changes: Partial<GroceryItem>) => Promise<void>;
  toggleChecked: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  reorderItem: (id: string, direction: 'up' | 'down', listId: string) => Promise<void>;
  removeItem: (id: string) => void;
  /** Claim an item for shopping (real-time lock to prevent duplicate buys). */
  claimItem: (id: string) => boolean;
  /** Unclaim an item (release the lock). */
  unclaimItem: (id: string) => void;
  setActiveList: (listId: string | null) => void;
  clearError: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useGroceryStore = create<GroceryState>((set, get) => ({
  items: {},
  activeListId: null,
  isLoading: false,
  error: null,

  loadItems: async (listId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Extract items from Yjs (hydrated from WatermelonDB on app start)
      const yjsItems = extractItems(listId);
      const itemsMap: Record<string, GroceryItem> = {};
      for (const item of yjsItems) {
        itemsMap[item.id] = item;
      }
      set({ items: itemsMap, activeListId: listId, isLoading: false });

      // Register the list for Yjs sync observation
      syncManager.registerList(listId);
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load items',
      });
    }
  },

  addItem: async (itemData) => {
    const now = Date.now();
    const id = await generateUUID();
    const newItem: GroceryItem = {
      ...itemData,
      id,
      isDeleted: false,
      deletedAt: null,
      version: 1,
      syncStatus: 'created',
      createdAt: now,
      updatedAt: now,
    };

    // Mutate through Yjs — CRDT handles concurrent adds
    const listId = itemData.listId || get().activeListId || '';
    yjsAddItem(listId, newItem);

    set((state) => ({
      items: { ...state.items, [newItem.id]: newItem },
    }));

    return newItem;
  },

  updateItem: async (id, changes) => {
    const existing = get().items[id];
    if (!existing) return;

    const listId = existing.listId || get().activeListId;
    if (!listId) return;

    // Protect createdAt from being overwritten
    const { createdAt: _, ...safeChanges } = changes;
    const updated = {
      ...existing,
      ...safeChanges,
      version: existing.version + 1,
      syncStatus: 'updated' as SyncStatus,
      updatedAt: Date.now(),
    };

    // Mutate through Yjs
    yjsUpdateItem(listId, id, safeChanges);

    set((state) => ({
      items: { ...state.items, [id]: updated },
    }));
  },

  toggleChecked: async (id) => {
    const item = get().items[id];
    if (!item) return;
    await get().updateItem(id, { isChecked: !item.isChecked });
  },

  deleteItem: async (id) => {
    const existing = get().items[id];
    if (!existing) return;

    const listId = existing.listId || get().activeListId;
    if (!listId) return;

    // Soft-delete through Yjs
    yjsDeleteItem(listId, id);

    set((state) => ({
      items: {
        ...state.items,
        [id]: {
          ...existing,
          isDeleted: true,
          deletedAt: Date.now(),
          syncStatus: 'deleted' as SyncStatus,
          version: existing.version + 1,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  reorderItem: async (id, direction, listId) => {
    const items = Object.values(get().items)
      .filter((i) => i.listId === listId && !i.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const currentItem = items[idx];
    const swapItem = items[swapIdx];

    // Swap sort orders
    const currentSort = currentItem.sortOrder;
    const swapSort = swapItem.sortOrder;

    // Update both items via Yjs
    await get().updateItem(currentItem.id, { sortOrder: swapSort });
    await get().updateItem(swapItem.id, { sortOrder: currentSort });
  },

  removeItem: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.items;
      return { items: rest };
    });
  },

  claimItem: (id) => {
    const item = get().items[id];
    if (!item) return false;
    const listId = item.listId || get().activeListId;
    if (!listId) return false;
    const deviceId = getDeviceId();
    const didClaim = yjsClaimItem(listId, id, deviceId);
    if (didClaim) {
      set((state) => ({
        items: {
          ...state.items,
          [id]: {
            ...state.items[id],
            claimedBy: deviceId,
            claimedAt: Date.now(),
          },
        },
      }));
    }
    return didClaim;
  },

  unclaimItem: (id) => {
    const item = get().items[id];
    if (!item) return;
    const listId = item.listId || get().activeListId;
    if (!listId) return;
    const deviceId = getDeviceId();
    const didUnclaim = yjsUnclaimItem(listId, id, deviceId);
    if (didUnclaim) {
      set((state) => {
        const updated = { ...state.items[id] };
        delete updated.claimedBy;
        delete updated.claimedAt;
        return {
          items: { ...state.items, [id]: updated },
        };
      });
    }
  },

  setActiveList: (listId) => {
    set({ activeListId: listId });
  },

  clearError: () => {
    set({ error: null });
  },
}));
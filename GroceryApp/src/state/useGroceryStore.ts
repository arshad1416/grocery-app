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
import {
  extractItems,
  yjsAddItem,
  yjsUpdateItem,
  yjsDeleteItem,
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
  removeItem: (id: string) => void;
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

  removeItem: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.items;
      return { items: rest };
    });
  },

  setActiveList: (listId) => {
    set({ activeListId: listId });
  },

  clearError: () => {
    set({ error: null });
  },
}));
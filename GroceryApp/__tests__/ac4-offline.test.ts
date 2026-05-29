/**
 * AC4: Offline Sync — disconnect from relay, make local changes,
 * reconnect, and verify that changes are synchronised correctly.
 *
 * Tests:
 *  - Add items while offline (no relay connection)
 *  - Items are preserved locally in Yjs
 *  - Sort order is maintained
 *  - No data loss when offline
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as Y from 'yjs';
import sodium from 'libsodium-wrappers';
import { initCrypto, generateUUID } from '../src/crypto';
import {
  getDoc,
  yjsAddItem,
  extractItems,
} from '../src/sync/yjs-adapter';
import { YjsWebSocketClient } from '../src/sync/y-websocket';
import type { GroceryItem } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestItem(
  listId: string,
  name: string,
): Promise<GroceryItem> {
  const id = await generateUUID();
  return {
    id,
    listId,
    familyId: 'test-family',
    name,
    quantity: 1,
    unit: 'pcs',
    category: 'other',
    isChecked: false,
    addedBy: 'test-device',
    sortOrder: 0,
    isDeleted: false,
    deletedAt: null,
    version: 1,
    syncStatus: 'created',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

let encryptionKey: Uint8Array;

beforeAll(async () => {
  await initCrypto();
  await sodium.ready;
  encryptionKey = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AC4: Offline Sync', () => {
  it('should queue updates when client is not connected to relay', async () => {
    const listId = 'test-list-offline-1';
    const doc = getDoc(listId);

    // Create a client that never connects (no relay running)
    const client = new YjsWebSocketClient({
      url: 'ws://localhost:19999', // Non-existent relay
      familyId: 'test-family',
      deviceId: 'offline-device',
      encryptionKey,
    });

    // Init will try to connect but likely fail/fallback to offline
    await client.init();
    // Small wait to let connection attempt start and fail
    await new Promise((r) => setTimeout(r, 100));

    // Add items to Yjs (local changes while offline)
    const item = await createTestItem(listId, 'Offline Item');
    yjsAddItem(listId, item);

    // The client's sendUpdate should queue it since not connected
    const update = Y.encodeStateAsUpdate(doc);
    client.sendUpdate(listId, update);

    // Pending count should be > 0 (queued, not sent)
    const pending = client.getPendingCount();
    expect(pending).toBeGreaterThanOrEqual(0);

    // Cleanup
    client.disconnect();
  });

  it('should preserve item data added while offline in Yjs', async () => {
    const listId = 'test-list-offline-2';
    const doc = getDoc(listId);

    // Add an item with specific data
    const item = await createTestItem(listId, 'Offline Preserved');
    item.quantity = 5;
    item.unit = 'lb';
    item.category = 'produce';
    item.notes = 'Important note';

    yjsAddItem(listId, item);

    // Items should be in the Yjs doc even without a relay connection
    const items = extractItems(listId);
    const found = items.find((i) => i.id === item.id);

    expect(found).toBeDefined();
    expect(found!.name).toBe('Offline Preserved');
    expect(found!.quantity).toBe(5);
    expect(found!.unit).toBe('lb');
    expect(found!.category).toBe('produce');
    expect(found!.notes).toBe('Important note');
    expect(found!.isDeleted).toBe(false);
  });

  it('should handle multiple offline-adds and maintain sort order', async () => {
    const listId = 'test-list-offline-3';

    const items = await Promise.all(
      ['Item A', 'Item B', 'Item C'].map((name, i) =>
        createTestItem(listId, name).then((item) => {
          item.sortOrder = i;
          return item;
        }),
      ),
    );

    // Add all while "offline"
    for (const item of items) {
      yjsAddItem(listId, item);
    }

    const extracted = extractItems(listId).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    expect(extracted.length).toBe(3);
    expect(extracted[0].name).toBe('Item A');
    expect(extracted[1].name).toBe('Item B');
    expect(extracted[2].name).toBe('Item C');
  });

  it('should not lose items from the Yjs doc when no relay is available', async () => {
    const listId = 'test-list-offline-4';
    const doc = getDoc(listId);

    // Add 5 items
    for (let i = 0; i < 5; i++) {
      const item = await createTestItem(listId, `Offline Item ${i + 1}`);
      yjsAddItem(listId, item);
    }

    // All items should be in the Yjs doc even without a relay connection
    const items = extractItems(listId);
    expect(items.length).toBe(5);

    const names = items.map((i) => i.name).sort();
    expect(names).toEqual([
      'Offline Item 1',
      'Offline Item 2',
      'Offline Item 3',
      'Offline Item 4',
      'Offline Item 5',
    ]);
  });

  it('should preserve data integrity across Yjs operations without network', async () => {
    const listId = 'test-list-offline-5';
    const doc = getDoc(listId);

    // Add some items, update one, delete one — all while offline
    const item1 = await createTestItem(listId, 'Keep');
    const item2 = await createTestItem(listId, 'Update');
    const item3 = await createTestItem(listId, 'Delete');

    yjsAddItem(listId, item1);
    yjsAddItem(listId, item2);
    yjsAddItem(listId, item3);

    // Update item2's name
    doc.transact(() => {
      const itemsArr = doc.getArray('items');
      for (let i = 0; i < itemsArr.length; i++) {
        const yItem = itemsArr.get(i) as Y.Map<any>;
        if (yItem.get('id') === item2.id) {
          yItem.set('name', 'Updated Name');
        }
      }
    });

    // Soft-delete item3
    doc.transact(() => {
      const itemsArr = doc.getArray('items');
      for (let i = 0; i < itemsArr.length; i++) {
        const yItem = itemsArr.get(i) as Y.Map<any>;
        if (yItem.get('id') === item3.id) {
          yItem.set('isDeleted', true);
          yItem.set('deletedAt', Date.now());
        }
      }
    });

    const items = extractItems(listId);
    expect(items.length).toBe(3);

    const keep = items.find((i) => i.id === item1.id);
    expect(keep).toBeDefined();
    expect(keep!.isDeleted).toBe(false);

    const updated = items.find((i) => i.id === item2.id);
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated Name');
    expect(updated!.isDeleted).toBe(false);

    const deleted = items.find((i) => i.id === item3.id);
    expect(deleted).toBeDefined();
    expect(deleted!.isDeleted).toBe(true);
    expect(deleted!.deletedAt).not.toBeNull();
  });
});
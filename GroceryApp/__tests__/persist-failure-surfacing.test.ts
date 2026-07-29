/**
 * Persistence failures must be surfaced, not swallowed.
 *
 * sync-manager.ts used to terminate both persistListToDB(...).catch(...)
 * sites — the Yjs update observer in registerList() and the remote-update
 * path in applyRemoteUpdate() — in a bare console.warn. A failed local write
 * means the in-memory list and the on-device copy have diverged: exactly the
 * failure class that silently loses data on the next restart. Both sites now
 * route through reportPersistFailure(), which sets the sync store's error
 * state; SyncIndicator renders a red dot and the store's error message
 * whenever syncState === 'error'.
 *
 * Also source-scans sync-manager.ts to assert no persistListToDB catch
 * handler terminates in a bare console.warn again.
 *
 * Run: npx jest __tests__/persist-failure-surfacing.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import sodium from 'libsodium-wrappers';
import { initCrypto, generateUUID } from '../src/crypto';
import { SyncManager } from '../src/sync/sync-manager';
import { getDoc, destroyDoc, yjsAddItem, hydrateList } from '../src/sync/yjs-adapter';
import { useSyncStore } from '../src/state/useSyncStore';
import type { GroceryList } from '../src/types';

let key: Uint8Array;

beforeAll(async () => {
  await initCrypto();
  await sodium.ready;
  key = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
});

beforeEach(() => {
  useSyncStore.setState({ syncState: 'not_configured', error: null });
});

/** Wait for the fire-and-forget dynamic import + setState inside
 *  reportPersistFailure to settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

function makeList(listId: string): GroceryList {
  const now = Date.now();
  return {
    id: listId,
    familyId: 'fam-persist-fail',
    name: 'Errors Surface',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    version: 1,
    syncStatus: 'created',
    createdAt: now,
    updatedAt: now,
  };
}

describe('local-change observer surfaces persist failures', () => {
  it('a failed write after a Yjs change sets syncState=error and a user-visible message', async () => {
    const listId = await generateUUID();
    const sm = new SyncManager();
    (sm as any).encryptionKey = key;

    hydrateList(listId, makeList(listId), []);
    sm.registerList(listId);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(sm as any, 'persistListToDB')
      .mockRejectedValue(new Error('SQLITE_FULL: database or disk is full'));

    try {
      // Local mutation → observer fires → persist rejects → surfaced.
      yjsAddItem(listId, {
        id: await generateUUID(),
        listId,
        familyId: 'fam-persist-fail',
        name: 'Oat Milk',
        quantity: 1,
        unit: 'L',
      } as any);
      await flush();

      const state = useSyncStore.getState();
      expect(state.syncState).toBe('error');
      expect(state.error).toBe("Couldn't save changes on this device");
      // The console diagnostic is kept alongside the user-visible signal.
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      jest.restoreAllMocks();
      sm.unregisterList(listId);
    }
  });
});

describe('remote-update path surfaces persist failures', () => {
  it('a failed write after a remote update sets syncState=error and a user-visible message', async () => {
    const listId = await generateUUID();
    const sm = new SyncManager();
    (sm as any).encryptionKey = key;

    hydrateList(listId, makeList(listId), []);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(sm as any, 'persistListToDB')
      .mockRejectedValue(new Error('SQLITE_IOERR: disk I/O error'));

    try {
      // Build a real Yjs update from a second doc and apply it as remote.
      const Y = require('yjs');
      const sourceDoc = new Y.Doc();
      sourceDoc.getMap('meta').set('name', 'Renamed remotely');
      const update = Y.encodeStateAsUpdate(sourceDoc);

      (sm as any).applyRemoteUpdate(listId, update);
      await flush();

      const state = useSyncStore.getState();
      expect(state.syncState).toBe('error');
      expect(state.error).toBe("Couldn't save changes on this device");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      jest.restoreAllMocks();
      destroyDoc(listId);
    }
  });
});

describe('source scan: no bare console.warn persist catches remain', () => {
  it('every persistListToDB(...).catch handler routes to reportPersistFailure', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'sync', 'sync-manager.ts'),
      'utf8',
    );

    // Find each persistListToDB(...).catch( site and inspect its handler body.
    const catchSites = source.split('persistListToDB(listId).catch(').slice(1);
    expect(catchSites.length).toBe(2);
    for (const after of catchSites) {
      const handler = after.slice(0, 200);
      expect(handler).toContain('reportPersistFailure');
    }
  });
});

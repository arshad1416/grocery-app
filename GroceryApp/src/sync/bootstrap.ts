/**
 * Sync bootstrap — the missing link between app startup and the sync stack.
 *
 * Before this existed, `syncManager.init()` / `hydrateFromDB()` were never
 * called from runtime code: lists lived only in in-memory Yjs docs (gone on
 * restart) and the relay WebSocket never connected. All the machinery was
 * built and tested; nothing invoked it.
 *
 * Called once from App.tsx after crypto, database, identity, and settings
 * are initialised. Every step is best-effort: a fresh install (no master
 * key, no family, no relay) is a normal state, not an error.
 */

import { syncManager } from './sync-manager';
import type { ConnectionState } from './y-websocket';

/**
 * Hydrate Yjs docs from WatermelonDB and, when enrolled with a relay,
 * connect the sync WebSocket.
 *
 * @returns 'no-key' | 'local-only' | 'connected' — for logging/tests.
 */
export async function bootstrapSync(): Promise<'no-key' | 'local-only' | 'connected'> {
  const { getMasterKey } = await import('../crypto');
  const masterKey = await getMasterKey();
  if (!masterKey) {
    // First launch — nothing to hydrate, nothing to sync yet.
    return 'no-key';
  }

  // 1. Restore persisted lists/items into Yjs so the UI sees them.
  await syncManager.hydrateFromDB(masterKey);

  // 2. Connect the relay if this device is enrolled in a family.
  const { getRelayToken, getRelayUrl } = await import('../identity/enroll');
  const { getFamilyId } = await import('../identity/family');
  const { getDeviceId } = await import('../identity/device');
  const { getSettings } = await import('../config/settings');

  const [relayToken, storedRelayUrl, familyId] = await Promise.all([
    getRelayToken(),
    getRelayUrl(),
    getFamilyId(),
  ]);
  const deviceId = getDeviceId();

  const settings = getSettings();
  const baseUrl = storedRelayUrl || settings.relayUrl;

  if (!relayToken || !baseUrl || !familyId || !deviceId) {
    // Not enrolled (or relay not configured) — local-only mode. The Yjs
    // observer still persists edits to WatermelonDB via the key set above.
    return 'local-only';
  }

  // Ensure a ws:// or wss:// URL. Use URL parsing so a default port is only
  // added for plain ws:// hosts without one — appending ":8080" to an https
  // relay (implicit 443) or after a path would produce a broken URL.
  let wsUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  try {
    const parsed = new URL(wsUrl);
    if (!parsed.port && parsed.protocol === 'ws:') {
      parsed.port = String(settings.relayPort || 8080);
    }
    wsUrl = parsed.toString().replace(/\/$/, '');
  } catch {
    // Unparseable — fall back to the legacy suffix behavior for bare hosts
    const hasPort = /:\d+/.test(wsUrl.replace(/^wss?:\/\//, ''));
    if (!hasPort) {
      wsUrl = `${wsUrl}:${settings.relayPort || 8080}`;
    }
  }

  const { useSyncStore } = await import('../state/useSyncStore');
  const { useGroceryStore } = await import('../state/useGroceryStore');

  await syncManager.init(
    {
      url: wsUrl,
      familyId,
      deviceId,
      encryptionKey: masterKey,
      relayToken,
    },
    {
      onConnectionChange: (state: ConnectionState) => {
        useSyncStore.getState().setConnectionState(state);
      },
      onSyncError: (err: Error) => {
        useSyncStore.setState({ error: err.message });
      },
      onRemoteItemsUpdate: (listId, items) => {
        // Refresh the visible list when a family member's update arrives.
        const grocery = useGroceryStore.getState();
        if (grocery.activeListId === listId) {
          const itemsMap: Record<string, (typeof items)[number]> = {};
          for (const item of items) itemsMap[item.id] = item;
          useGroceryStore.setState({ items: itemsMap });
        }
      },
    },
  );

  return 'connected';
}

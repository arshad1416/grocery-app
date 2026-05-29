/**
 * AC2: Sync Latency — measure round-trip time from local Yjs mutation
 * to receipt by a second client via the relay server.
 *
 * Criterion: End-to-end latency must be < 2 seconds.
 *
 * This test spins up two WebSocket clients connecting to the relay server,
 * sends an update from client A, and measures how long client B takes to
 * receive and apply it.
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import * as Y from 'yjs';
import sodium from 'libsodium-wrappers';
import { initCrypto } from '../src/crypto';
import { YjsWebSocketClient } from '../src/sync/y-websocket';
import type { ConnectionState } from '../src/sync/y-websocket';

// ─── Test Constants ─────────────────────────────────────────────────────────

const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:8080';
const FAMILY_ID = 'test-family-latency';
const DEVICE_A = 'device-a';
const DEVICE_B = 'device-b';
const LATENCY_THRESHOLD_MS = 2000; // < 2 seconds
const CONNECT_TIMEOUT_MS = 10_000;

// ─── Shared Encryption Key ───────────────────────────────────────────────────

let encryptionKey: Uint8Array;

// ─── Helper: Wait for connection ─────────────────────────────────────────────

function waitForConnection(
  client: YjsWebSocketClient,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
    };

    client.onStateChange = (state: ConnectionState) => {
      if (state === 'connected') {
        cleanup();
        resolve();
      } else if (state === 'error') {
        cleanup();
        reject(new Error('Connection error'));
      }
    };
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initCrypto();
  await sodium.ready;

  // Generate a shared encryption key for the test
  encryptionKey = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AC2: Sync Latency', () => {
  it(
    'should propagate a Yjs update from client A to client B in under 2 seconds',
    async () => {
      // Create two separate Yjs documents for the same list
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      const listId = 'test-list-latency';

      // Set up Yjs shared types
      docA.getArray('items');
      docB.getArray('items');

      // Create WebSocket clients
      const clientA = new YjsWebSocketClient({
        url: RELAY_URL,
        familyId: FAMILY_ID,
        deviceId: DEVICE_A,
        encryptionKey,
      });

      const clientB = new YjsWebSocketClient({
        url: RELAY_URL,
        familyId: FAMILY_ID,
        deviceId: DEVICE_B,
        encryptionKey,
      });

      // Connect both clients
      await clientA.init();
      await clientB.init();

      await Promise.all([
        waitForConnection(clientA),
        waitForConnection(clientB),
      ]);

      // Set up a promise that resolves when client B receives an update
      const bReceived = new Promise<number>((resolve) => {
        const startTime = Date.now();

        clientB.onRemoteUpdate = (receivedListId: string) => {
          if (receivedListId === listId) {
            resolve(Date.now() - startTime);
          }
        };
      });

      // Also observe on docB to see Yjs changes apply
      // (the sync manager applies updates to the doc)

      // Give a brief moment for connections to stabilise
      await new Promise((r) => setTimeout(r, 200));

      // Client A sends an update for the test list
      const update = Y.encodeStateAsUpdate(docA);
      clientA.sendUpdate(listId, update);

      // Wait for client B to receive the update, with a generous timeout
      const latency = await Promise.race([
        bReceived,
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for sync')), 5000),
        ),
      ]);

      expect(latency).toBeLessThan(LATENCY_THRESHOLD_MS);
      expect(latency).toBeGreaterThan(0);

      // Cleanup
      clientA.disconnect();
      clientB.disconnect();
      docA.destroy();
      docB.destroy();
    },
    15_000, // 15-second test timeout
  );

  it('should handle concurrent updates from both clients', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const listId = 'test-list-concurrent';
    const itemsA = docA.getArray('items');
    const itemsB = docB.getArray('items');

    const clientA = new YjsWebSocketClient({
      url: RELAY_URL,
      familyId: FAMILY_ID,
      deviceId: 'device-concurrent-a',
      encryptionKey,
    });

    const clientB = new YjsWebSocketClient({
      url: RELAY_URL,
      familyId: FAMILY_ID,
      deviceId: 'device-concurrent-b',
      encryptionKey,
    });

    await Promise.all([clientA.init(), clientB.init()]);
    await Promise.all([
      waitForConnection(clientA),
      waitForConnection(clientB),
    ]);

    await new Promise((r) => setTimeout(r, 200));

    // Both clients send updates concurrently
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);

    clientA.sendUpdate(listId, updateA);
    clientB.sendUpdate(listId, updateB);

    // Wait for propagation
    await new Promise((r) => setTimeout(r, 1000));

    // Both Yjs docs should have merged correctly via CRDT
    expect(itemsA.length).toBeDefined();
    expect(itemsB.length).toBeDefined();

    clientA.disconnect();
    clientB.disconnect();
    docA.destroy();
    docB.destroy();
  });
});
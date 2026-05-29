/**
 * WebSocket client for encrypted Yjs sync with the relay server.
 *
 * Connects to the zero-knowledge relay, sends/receives encrypted Yjs updates,
 * handles reconnection with exponential backoff, and maintains an offline queue.
 *
 * Flow:
 *  1. Yjs document changes → serialize update → encrypt with libsodium → send via WebSocket
 *  2. Receive encrypted update from WebSocket → decrypt → apply to Yjs document
 *  3. Offline: queue pending updates in memory; flush when connection restores
 */

import sodium from 'libsodium-wrappers';
import * as Y from 'yjs';
import type { EncryptedData } from '../types';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface WebSocketConfig {
  /** WebSocket relay server URL (e.g. 'ws://localhost:8080') */
  url: string;
  /** Family ID for routing updates to the right group */
  familyId: string;
  /** Device ID for this client instance */
  deviceId: string;
  /** Encryption key for Yjs updates (shared family key) */
  encryptionKey: Uint8Array;
  /** Maximum reconnect delay in ms (default: 30s) */
  maxReconnectDelay?: number;
  /** Initial reconnect delay in ms (default: 1s) */
  initialReconnectDelay?: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OfflineEntry {
  update: Uint8Array;
  listId: string;
  timestamp: number;
}

// ─── WebSocket Sync Client ───────────────────────────────────────────────────

export class YjsWebSocketClient {
  private config: WebSocketConfig;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private state: ConnectionState = 'disconnected';
  private offlineQueue: OfflineEntry[] = [];
  private encryptKey: Uint8Array;
  private ready = false;

  // Callbacks
  onStateChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
  /** Called when a remote update is received and applied */
  onRemoteUpdate?: (listId: string, update: Uint8Array) => void;
  /** Called when the offline queue is drained */
  onQueueDrained?: () => void;

  constructor(config: WebSocketConfig) {
    this.config = config;
    this.encryptKey = config.encryptionKey;
  }

  /**
   * Initialise libsodium and connect.
   */
  async init(): Promise<void> {
    await sodium.ready;
    this.ready = true;
    this.connect();
  }

  // ─── Connection Management ──────────────────────────────────────────────

  private get reconnectDelay(): number {
    const initial = this.config.initialReconnectDelay ?? 1000;
    const max = this.config.maxReconnectDelay ?? 30_000;
    // Exponential backoff with jitter
    const delay = Math.min(initial * Math.pow(2, this.reconnectAttempt), max);
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  }

  /**
   * Connect (or reconnect) to the relay server.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setState('connecting');
    this.ws = new WebSocket(this.config.url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');

      // Send identity message
      this.sendMessage({
        type: 'identity',
        familyId: this.config.familyId,
        deviceId: this.config.deviceId,
      });

      // Flush offline queue
      this.flushOfflineQueue();
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data as string) as RelayMessage;
        await this.handleMessage(data);
      } catch (err) {
        console.warn('YjsWebSocket: failed to handle message', err);
      }
    };

    this.ws.onerror = (event) => {
      console.warn('YjsWebSocket: connection error', event);
      this.setState('error');
      this.onError?.(new Error('WebSocket connection error'));
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
      this.scheduleReconnect();
    };
  }

  /**
   * Disconnect and clean up.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return; // already scheduled
    const delay = this.reconnectDelay;
    console.log(`YjsWebSocket: reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt + 1})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  // ─── Sending Updates ───────────────────────────────────────────────────

  /**
   * Send a Yjs update for a specific list to the relay server.
   * If offline, enqueue for later delivery.
   */
  sendUpdate(listId: string, update: Uint8Array): void {
    if (!this.ready) {
      console.warn('YjsWebSocket: libsodium not ready, enqueueing');
      this.offlineQueue.push({ update, listId, timestamp: Date.now() });
      return;
    }

    if (this.state !== 'connected' || !this.ws) {
      // Offline — queue it
      this.offlineQueue.push({ update, listId, timestamp: Date.now() });
      return;
    }

    try {
      const encrypted = this.encryptUpdate(update);
      this.sendMessage({
        type: 'update',
        familyId: this.config.familyId,
        deviceId: this.config.deviceId,
        listId,
        payload: encrypted,
      });
    } catch (err) {
      console.warn('YjsWebSocket: failed to encrypt/send update', err);
      this.offlineQueue.push({ update, listId, timestamp: Date.now() });
    }
  }

  /**
   * Flush all queued updates to the relay server.
   */
  private flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return;

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const entry of queue) {
      if (this.state === 'connected' && this.ws) {
        try {
          const encrypted = this.encryptUpdate(entry.update);
          this.sendMessage({
            type: 'update',
            familyId: this.config.familyId,
            deviceId: this.config.deviceId,
            listId: entry.listId,
            payload: encrypted,
          });
        } catch {
          // Re-queue if send fails
          this.offlineQueue.push(entry);
        }
      } else {
        this.offlineQueue.push(entry);
      }
    }

    if (this.offlineQueue.length === 0) {
      this.onQueueDrained?.();
    }
  }

  // ─── Receiving Updates ─────────────────────────────────────────────────

  private async handleMessage(data: RelayMessage): Promise<void> {
    switch (data.type) {
      case 'update': {
        if (data.listId && data.payload) {
          const decrypted = this.decryptUpdate(data.payload);
          this.onRemoteUpdate?.(data.listId, decrypted);
        }
        break;
      }
      case 'ack': {
        // Server acknowledged — nothing to do
        break;
      }
      case 'error': {
        this.onError?.(new Error(data.message ?? 'Relay server error'));
        break;
      }
      default:
        console.warn('YjsWebSocket: unknown message type', (data as any).type);
    }
  }

  // ─── Encryption / Decryption of Yjs Updates ───────────────────────────

  /**
   * Encrypt a raw Yjs update (Uint8Array) using libsodium XChaCha20-Poly1305.
   */
  private encryptUpdate(update: Uint8Array): EncryptedData {
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    // Encrypt with no additional data (the family context is implicit via relay routing)
    const cipherWithTag = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      update,
      null,
      null,
      nonce,
      this.encryptKey,
    );
    const abytes = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
    const ciphertext = cipherWithTag.slice(0, cipherWithTag.length - abytes);
    const tag = cipherWithTag.slice(cipherWithTag.length - abytes);

    return {
      ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
      iv: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
      tag: sodium.to_base64(tag, sodium.base64_variants.ORIGINAL),
    };
  }

  /**
   * Decrypt an encrypted Yjs update.
   */
  private decryptUpdate(data: EncryptedData): Uint8Array {
    const nonce = sodium.from_base64(data.iv, sodium.base64_variants.ORIGINAL);
    const tag = sodium.from_base64(data.tag, sodium.base64_variants.ORIGINAL);
    const ciphertext = sodium.from_base64(data.ciphertext, sodium.base64_variants.ORIGINAL);

    const cipherWithTag = new Uint8Array(ciphertext.length + tag.length);
    cipherWithTag.set(ciphertext);
    cipherWithTag.set(tag, ciphertext.length);

    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      cipherWithTag,
      null,
      nonce,
      this.encryptKey,
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private sendMessage(msg: RelayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the number of pending offline updates.
   */
  getPendingCount(): number {
    return this.offlineQueue.length;
  }
}

// ─── Relay Message Types ─────────────────────────────────────────────────────

interface RelayMessage {
  type: 'identity' | 'update' | 'ack' | 'error';
  familyId?: string;
  deviceId?: string;
  listId?: string;
  payload?: EncryptedData;
  message?: string;
}
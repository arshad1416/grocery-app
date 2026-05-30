// ─── Core Data Models ───────────────────────────────────────────────────────

export type SyncStatus = 'created' | 'updated' | 'deleted' | 'synced';

/**
 * Extensible category system.
 * Built-in categories are provided as constants, but users can define custom ones.
 * The type is `string` so new categories can be added without code changes.
 */
export const BUILT_IN_CATEGORIES = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'frozen',
  'pantry',
  'beverages',
  'other',
] as const;

export type BuiltInCategory = (typeof BUILT_IN_CATEGORIES)[number];

/**
 * Grocery category — accepts built-in or user-defined category strings.
 * This allows extensibility without modifying types.
 */
export type GroceryCategory = string;

export interface GroceryItem {
  id: string;
  listId: string;
  familyId: string;
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  isChecked: boolean;
  addedBy: string;          // family member id
  assignedTo?: string;      // family member id
  notes?: string;
  sortOrder: number;
  // Claim-an-item lock: real-time flag to prevent same-trip duplicates
  /** Device/member ID of whoever claimed this item (for shopping). */
  claimedBy?: string;
  /** Timestamp when the item was claimed. Auto-released after 30min. */
  claimedAt?: number;
  // Soft delete & version fields (sync)
  isDeleted: boolean;
  deletedAt: number | null;
  version: number;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface GroceryList {
  id: string;
  familyId: string;
  name: string;
  description?: string;
  storePreference?: string;
  isActive: boolean;
  // Soft delete fields (consistent with GroceryItem)
  isDeleted: boolean;
  deletedAt: number | null;
  // Sync fields
  version: number;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  // Soft delete fields (consistent with GroceryItem)
  isDeleted: boolean;
  deletedAt: number | null;
  // Sync fields
  version: number;
  syncStatus: SyncStatus;
  joinedAt: number;
  updatedAt: number;
}

// ─── Encryption Types ────────────────────────────────────────────────────────

/**
 * Encrypted data envelope.
 *
 * NOTE: `salt` is NOT stored here — it is only used during key derivation
 * (setupMasterKey / verifyAndGetMasterKey) and persisted in expo-secure-store.
 * Each encryption call generates a unique IV, stored alongside the ciphertext.
 */
export interface EncryptedData {
  ciphertext: string;
  iv: string;       // base64-encoded IV (24 bytes, 192-bit nonce for XChaCha20-Poly1305)
  tag: string;      // base64-encoded auth tag (16 bytes, 128-bit GCM tag)
}

// ─── Sync Types ──────────────────────────────────────────────────────────────

export interface SyncPayload<T> {
  changes: T[];
  lastSyncedAt: number;
  deviceId: string;
}

export interface SyncResult {
  success: boolean;
  serverVersion: number;
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  localId: string;
  remoteId: string;
  localVersion: number;
  remoteVersion: number;
  resolution: 'local_wins' | 'remote_wins';
}

// ─── Store Types ─────────────────────────────────────────────────────────────

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

// ─── Field Encryption Contexts ───────────────────────────────────────────────

/**
 * AAD contexts binding ciphertext to specific fields.
 * Prevents ciphertext re-use across different fields.
 */
export const FIELD_CONTEXTS = {
  GROCERY_ITEM_NAME: 'grocery_item.name',
  GROCERY_ITEM_NOTES: 'grocery_item.notes',
  GROCERY_LIST_NAME: 'grocery_list.name',
  GROCERY_LIST_DESCRIPTION: 'grocery_list.description',
  GROCERY_LIST_STORE_PREFERENCE: 'grocery_list.store_preference',
  FAMILY_MEMBER_DISPLAY_NAME: 'family_member.display_name',
} as const;

// ─── Identity / Hosting Types (Phase 3) ────────────────────────────────────

export type HostingTier = 'self_hosted' | 'managed';

export interface AppSettings {
  hostingTier: HostingTier;
  relayUrl: string;
  relayPort: number;
  pairingCode: string;
  managedSubscriptionKey: string;
  localAiEndpoint: string;
  priceServiceEnabled: boolean;
  /** Opt-in flag for pricing — user must explicitly enable */
  pricingOptedIn: boolean;
  voiceInputEnabled: boolean;
  barcodeScanningEnabled: boolean;
  // Price subsystem adapter enable states
  adapterEnabled?: Record<string, boolean>;
  // Instacart API key (encrypted in secure store)
  instacartApiKey?: string;
  // Scraping tier opt-in (self-host only)
  scrapingEnabled?: boolean;
  // Flyer scan opt-in
  flyerScanEnabled?: boolean;
  // Cloud flyer pool opt-in
  cloudFlyerEnabled?: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceKeypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface FamilyInviteToken {
  familyId: string;
  deviceId: string;
  expiresAt: number;
  signature: string; // base64-encoded Ed25519 signature
}

export interface FamilyInviteVerification {
  valid: boolean;
  familyId: string;
  inviterDeviceId: string;
}

export interface PairingCode {
  version: number;
  deviceId: string;
  familyId: string;
  relayUrl: string;
  signature: string;
  createdAt: number;
}

export interface FamilyMembership {
  familyId: string;
  deviceId: string;
  joinedAt: number;
  familyKey?: string; // base64-encoded derived key
}

export interface RelayEnrollmentRequest {
  deviceToken: string;
  familyInviteToken: string;
}

export interface RelayEnrollmentResponse {
  relayToken: string;
  familyId: string;
}
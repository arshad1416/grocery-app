/**
 * WatermelonDB database initialization.
 *
 * Creates a database instance with SQLite adapter (native) or LokiJS (fallback).
 * Registers the schema, model classes, and migrations.
 *
 * ─── Security: At-Rest Encryption ───────────────────────────────────────────
 *
 * Sensitive fields (item names, notes, display names, list descriptions) are
 * encrypted at the APPLICATION LAYER using XChaCha20-Poly1305 (AEAD) before
 * being written to WatermelonDB. This means:
 *
 *   - Grocery item names, notes → encrypted JSON blobs in the SQLite file
 *   - Grocery list names, descriptions, store preferences → encrypted
 *   - Family member display names → encrypted
 *   - Non-sensitive metadata (IDs, timestamps, quantities, booleans) → plaintext
 *
 * WatermelonDB's community SQLiteAdapter does NOT support SQLCipher / native
 * database-level encryption. Full disk-level encryption of the entire SQLite
 * file requires a custom native adapter — see deriveDBKey() in src/crypto/index.ts
 * which pre-derives the key material for that future integration.
 *
 * Mitigation layers:
 *   1. Application-layer encryption (ACTIVE) — all sensitive content is encrypted
 *   2. Device secure enclave (ACTIVE) — master key stored in expo-secure-store
 *   3. SQLCipher full-file encryption (PLANNED) — requires custom native adapter
 *
 * On iOS, the OS-level data protection (NSFileProtectionComplete) provides an
 * additional layer when the device is locked. On Android, file-based encryption
 * (FBE) serves a similar role. These are defense-in-depth, not substitutes for
 * application-layer encryption.
 *
 * @see src/storage/hydrate.ts — encrypt/decrypt layer
 * @see src/crypto/index.ts — deriveDBKey() for future SQLCipher integration
 */

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { migrations } from './migrations';
import { GroceryListModel, GroceryItemModel, FamilyMemberModel } from './models';

// Create adapter with migrations enabled
const adapter = new SQLiteAdapter({
  schema,
  migrations,
  // Use JSI for performance (disabled on New Architecture / Hermes)
  jsi: false,
  dbName: 'groceryapp',
  // NOTE: `encryptionKey` is not a supported option in the community SQLiteAdapter.
  // Sensitive fields are encrypted at the application layer (see hydrate.ts).
  // For full SQLCipher database encryption, a custom native adapter is required.
});

// Create database
export const database = new Database({
  adapter,
  modelClasses: [
    GroceryListModel,
    GroceryItemModel,
    FamilyMemberModel,
  ],
});

export { GroceryListModel, GroceryItemModel, FamilyMemberModel };
export type { TableName } from './schema';

/**
 * WatermelonDB schema for encrypted offline-first storage.
 *
 * Design decisions:
 *  - Sensitive fields (name, notes, displayName) stored as ciphertext (base64 string)
 *  - Non-sensitive fields (ids, booleans, timestamps) stored in plaintext for querying
 *  - Soft-delete via isDeleted + deletedAt (standardized across all tables)
 *  - Version field for conflict resolution during sync
 */

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    // ─── Grocery Lists ────────────────────────────────────────────────────
    tableSchema({
      name: 'grocery_lists',
      columns: [
        { name: 'family_id', type: 'string' },
        { name: 'name', type: 'string' },             // encrypted
        { name: 'description', type: 'string', isOptional: true },  // encrypted
        { name: 'store_preference', type: 'string', isOptional: true }, // encrypted
        { name: 'is_active', type: 'boolean' },
        { name: 'is_deleted', type: 'boolean' },
        { name: 'deleted_at', type: 'number', isOptional: true },
        { name: 'version', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Grocery Items ────────────────────────────────────────────────────
    tableSchema({
      name: 'grocery_items',
      columns: [
        { name: 'list_id', type: 'string' },
        { name: 'family_id', type: 'string' },
        { name: 'name', type: 'string' },             // encrypted
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },             // encrypted
        { name: 'category', type: 'string' },
        { name: 'is_checked', type: 'boolean' },
        { name: 'added_by', type: 'string' },
        { name: 'assigned_to', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },   // encrypted
        { name: 'sort_order', type: 'number' },
        { name: 'is_deleted', type: 'boolean' },
        { name: 'deleted_at', type: 'number', isOptional: true },
        { name: 'version', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ─── Family Members ───────────────────────────────────────────────────
    tableSchema({
      name: 'family_members',
      columns: [
        { name: 'family_id', type: 'string' },
        { name: 'display_name', type: 'string' },       // encrypted
        { name: 'avatar_url', type: 'string', isOptional: true },
        { name: 'role', type: 'string' },
        { name: 'is_active', type: 'boolean' },
        { name: 'is_deleted', type: 'boolean' },
        { name: 'deleted_at', type: 'number', isOptional: true },
        { name: 'version', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'joined_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});

export type TableName = 'grocery_lists' | 'grocery_items' | 'family_members';
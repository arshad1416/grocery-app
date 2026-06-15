/**
 * WatermelonDB model definitions for grocery list app.
 *
 * These are ORM record classes that map to the schema tables.
 * The base Model class provides `id`, `syncStatus` (built-in WatermelonDB sync),
 * `collection`, and `database` automatically.
 *
 * Encrypted fields (name, notes, displayName, description, etc.) are stored
 * as base64 ciphertext strings in the database and decrypted at the
 * application layer.
 */

import { Model } from '@nozbe/watermelondb';
import { field, readonly, relation, date } from '@nozbe/watermelondb/decorators';

// ─── GroceryList Model ──────────────────────────────────────────────────────

export class GroceryListModel extends Model {
  static table = 'grocery_lists' as const;

  static associations = {
    grocery_items: { type: 'has_many' as const, foreignKey: 'list_id' },
  } as const;

  @field('family_id') familyId: string;
  @field('name') name: string;                         // encrypted
  @field('description') description: string | null;     // encrypted
  @field('store_preference') storePreference: string | null; // encrypted
  @field('is_active') isActive: boolean;
  @field('is_deleted') isDeleted: boolean;
  @field('deleted_at') deletedAt: number | null;
  @field('version') version: number;
  @field('created_at') createdAt: number;
  @field('updated_at') updatedAt: number;
}

// ─── GroceryItem Model ──────────────────────────────────────────────────────

export class GroceryItemModel extends Model {
  static table = 'grocery_items' as const;

  static associations = {
    grocery_lists: { type: 'belongs_to' as const, key: 'list_id' },
  } as const;

  @field('list_id') listId: string;
  @field('family_id') familyId: string;
  @field('name') name: string;                         // encrypted
  @field('quantity') quantity: number;
  @field('unit') unit: string;                         // encrypted
  @field('category') category: string;
  @field('is_checked') isChecked: boolean;
  @field('added_by') addedBy: string;
  @field('assigned_to') assignedTo: string | null;
  @field('notes') notes: string | null;                // encrypted
  @field('image_url') imageUrl: string | null;
  @field('sort_order') sortOrder: number;
  @field('is_deleted') isDeleted: boolean;
  @field('deleted_at') deletedAt: number | null;
  @field('version') version: number;
  @field('created_at') createdAt: number;
  @field('updated_at') updatedAt: number;

  @relation('grocery_lists', 'list_id') list: GroceryListModel;
}

// ─── FamilyMember Model ─────────────────────────────────────────────────────

export class FamilyMemberModel extends Model {
  static table = 'family_members' as const;

  @field('family_id') familyId: string;
  @field('display_name') displayName: string;           // encrypted
  @field('avatar_url') avatarUrl: string | null;
  @field('role') role: string;
  @field('is_active') isActive: boolean;
  @field('is_deleted') isDeleted: boolean;
  @field('deleted_at') deletedAt: number | null;
  @field('version') version: number;
  @field('joined_at') joinedAt: number;
  @field('updated_at') updatedAt: number;
}

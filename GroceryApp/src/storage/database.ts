/**
 * WatermelonDB database initialization.
 *
 * Creates a database instance with SQLite adapter (native) or LokiJS (fallback).
 * Registers the schema, model classes, and migrations.
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
  // Use JSI for performance
  jsi: true,
  dbName: 'groceryapp',
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
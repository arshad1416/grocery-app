/**
 * WatermelonDB migrations for schema version upgrades.
 *
 * Migration path:
 *   v1 → v2: Add `family_id` column to `grocery_items` table.
 *            Add `is_deleted` + `deleted_at` to `grocery_lists` and `family_members`.
 */

import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    // v1 → v2: Add family_id to grocery_items, soft-delete columns to lists and members
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'grocery_items',
          columns: [
            { name: 'family_id', type: 'string' },
          ],
        }),
        addColumns({
          table: 'grocery_lists',
          columns: [
            { name: 'is_deleted', type: 'boolean' },
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'family_members',
          columns: [
            { name: 'is_deleted', type: 'boolean' },
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
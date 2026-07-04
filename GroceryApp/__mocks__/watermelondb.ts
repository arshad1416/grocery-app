/**
 * Mock for @nozbe/watermelondb.
 * Provides a minimal Database class for testing.
 */

const tables = new Map<string, Map<string, any>>();

class Query {
  private table: string;
  private _where: any[] = [];

  constructor(table: string) {
    this.table = table;
  }

  where(...args: any[]): Query {
    this._where.push(args);
    return this;
  }

  async fetch(): Promise<any[]> {
    const items = tables.get(this.table);
    if (!items) return [];
    return Array.from(items.values())
      .filter((item) => !item._raw?.isDeleted)
      .map((item) => ({
        ...item,
        update: async (fn: (r: any) => void) => {
          // Create a proxy record so mutations affect the stored data
          const record: any = {};
          Object.keys(item).forEach((k) => { record[k] = item[k]; });
          fn(record);
          Object.keys(record).forEach((k) => { item[k] = record[k]; });
        },
        markAsDeleted: async () => {
          item._raw = { ...(item._raw || {}), isDeleted: true };
        },
      }));
  }
}

class Collection {
  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  query(...args: any[]): Query {
    const q = new Query(this.table);
    return q;
  }

  async create(fn: (r: any) => void): Promise<any> {
    if (!tables.has(this.table)) {
      tables.set(this.table, new Map());
    }
    const items = tables.get(this.table)!;
    const record: any = { _raw: {} };
    fn(record);
    // Auto-generate an id when the creator didn't set one (matches real
    // WatermelonDB behavior of assigning a random id on create)
    if (!record.id && !record._raw.id) {
      record.id = `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      record._raw.id = record.id;
    }
    items.set(record._raw?.id || record.id, record);
    return record;
  }
}

export class Database {
  constructor(_opts?: any) {}

  get(table: string): Collection {
    return new Collection(table);
  }

  async write<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export const Q = {
  where: (field: string, value: any) => ({ field, value }),
};

// ─── Schema / migration / adapter / model shims ─────────────────────────────
// jest moduleNameMapper points every @nozbe/watermelondb subpath at this file,
// so it must also cover schema helpers, migrations, decorators, and the
// SQLite adapter used by src/storage/database.ts.

export const appSchema = (x: any) => x;
export const tableSchema = (x: any) => x;
export const schemaMigrations = (x: any) => x;
export const addColumns = (x: any) => x;
export const createTable = (x: any) => x;

export class Model {
  static table: string;
}

// Legacy TS decorators used in src/storage/models.ts — no-ops in tests
export const field = (_name: string) => (_target: any, _key: string) => {};
export const relation = (_table: string, _key: string) => (_target: any, _key2: string) => {};
export const readonly = (_target: any, _key: string) => {};
export const date = (_name: string) => (_target: any, _key: string) => {};

// Default export doubles as SQLiteAdapter for `adapters/sqlite`
export default class SQLiteAdapter {
  constructor(_opts?: any) {}
}

export function _resetDB(): void {
  tables.clear();
}

export function _getTable(table: string): Map<string, any> {
  return tables.get(table) || new Map();
}
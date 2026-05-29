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
    items.set(record._raw?.id || record.id, record);
    return record;
  }
}

export class Database {
  get(table: string): Collection {
    return new Collection(table);
  }
}

export const Q = {
  where: (field: string, value: any) => ({ field, value }),
};

export function _resetDB(): void {
  tables.clear();
}

export function _getTable(table: string): Map<string, any> {
  return tables.get(table) || new Map();
}
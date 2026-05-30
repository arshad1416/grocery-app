/**
 * Pool Server — In-Memory Aggregation Store.
 *
 * Key format: storeId:normalizedName:flyerWeek
 * Stores prices without contributor info, IP, or fine timestamps.
 *
 * Methods:
 *  - addReport(key, price) — stores a price report
 *  - getAggregates(storeId) — returns aggregated prices for a store
 *  - getExpired() — returns keys where validTo < now
 *  - seed(data) — bulk insert for test seeding
 *  - getAll() — debug/seed inspection
 */

const { aggregatePriceReports } = require('./aggregator');

class PoolStore {
  constructor() {
    /** @type {Map<string, { prices: number[], validTo: number }>} */
    this._store = new Map();
  }

  /**
   * Build the store key from storeId, normalizedName, and flyerWeek.
   * @param {string} storeId
   * @param {string} normalizedName
   * @param {string} flyerWeek
   * @returns {string}
   */
  _makeKey(storeId, normalizedName, flyerWeek) {
    return `${storeId}:${normalizedName}:${flyerWeek}`;
  }

  /**
   * Add a price report for a given key.
   * No contributor info, no IP, no fine timestamp stored.
   *
   * @param {string} key - storeId:normalizedName:flyerWeek
   * @param {number} price
   * @param {number} validTo - epoch ms when this report expires
   */
  addReport(key, price, validTo) {
    if (!this._store.has(key)) {
      this._store.set(key, { prices: [], validTo });
    }
    const entry = this._store.get(key);
    // Purge expired prices from this entry before appending
    const expiredThreshold = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90-day window
    entry.prices = entry.prices.filter(p => p > expiredThreshold);
    // Cap at 500 prices per key (prevents unbounded growth)
    if (entry.prices.length >= 500) {
      entry.prices.shift(); // drop oldest
    }
    entry.prices.push(price);
    // Use the latest validTo
    if (validTo > entry.validTo) {
      entry.validTo = validTo;
    }
  }

  /**
   * Get aggregated prices for a store.
   * Filters out expired entries, aggregates remaining ones.
   *
   * @param {string} storeId
   * @returns {Array<{ itemName: string, flyerWeek: string, median: number|null, count: number, stdev: number|null, validTo: number }>}
   */
  getAggregates(storeId) {
    const now = Date.now();
    const results = [];

    for (const [key, entry] of this._store) {
      if (entry.validTo <= now) continue; // expired

      const parts = key.split(':');
      if (parts[0] !== storeId) continue;

      const normalizedName = parts[1];
      const flyerWeek = parts[2];
      const agg = aggregatePriceReports(entry.prices);

      results.push({
        itemName: normalizedName,
        flyerWeek,
        median: agg.median,
        count: agg.count,
        stdev: agg.stdev,
        validTo: entry.validTo,
      });
    }

    return results;
  }

  /**
   * Get keys of expired entries.
   * @returns {string[]}
   */
  getExpired() {
    const now = Date.now();
    const expired = [];
    for (const [key, entry] of this._store) {
      if (entry.validTo <= now) {
        expired.push(key);
      }
    }
    return expired;
  }

  /**
   * Seed data for testing. Accepts array of { key, price, validTo } objects.
   * @param {Array<{ key: string, price: number, validTo: number }>} data
   */
  seed(data) {
    for (const item of data) {
      this.addReport(item.key, item.price, item.validTo);
    }
  }

  /**
   * Get all entries (debug/inspection).
   * @returns {Array<{ key: string, prices: number[], validTo: number }>}
   */
  getAll() {
    const entries = [];
    for (const [key, entry] of this._store) {
      entries.push({ key, prices: [...entry.prices], validTo: entry.validTo });
    }
    return entries;
  }
}

module.exports = { PoolStore };

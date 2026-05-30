/**
 * Price Subsystem — Flyer Price Types.
 *
 * Types for the flyer-scanning price pipeline: scanned flyer prices,
 * the extractor interface, and pipeline result types.
 *
 * Stage 1: Types + mock extractor. Real AI extraction comes later.
 */

import type { SaleInfo } from './types';

// ─── ScannedFlyerPrice ───────────────────────────────────────────────────────

/**
 * A single price entry extracted from a scanned flyer page.
 */
export interface ScannedFlyerPrice {
  /** Normalized item name (e.g. "organic whole milk") */
  itemName: string;
  /** Store ID this price applies to */
  storeId: string;
  /** Store display name */
  storeName: string;
  /** Display price from the flyer */
  price: number;
  /** Unit of measurement (e.g. "kg", "L", "each") */
  unit: string;
  /** Quantity in the given unit */
  quantity: number;
  /** Optional sale info detected on the flyer */
  saleInfo?: SaleInfo | null;
  /** Unix timestamp when the flyer was scanned */
  scannedAt: number;
  /** Unix timestamp when the sale ends (from flyer valid-to date) */
  validTo: number | null;
  /** Confidence score 0–1 from the extraction pipeline */
  confidence: number;
}

// ─── FlyerExtractor Interface ────────────────────────────────────────────────

/**
 * Extractor interface for extracting prices from flyer images.
 * Stage 1 uses a mock implementation; real AI extraction comes later.
 */
export interface FlyerExtractor {
  /**
   * Extract scanned flyer prices from an image.
   * The image is a file URI or base64 data URL.
   * Returns an array of ScannedFlyerPrice entries found on the page.
   */
  extract(image: string): Promise<ScannedFlyerPrice[]>;
}

// ─── Pipeline Types ──────────────────────────────────────────────────────────

/**
 * Result of running a single image through the flyer pipeline.
 */
export interface FlyerPipelineResult {
  /** The original image URI that was processed */
  imageUri: string;
  /** Extracted prices (empty if extraction failed or was discarded) */
  prices: ScannedFlyerPrice[];
  /** Whether the image was discarded after processing */
  discarded: boolean;
  /** Error message if processing failed */
  error?: string;
}

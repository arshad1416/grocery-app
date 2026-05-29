/**
 * Price Subsystem — Core Types.
 *
 * Types for the price subsystem: price sources, confidence levels,
 * sale detection, and crowd-sourced price submissions.
 */

export type PriceSourceTier = 'official' | 'crowd' | 'scraping';

export type ConfidenceLevel = 'real_time' | 'recent' | 'stale' | 'estimated';

export interface SaleInfo {
  isOnSale: boolean;
  salePrice: number;
  regularPrice: number;
  saleEndDate: number | null;
  /** Negative = real savings, positive = fake markdown */
  unitPriceVsRegular: number;
  savingsPercent: number;
}

export interface PriceResult {
  price: number;
  unitPrice: number;
  unit: string;
  saleInfo: SaleInfo | null;
  source: PriceSource;
  timestamp: number;
  confidence: ConfidenceLevel;
}

export interface PriceSource {
  adapterId: string;
  tier: PriceSourceTier;
  storeId: string;
  storeName: string;
}

export interface SubmittedPrice {
  id: string;
  itemName: string;
  storeId: string;
  storeName: string;
  price: number;
  unit: string;
  quantity: number;
  timestamp: number;
  submittedBy: string; // deviceId or family member
}

/** Normalized item name → store key for internal price maps */
export type NormalizedItemKey = string;
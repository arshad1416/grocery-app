/**
 * store-branding — Shared store logo, color, and initial helpers.
 *
 * Single source of truth for store visuals used by StoreCard,
 * TripPlanSheet, StoreTotalBar, and any future component.
 */

import { Image } from 'react-native';
import React from 'react';

type StoreLogoSize = 18 | 24 | 32 | 40;

const STORE_LOGOS: Record<string, any> = {
  'no-frills': require('../../assets/nofrills_logo.png'),
  'nofrills': require('../../assets/nofrills_logo.png'),
  'food-basics': require('../../assets/foodbasics_logo.png'),
  'foodbasics': require('../../assets/foodbasics_logo.png'),
  'metro': require('../../assets/metro_logo.png'),
  'walmart': require('../../assets/walmart_logo.png'),
  'freshco': require('../../assets/freshco_logo.png'),
  'foodland': require('../../assets/foodland_logo.png'),
  'loblaws': require('../../assets/loblaws_logo.png'),
};

const STORE_COLORS: Record<string, string> = {
  'no-frills': '#FFD700', 'nofrills': '#FFD700',
  'food-basics': '#FF4444', 'foodbasics': '#FF4444',
  'freshco': '#FF6600',
  'metro': '#E53935',
  'walmart': '#0071CE',
  'loblaws': '#E53935',
  'foodland': '#228B22',
};

export function getStoreLogo(storeId: string, size: StoreLogoSize = 32) {
  const source = STORE_LOGOS[storeId] ?? STORE_LOGOS[storeId.toLowerCase()];
  if (!source) return null;
  return source;
}

export function StoreLogo({ storeId, size = 32 }: { storeId: string; size?: StoreLogoSize }) {
  const source = STORE_LOGOS[storeId] ?? STORE_LOGOS[storeId.toLowerCase()];
  if (!source) return null;
  return React.createElement(Image, {
    source,
    style: { width: size, height: size, borderRadius: size >= 32 ? 4 : 3 },
    resizeMode: 'contain',
  });
}

export function getStoreColor(storeId: string): string {
  return STORE_COLORS[storeId.toLowerCase()] ?? '#16A34A';
}

export function getStoreInitial(storeName: string): string {
  if (!storeName) return '?';
  return storeName.charAt(0).toUpperCase();
}

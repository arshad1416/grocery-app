/**
 * PriceBadge — Compact price display component for grocery item rows.
 *
 * Displays:
 *  - Regular price: "$3.49" in grey
 *  - Sale: "~~$4.99~~  $3.49" with strikethrough, green savings badge
 *  - Unit price: tiny grey text below "$1.50/100g"
 *  - Source badge: tiny colored badge ("Crowd", "Instacart", "Scrape")
 *  - "FAKE SALE" in red if unitPriceVsRegular > 0
 *  - Loading shimmer when isLoading is true
 *  - Empty space when no price data
 */

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { PriceResult } from '../pricing/types';
import { formatUnitPrice } from '../pricing/normalizer';

// ─── Props ──────────────────────────────────────────────────────────────────

interface PriceBadgeProps {
  price: PriceResult | null;
  isLoading?: boolean;
}

// ─── Source Badge Color Map ────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  crowdsourced: '#FF9800',
  instacart: '#4CAF50',
  scraping: '#9C27B0',
};

// ─── Shimmer / Skeleton ────────────────────────────────────────────────────

function ShimmerBadge() {
  return (
    <View style={styles.badgeContainer}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: 40, marginTop: 3 }]} />
    </View>
  );
}

// ─── PriceBadge Component ──────────────────────────────────────────────────

export default function PriceBadge({ price, isLoading }: PriceBadgeProps) {
  if (isLoading) {
    return <ShimmerBadge />;
  }

  if (!price) {
    return null; // empty space
  }

  const { saleInfo, source } = price;
  const isFakeSale = saleInfo && saleInfo.unitPriceVsRegular > 0;
  const isGenuineSale = saleInfo && saleInfo.isOnSale && !isFakeSale;

  const sourceColor = SOURCE_COLORS[source.adapterId] ?? '#999';
  const sourceLabel =
    source.adapterId === 'crowdsourced'
      ? 'Crowd'
      : source.adapterId === 'instacart'
        ? 'Instacart'
        : source.adapterId === 'scraping'
          ? 'Scrape'
          : source.adapterId;

  // Format the unit price using the normalizer
  const unitPriceStr = price.unit
    ? formatUnitPrice(price.unitPrice, '/' + price.unit)
    : '';

  // Format the regular price for display
  const formatPrice = (val: number) => `$${val.toFixed(2)}`;

  return (
    <View style={styles.badgeContainer}>
      {/* Sale or regular price */}
      <View style={styles.priceRow}>
        {isGenuineSale && saleInfo ? (
          <View style={styles.saleRow}>
            <Text style={styles.regularPrice}>
              ~~{formatPrice(saleInfo.regularPrice)}~~
            </Text>
            <Text style={styles.salePrice}> {formatPrice(price.price)}</Text>
            {saleInfo.savingsPercent > 0 && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>
                  -{saleInfo.savingsPercent}%
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={isFakeSale ? styles.fakeSalePrice : styles.regularPrice}>
            {formatPrice(price.price)}
          </Text>
        )}

        {/* Fake sale indicator */}
        {isFakeSale && (
          <Text style={styles.fakeSaleLabel}> FAKE SALE</Text>
        )}
      </View>

      {/* Unit price */}
      {unitPriceStr ? (
        <Text style={styles.unitPrice}>{unitPriceStr}</Text>
      ) : null}

      {/* Source badge */}
      <View style={[styles.sourceBadge, { backgroundColor: sourceColor }]}>
        <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badgeContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 60,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  regularPrice: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  salePrice: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '700',
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  savingsBadge: {
    backgroundColor: '#C8E6C9',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 4,
  },
  savingsText: {
    fontSize: 9,
    color: '#2E7D32',
    fontWeight: '700',
  },
  fakeSalePrice: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '600',
  },
  fakeSaleLabel: {
    fontSize: 8,
    color: '#D32F2F',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unitPrice: {
    fontSize: 9,
    color: '#aaa',
    marginTop: 1,
  },
  sourceBadge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
  },
  sourceBadgeText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '600',
  },
  skeletonLine: {
    width: 50,
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
  },
});
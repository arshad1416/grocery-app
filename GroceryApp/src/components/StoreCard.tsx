/**
 * StoreCard — Horizontal scroll card for store selection.
 * Shows store name + total price. Selected card has green glow/highlight.
 *
 * The total only ever covers the items this store has a price for, so the card
 * always states that coverage ("1 of 8 priced"). Without it, a $1.15 total on
 * an 8-item list reads as a whole-basket price and the store-to-store
 * comparison is meaningless. Pass `total={null}` when no prices are known.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Platform, Image } from 'react-native';
import { useActiveTheme } from '../state/useThemeStore';
import { themeColors } from './groceryTheme';
import { getStoreColor, getStoreInitial, getStoreLogo } from '../pricing/store-branding';

interface StoreCardProps {
  storeName: string;
  storeId: string;
  /** Sum of the priced items only. `null` when no price is known here yet. */
  total: number | null;
  /** How many of `itemCount` lines are actually priced at this store. */
  pricedCount: number;
  /** Lines on the list the total is being compared against. */
  itemCount: number;
  isSelected: boolean;
  onPress: () => void;
}


export default function StoreCard({
  storeName,
  storeId,
  total,
  pricedCount,
  itemCount,
  isSelected,
  onPress,
}: StoreCardProps) {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const theme = isDark ? themeColors.dark : themeColors.light;
  const storeColor = getStoreColor(storeId);
  const logoSource = getStoreLogo(storeId.toLowerCase());

  const hasPrices = total !== null && pricedCount > 0;
  const isFullyPriced = hasPrices && pricedCount === itemCount;
  const coverageLabel = !hasPrices
    ? 'No prices yet'
    : isFullyPriced
      ? `${itemCount} item${itemCount !== 1 ? 's' : ''}`
      : `${pricedCount} of ${itemCount} priced`;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSelected
          ? {
              backgroundColor: theme.bestValueBg,
              borderColor: theme.bestValueBorder,
              shadowColor: theme.primary,
              shadowOpacity: isDark ? 0.15 : 0.08,
            }
          : {
              backgroundColor: theme.cardBg,
              borderColor: theme.border,
              shadowOpacity: 0,
            },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={
        hasPrices
          ? `${storeName}, $${total.toFixed(2)} for ${pricedCount} of ${itemCount} item${itemCount !== 1 ? 's' : ''} priced here`
          : `${storeName}, no prices yet`
      }
    >
      <View style={styles.topRow}>
        {logoSource ? (
          <Image
            source={logoSource}
            style={styles.logoImage}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.initialBadge, { backgroundColor: storeColor + '20' }]}>
            <Text style={[styles.initialText, { color: storeColor }]}>
              {getStoreInitial(storeName)}
            </Text>
          </View>
        )}
        {isSelected && (
          <View style={[styles.selectedDot, { backgroundColor: theme.primary }]} />
        )}
      </View>
      <Text
        style={[
          styles.storeName,
          { color: theme.text },
          isSelected && { fontWeight: '700' },
        ]}
        numberOfLines={1}
      >
        {storeName}
      </Text>
      <Text style={[styles.total, { color: isSelected ? theme.primary : theme.secondaryText }]}>
        {hasPrices ? `$${total.toFixed(2)}` : '—'}
      </Text>
      <Text
        style={[styles.itemCount, { color: theme.secondaryText }]}
        numberOfLines={1}
      >
        {coverageLabel}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 130,
    borderRadius: 16,
    padding: 12,
    marginRight: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  initialBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialText: {
    fontSize: 14,
    fontWeight: '700',
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemCount: {
    fontSize: 11,
  },
});

/**
 * StoreCard — Horizontal scroll card for store selection.
 * Shows store name + total price. Selected card has green glow/highlight.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Platform } from 'react-native';
import { useActiveTheme } from '../state/useThemeStore';
import { themeColors } from './groceryTheme';

interface StoreCardProps {
  storeName: string;
  storeId: string;
  total: number;
  itemCount: number;
  isSelected: boolean;
  onPress: () => void;
}

const STORE_COLORS: Record<string, string> = {
  nofrills: '#FFD700',
  foodbasics: '#FF4444',
  metro: '#E53935',
  walmart: '#0071CE',
  freshco: '#FF6600',
  foodland: '#228B22',
};

function getStoreColor(storeId: string): string {
  return STORE_COLORS[storeId.toLowerCase()] ?? '#16A34A';
}

function getStoreInitial(storeName: string): string {
  return storeName.charAt(0).toUpperCase();
}

export default function StoreCard({
  storeName,
  storeId,
  total,
  itemCount,
  isSelected,
  onPress,
}: StoreCardProps) {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const theme = isDark ? themeColors.dark : themeColors.light;
  const storeColor = getStoreColor(storeId);

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
    >
      <View style={styles.topRow}>
        <View style={[styles.initialBadge, { backgroundColor: storeColor + '20' }]}>
          <Text style={[styles.initialText, { color: storeColor }]}>
            {getStoreInitial(storeName)}
          </Text>
        </View>
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
        ${total.toFixed(2)}
      </Text>
      <Text style={[styles.itemCount, { color: theme.secondaryText }]}>
        {itemCount} item{itemCount !== 1 ? 's' : ''}
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
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialText: {
    fontSize: 14,
    fontWeight: '700',
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

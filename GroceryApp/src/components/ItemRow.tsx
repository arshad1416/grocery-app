/**
 * ItemRow — Renders a single grocery item with check, name, price badge, and quantity.
 */

import React, { memo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import type { GroceryItem } from '../types';
import type { PriceResult } from '../pricing/types';
import PriceBadge from './PriceBadge';
import { useActiveTheme } from '../state/useThemeStore';
import { themeColors } from './groceryTheme';

export interface ItemRowProps {
  item: GroceryItem;
  onToggle: (id: string) => void;
  onPress: (item: GroceryItem) => void;
  onDelete: (id: string, name: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
  price?: PriceResult | null;
  priceLoading?: boolean;
  onClaim?: (id: string) => void;
  onUnclaim?: (id: string) => void;
  /** Display name of the claiming device (for UI rendering). */
  claimerName?: string;
  /** Whether the claim has expired */
  claimExpired?: boolean;
}

const ItemRow = memo(function ItemRow({ item, onToggle, onPress, onDelete, onMoveUp, onMoveDown, isFirst, isLast, price, priceLoading }: ItemRowProps) {
  const isClaimed = !!item.claimedBy && !!item.claimedAt;
  const claimExpired = isClaimed && item.claimedAt
    ? Date.now() - item.claimedAt >= 30 * 60 * 1000 // 30 min
    : false;
  const activeTheme = useActiveTheme();
  const theme = activeTheme === 'dark' ? themeColors.dark : themeColors.light;
  const isDark = activeTheme === 'dark';

  // Scale animation for checkbox
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // Strikethrough width animation (0 → 1 over the text)
  const strikeAnim = useRef(new Animated.Value(item.isChecked ? 1 : 0)).current;

  // Keep strikeAnim in sync if item.isChecked changes externally
  useEffect(() => {
    Animated.timing(strikeAnim, {
      toValue: item.isChecked ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [item.isChecked, strikeAnim]);

  const handleCheckToggle = useCallback(() => {
    // Bounce scale animation
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.2,
        useNativeDriver: true,
        damping: 8,
        stiffness: 200,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 8,
        stiffness: 200,
      }),
    ]).start();

    // Strikethrough animation — interpolate to new value
    const targetValue = item.isChecked ? 0 : 1;
    Animated.timing(strikeAnim, {
      toValue: targetValue,
      duration: 200,
      useNativeDriver: false,
    }).start();

    onToggle(item.id);
  }, [item.isChecked, item.id, onToggle, scaleAnim, strikeAnim]);

  const strikeWidth = strikeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.itemRowContainer}>
      {/* Reorder buttons — only show when both handlers are provided */}
      {onMoveUp && onMoveDown ? (
        <View style={styles.reorderButtons}>
          <TouchableOpacity
            style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
            onPress={() => onMoveUp(item.id)}
            disabled={isFirst}
          >
            <Text style={[styles.reorderBtnText, { color: theme.secondaryText }, isFirst && styles.reorderBtnTextDisabled]}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
            onPress={() => onMoveDown(item.id)}
            disabled={isLast}
          >
            <Text style={[styles.reorderBtnText, { color: theme.secondaryText }, isLast && styles.reorderBtnTextDisabled]}>▼</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.reorderButtons, styles.reorderButtonsHidden]} />
      )}
      {/* Main item row */}
      <TouchableOpacity
        style={[
          styles.itemRow,
          item.isChecked && styles.itemRowChecked,
          { backgroundColor: theme.cardBg, borderBottomColor: theme.border },
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => onDelete(item.id, item.name)}
        activeOpacity={0.7}
      >
        {/* Animated Checkbox */}
        <TouchableOpacity
          style={[
            styles.checkbox,
            item.isChecked && styles.checkboxChecked,
            {
              borderColor: item.isChecked ? theme.primary : theme.border,
              backgroundColor: item.isChecked ? theme.primary : 'transparent',
            },
          ]}
          onPress={handleCheckToggle}
        >
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            {item.isChecked && <Text style={styles.checkmark}>✓</Text>}
          </Animated.View>
        </TouchableOpacity>

        {/* Item info with strikethrough */}
        <View style={styles.itemInfo}>
          <View style={styles.itemNameContainer}>
            <Text
              style={[
                styles.itemName,
                item.isChecked && styles.itemNameChecked,
                { color: theme.text },
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.isChecked && (
              <Animated.View
                style={[
                  styles.strikethrough,
                  { width: strikeWidth, backgroundColor: theme.secondaryText },
                ]}
                pointerEvents="none"
              />
            )}
          </View>
          {item.notes ? (
            <Text style={[styles.itemNotes, { color: theme.secondaryText }]} numberOfLines={1}>
              {item.notes}
            </Text>
          ) : null}
        </View>

        {/* Price badge */}
        <PriceBadge price={price ?? null} isLoading={priceLoading} />

        {/* Quantity + Unit */}
        <View style={[styles.quantityBadge, { backgroundColor: isDark ? '#334155' : '#f0f0f0' }]}>
          <Text style={[styles.quantityText, { color: theme.secondaryText }]}>
            {item.quantity} {item.unit}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});

export default ItemRow;

const styles = StyleSheet.create({
  itemRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  reorderButtons: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  reorderButtonsHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  reorderBtn: {
    width: 24,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderBtnDisabled: {
    opacity: 0.2,
  },
  reorderBtnText: {
    fontSize: 10,
    color: '#999',
  },
  reorderBtnTextDisabled: {
    color: '#ddd',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 0,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flex: 1,
  },
  itemRowChecked: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemNameContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  itemName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  itemNameChecked: {
    color: '#999',
  },
  strikethrough: {
    position: 'absolute',
    left: 0,
    top: '50%',
    height: 1.5,
    backgroundColor: '#999',
    borderRadius: 1,
  },
  itemNotes: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  quantityBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quantityText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
});

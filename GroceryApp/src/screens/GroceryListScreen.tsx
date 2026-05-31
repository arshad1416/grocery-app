/**
 * GroceryListScreen — main list view.
 *
 * Displays items grouped by category, with check-off, reorder, search,
 * FAB add button, and sync indicator.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SectionList,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroceryItem, SyncState, GroceryCategory } from '../types';
import type { PriceResult } from '../pricing/types';
import { BUILT_IN_CATEGORIES, STORE_PLAN_CATEGORY_ORDER } from '../types';
import { useGroceryStore } from '../state/useGroceryStore';
import { useSyncStore } from '../state/useSyncStore';
import { getListMeta } from '../sync/yjs-adapter';
import type { RootStackParamList } from '../navigation/deepLinks';
import AddItemSheet from './AddItemSheet';
import PriceBadge from '../components/PriceBadge';
import StopOptimizer from '../components/StopOptimizer';
import UndoToast from '../components/UndoToast';
import { usePriceStore } from '../pricing/price-store';
import { CLAIM_EXPIRY_MS } from '../sync/yjs-adapter';
import { useThemeStore, useActiveTheme } from '../state/useThemeStore';
import { computeStopProposals } from '../pricing/stop-optimizer';
// ─── Theme Colors ────────────────────────────────────────────────────────────

const themeColors = {
  light: {
    bg: '#F8FAFC',
    cardBg: '#FFFFFF',
    text: '#0F172A',
    secondaryText: '#64748B',
    border: '#E2E8F0',
    primary: '#10B981',
    headerBg: '#FFFFFF',
    inputBg: '#F1F5F9',
    divider: '#E2E8F0',
    pillUnselectedBg: '#FFFFFF',
    pillUnselectedBorder: '#E2E8F0',
    pillSelectedBg: '#10B981',
    pillCheapestBg: '#DEF7EC',
    pillCheapestBorder: '#10B981',
  },
  dark: {
    bg: '#0B0F19',
    cardBg: '#1E293B',
    text: '#F8FAFC',
    secondaryText: '#94A3B8',
    border: '#334155',
    primary: '#10B981',
    headerBg: '#1E293B',
    inputBg: '#1E293B',
    divider: '#334155',
    pillUnselectedBg: '#1E293B',
    pillUnselectedBorder: '#334155',
    pillSelectedBg: '#10B981',
    pillCheapestBg: '#0B2518',
    pillCheapestBorder: '#10B981',
  },
};

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Props ──────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'GroceryList'>;

// ─── Sync Indicator ──────────────────────────────────────────────────────────

function SyncIndicator() {
  const syncState: SyncState = useSyncStore((s) => s.syncState);
  const lastSyncedAt: number | null = useSyncStore((s) => s.lastSyncedAt);
  const activeTheme = useActiveTheme();
  const theme = activeTheme === 'dark' ? themeColors.dark : themeColors.light;

  const color =
    syncState === 'syncing'
      ? '#FF9800'
      : syncState === 'error'
        ? '#f44336'
        : syncState === 'offline'
          ? '#999'
          : '#10B981';

  const label =
    syncState === 'syncing'
      ? 'Syncing...'
      : syncState === 'error'
        ? 'Sync error'
        : syncState === 'offline'
          ? 'Offline'
          : 'Synced';

  const timeLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString()
    : '';

  return (
    <View style={styles.syncIndicator}>
      <View style={[styles.syncDot, { backgroundColor: color }]} />
      <Text style={[styles.syncText, { color: theme.secondaryText }]}>
        {label}
        {timeLabel ? ` · ${timeLabel}` : ''}
      </Text>
    </View>
  );
}

// ─── Category Color Map ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  produce: '#4CAF50',
  dairy: '#2196F3',
  meat: '#f44336',
  bakery: '#FF9800',
  frozen: '#00BCD4',
  pantry: '#9C27B0',
  beverages: '#795548',
  other: '#607D8B',
};

function getCategoryColor(category: string): string {
  if (category.toLowerCase().startsWith('stop ')) {
    return '#10B981';
  }
  return CATEGORY_COLORS[category] ?? '#607D8B';
}

// ─── Item Row ────────────────────────────────────────────────────────────────

interface ItemRowProps {
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

function ItemRow({ item, onToggle, onPress, onDelete, onMoveUp, onMoveDown, isFirst, isLast, price, priceLoading }: ItemRowProps) {
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
}

// ─── Category Header ─────────────────────────────────────────────────────────

interface CategoryHeaderProps {
  category: string;
  count: number;
  subtotal?: number;
}

function CategoryHeader({ category, count, subtotal }: CategoryHeaderProps) {
  const activeTheme = useActiveTheme();
  const theme = activeTheme === 'dark' ? themeColors.dark : themeColors.light;
  const color = getCategoryColor(category);

  return (
    <View style={[styles.categoryHeader, { borderLeftColor: color, backgroundColor: theme.cardBg }]}>
      <Text style={[styles.categoryTitle, { color }]}>
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {subtotal !== undefined && (
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.primary, marginRight: 10 }}>
            Subtotal: ${subtotal.toFixed(2)}
          </Text>
        )}
        <Text style={[styles.categoryCount, { color: theme.secondaryText }]}>{count}</Text>
      </View>
    </View>
  );
}

// ─── "Got It ✓" Section Header ──────────────────────────────────────────────

interface GotItHeaderProps {
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function GotItHeader({ count, isExpanded, onToggle }: GotItHeaderProps) {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const theme = isDark ? themeColors.dark : themeColors.light;

  return (
    <TouchableOpacity
      style={[
        styles.gotItHeader,
        {
          backgroundColor: isDark ? '#0B2518' : '#E8F5E9',
          borderLeftColor: '#10B981',
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.gotItHeaderLeft}>
        <Text style={styles.gotItIcon}>✓</Text>
        <Text style={[styles.gotItTitle, { color: isDark ? '#34D399' : '#2E7D32' }]}>Got It</Text>
      </View>
      <View style={styles.gotItHeaderRight}>
        <Text style={[styles.gotItCount, { color: isDark ? '#a7f3d0' : '#558B2F' }]}>
          {count} {count === 1 ? 'item' : 'items'}
        </Text>
        <Text style={[styles.gotItChevron, { color: isDark ? '#a7f3d0' : '#558B2F' }]}>{isExpanded ? '▼' : '▶'}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Store Total Bar ────────────────────────────────────────────────────────────

interface StoreTotal {
  storeId: string;
  storeName: string;
  total: number;
}

interface StoreTotalBarProps {
  storeTotals: StoreTotal[];
  selectedStoreId: string | null;
  onSelectStore: (storeId: string | null) => void;
}

function StoreTotalBar({ storeTotals, selectedStoreId, onSelectStore }: StoreTotalBarProps) {
  if (storeTotals.length === 0) return null;

  const activeTheme = useActiveTheme();
  const theme = activeTheme === 'dark' ? themeColors.dark : themeColors.light;
  const isDark = activeTheme === 'dark';

  const cheapestId = storeTotals[0]?.storeId;

  return (
    <View style={styles.storeTotalBarContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storeTotalBarScroll}
      >
        <TouchableOpacity
          style={[
            styles.storeTotalPill,
            {
              backgroundColor: selectedStoreId === null ? theme.primary : theme.cardBg,
              borderColor: selectedStoreId === null ? theme.primary : theme.border,
            },
          ]}
          onPress={() => onSelectStore(null)}
        >
          <Text style={[
            styles.storeTotalPillText,
            { color: selectedStoreId === null ? '#fff' : theme.text },
          ]}>All Categories</Text>
        </TouchableOpacity>
        {storeTotals.map((st) => {
          const isSelected = selectedStoreId === st.storeId;
          const isCheapest = st.storeId === cheapestId && selectedStoreId === null;
          return (
            <TouchableOpacity
              key={st.storeId}
              style={[
                styles.storeTotalPill,
                {
                  backgroundColor: isSelected
                    ? theme.primary
                    : isCheapest
                      ? theme.pillCheapestBg
                      : theme.pillUnselectedBg,
                  borderColor: isSelected
                    ? theme.primary
                    : isCheapest
                      ? theme.pillCheapestBorder
                      : theme.pillUnselectedBorder,
                },
              ]}
              onPress={() => onSelectStore(isSelected ? null : st.storeId)}
            >
              <Text style={[
                styles.storeTotalPillText,
                { color: isSelected ? '#fff' : theme.text },
              ]}>
                {st.storeName}
              </Text>
              <View style={[
                styles.storeTotalBadge,
                {
                  backgroundColor: isSelected
                    ? 'rgba(255,255,255,0.3)'
                    : isCheapest
                      ? '#10B981'
                      : isDark
                        ? '#334155'
                        : '#f0f0f0',
                },
              ]}>
                <Text style={[
                  styles.storeTotalBadgeText,
                  { color: isSelected || isCheapest ? '#fff' : theme.text },
                ]}>
                  ${st.total.toFixed(2)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

// Known store IDs to load prices from
const ALL_STORE_IDS = ['no-frills', 'loblaws', 'freshco', 'metro', 'walmart', 'food-basics'] as const;

const STORE_NAME_MAP: Record<string, string> = {
  'no-frills': 'No Frills',
  'loblaws': 'Loblaws',
  'freshco': 'FreshCo',
  'metro': 'Metro',
  'walmart': 'Walmart',
  'food-basics': 'Food Basics',
};

export default function GroceryListScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const insets = useSafeAreaInsets();

  const themeMode = useThemeStore((s) => s.themeMode);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const theme = isDark ? themeColors.dark : themeColors.light;

  // Stores
  const items = useGroceryStore((s) => s.items);
  const isLoading = useGroceryStore((s) => s.isLoading);
  const error = useGroceryStore((s) => s.error);
  const loadItems = useGroceryStore((s) => s.loadItems);
  const toggleChecked = useGroceryStore((s) => s.toggleChecked);
  const deleteItem = useGroceryStore((s) => s.deleteItem);
  const reorderItem = useGroceryStore((s) => s.reorderItem);
  const claimItem = useGroceryStore((s) => s.claimItem);
  const unclaimItem = useGroceryStore((s) => s.unclaimItem);

  // Price store
  const prices = usePriceStore((s) => s.prices);
  const priceLoading = usePriceStore((s) => s.isLoading);
  const itemLoading = usePriceStore((s) => s.itemLoading);
  const loadPricesForAllStores = usePriceStore((s) => s.loadPricesForAllStores);
  const perStorePrices = usePriceStore((s) => s.perStorePrices);
  const getStoreIdsWithPrices = usePriceStore((s) => s.getStoreIdsWithPrices);

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [listName, setListName] = useState('Grocery List');
  const [gotItExpanded, setGotItExpanded] = useState(false);
  const [toastState, setToastState] = useState<{
    visible: boolean;
    message: string;
    itemId: string;
  } | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedRouteNumStops, setSelectedRouteNumStops] = useState<number | null>(null);

  // Filtered unchecked items for stop optimizer
  const filteredUncheckedItems = useMemo(() => {
    return Object.values(items)
      .filter(
        (i) => !i.isDeleted && i.listId === listId && !i.isChecked,
      )
      .filter(
        (i) =>
          !searchQuery.trim() ||
          i.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
  }, [items, listId, searchQuery]);

  // Get the best price for an item: per-store price if a store is selected,
  // or cheapest among stores in the selected route if a route is selected, otherwise flat price
  const getItemPrice = useCallback(
    (itemId: string) => {
      if (selectedStoreId && perStorePrices[selectedStoreId]?.[itemId]) {
        return perStorePrices[selectedStoreId][itemId] ?? null;
      }
      if (selectedRouteNumStops) {
        const proposals = computeStopProposals(filteredUncheckedItems, perStorePrices, STORE_NAME_MAP);
        const proposal = proposals.find(p => p.numStops === selectedRouteNumStops);
        if (proposal) {
          let bestPriceResult: PriceResult | null = null;
          let cheapestPrice = Infinity;
          for (const s of proposal.stores) {
            const pr = perStorePrices[s.storeId]?.[itemId];
            if (pr && pr.price < cheapestPrice) {
              cheapestPrice = pr.price;
              bestPriceResult = pr;
            }
          }
          if (bestPriceResult) return bestPriceResult;
        }
      }
      return prices[itemId] ?? null;
    },
    [selectedStoreId, selectedRouteNumStops, perStorePrices, prices, filteredUncheckedItems],
  );
  // Re-render timer for claim-an-item expiry checks (tick every 30s)
  const [, forceRender] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      forceRender((n) => n + 1);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Load items and list name on mount
  useEffect(() => {
    loadItems(listId).catch((err: Error) => {
      Alert.alert('Error', err.message);
    });

    // Load list name from Yjs metadata
    try {
      const meta = getListMeta(listId);
      const name = meta.get('name') as string | undefined;
      if (name) {
        setListName(name);
      }
    } catch {
      // Yjs doc not yet hydrated — use default
    }
  }, [listId, loadItems]);

  // Load prices for visible items across all common stores
  const ALL_STORE_IDS = ['no-frills', 'loblaws', 'freshco', 'metro', 'walmart', 'food-basics'];
  useEffect(() => {
    const visibleItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );
    if (visibleItems.length > 0) {
      loadPricesForAllStores(
        visibleItems.map((item) => ({ id: item.id, name: item.name })),
        ALL_STORE_IDS,
      ).catch(() => {});
    }
  }, [Object.keys(items).length, listId, loadPricesForAllStores]);

  // Filtered and grouped items — unchecked stay in categories, checked go to "Got It"
  const groupedSections = useMemo(() => {
    const allItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );

    // Filter by search
    const filtered = searchQuery.trim()
      ? allItems.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : allItems;

    // Sort by sortOrder
    filtered.sort((a, b) => a.sortOrder - b.sortOrder);

    // Split into unchecked and checked
    const unchecked = filtered.filter((item) => !item.isChecked);
    const checked = filtered.filter((item) => item.isChecked);

    // Group unchecked by category
    const groups: Record<string, GroceryItem[]> = {};
    for (const item of unchecked) {
      const cat = item.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }

    // Build sections in the order of BUILT_IN_CATEGORIES + custom at end
    const sections: { title: string; data: GroceryItem[] }[] = [];
    const builtInSet = new Set(BUILT_IN_CATEGORIES);

    for (const cat of BUILT_IN_CATEGORIES) {
      if (groups[cat]) {
        sections.push({ title: cat, data: groups[cat] });
        delete groups[cat];
      }
    }

    // Remaining custom categories
    for (const cat of Object.keys(groups).sort()) {
      sections.push({ title: cat, data: groups[cat] });
    }

    // Add "Got It" section at the bottom if there are checked items
    if (checked.length > 0) {
      sections.push({
        title: '__got_it__',
        data: gotItExpanded ? checked : [],
      });
    }

    return sections;
  }, [items, listId, searchQuery, gotItExpanded]);

  // ─── Store totals — weighted total per store ───────────────────────────────
  const storeTotals = useMemo(() => {
    const allItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId && !item.isChecked,
    );
    const storeIds = getStoreIdsWithPrices();
    const totals: StoreTotal[] = [];

    for (const storeId of storeIds) {
      const storePrices = perStorePrices[storeId];
      if (!storePrices) continue;

      let total = 0;
      let hasPrice = false;
      for (const item of allItems) {
        const priceResult = storePrices[item.id];
        if (priceResult) {
          total += priceResult.price * item.quantity;
          hasPrice = true;
        }
      }
      if (hasPrice) {
        totals.push({
          storeId,
          storeName: STORE_NAME_MAP[storeId] ?? storeId,
          total,
        });
      }
    }

    totals.sort((a, b) => a.total - b.total);
    return totals;
  }, [items, listId, perStorePrices, getStoreIdsWithPrices]);

  // ─── Store-plan sections — grouped by category for selected store ──────────
  const storePlanSections = useMemo(() => {
    if (!selectedStoreId) return null;

    const allItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );

    const filtered = searchQuery.trim()
      ? allItems.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : allItems;

    filtered.sort((a, b) => a.sortOrder - b.sortOrder);

    const unchecked = filtered.filter((item) => !item.isChecked);
    const checked = filtered.filter((item) => item.isChecked);

    // Group unchecked by category, using STORE_PLAN_CATEGORY_ORDER
    const groups: Record<string, GroceryItem[]> = {};
    for (const item of unchecked) {
      const cat = item.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }

    const sections: { title: string; data: GroceryItem[] }[] = [];

    for (const cat of STORE_PLAN_CATEGORY_ORDER) {
      if (groups[cat]) {
        sections.push({ title: cat, data: groups[cat] });
        delete groups[cat];
      }
    }

    // Remaining custom categories
    for (const cat of Object.keys(groups).sort()) {
      sections.push({ title: cat, data: groups[cat] });
    }

    // Add "Got It" section at the bottom if there are checked items
    if (checked.length > 0) {
      sections.push({
        title: '__got_it__',
        data: gotItExpanded ? checked : [],
      });
    }

    return sections;
  }, [items, listId, searchQuery, gotItExpanded, selectedStoreId]);

  // ─── Route-plan sections — grouped by store stop for selected route ──────────
  const routePlanSections = useMemo(() => {
    if (!selectedRouteNumStops) return null;

    // Get the proposal for this number of stops
    const proposals = computeStopProposals(filteredUncheckedItems, perStorePrices, STORE_NAME_MAP);
    const proposal = proposals.find(p => p.numStops === selectedRouteNumStops);
    if (!proposal) return null;

    // The stores in the proposal
    const routeStores = proposal.stores;
    const storeIds = routeStores.map(s => s.storeId);

    // Filter items
    const allItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );

    const filtered = searchQuery.trim()
      ? allItems.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : allItems;

    const unchecked = filtered.filter((item) => !item.isChecked);
    const checked = filtered.filter((item) => item.isChecked);

    // Map each item to the cheapest store amongst the stores in the route
    const storeGroups: Record<string, GroceryItem[]> = {};
    const storeSubtotals: Record<string, number> = {};

    for (const storeId of storeIds) {
      storeGroups[storeId] = [];
      storeSubtotals[storeId] = 0;
    }
    const fallbackGroup: GroceryItem[] = [];

    for (const item of unchecked) {
      let bestStoreId: string | null = null;
      let cheapestPrice = Infinity;

      for (const storeId of storeIds) {
        const pr = perStorePrices[storeId]?.[item.id];
        if (pr && pr.price < cheapestPrice) {
          cheapestPrice = pr.price;
          bestStoreId = storeId;
        }
      }

      if (bestStoreId) {
        storeGroups[bestStoreId].push(item);
        storeSubtotals[bestStoreId] += cheapestPrice * item.quantity;
      } else {
        fallbackGroup.push(item);
      }
    }

    const sections: { title: string; data: GroceryItem[]; subtotal?: number }[] = [];

    // Create sections in the order of the stops in the route
    routeStores.forEach((store, idx) => {
      const data = storeGroups[store.storeId];
      if (data && data.length > 0) {
        sections.push({
          title: `Stop ${idx + 1}: ${store.storeName}`,
          data,
          subtotal: storeSubtotals[store.storeId],
        });
      }
    });

    if (fallbackGroup.length > 0) {
      sections.push({
        title: 'Other Items (No Prices)',
        data: fallbackGroup,
      });
    }

    // Add "Got It" section at the bottom if there are checked items
    if (checked.length > 0) {
      sections.push({
        title: '__got_it__',
        data: gotItExpanded ? checked : [],
      });
    }

    return sections;
  }, [items, listId, searchQuery, gotItExpanded, selectedRouteNumStops, filteredUncheckedItems, perStorePrices]);

  // Item press → navigate to edit
  const handleItemPress = useCallback(
    (item: GroceryItem) => {
      navigation.navigate('ItemEdit', { listId, itemId: item.id });
    },
    [navigation, listId],
  );

  // Toggle check with animation + toast
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const handleToggle = useCallback(
    (id: string) => {
      const item = items[id];
      if (!item) return;

      // Guard against rapid spam-clicks
      if (togglingItems.has(id)) return;
      setTogglingItems((prev) => new Set(prev).add(id));

      // If checking off (not un-checking), show toast + animation
      if (!item.isChecked) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }

      toggleChecked(id)
        .catch((err: Error) => {
          Alert.alert('Error', err.message);
        })
        .finally(() => {
          setTogglingItems((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });

      // Show toast when checking off
      if (!item.isChecked) {
        setToastState({
          visible: true,
          message: `${item.name} ✓ checked off`,
          itemId: item.id,
        });
      }
    },
    [items, toggleChecked, togglingItems],
  );

  // Undo check — un-check the item
  const handleUndo = useCallback(() => {
    if (!toastState) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleChecked(toastState.itemId).catch((err: Error) => {
      Alert.alert('Error', err.message);
    });
    setToastState(null);
  }, [toastState, toggleChecked]);

  // Dismiss toast
  const handleDismissToast = useCallback(() => {
    setToastState(null);
  }, []);

  // Long-press delete
  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert('Delete Item', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteItem(id).catch((err: Error) => {
              Alert.alert('Error', err.message);
            });
          },
        },
      ]);
    },
    [deleteItem],
  );

  // Claim-an-item
  const handleClaim = useCallback(
    (id: string) => {
      claimItem(id);
    },
    [claimItem],
  );

  const handleUnclaim = useCallback(
    (id: string) => {
      unclaimItem(id);
    },
    [unclaimItem],
  );

  // Reorder handlers
  const handleMoveUp = useCallback(
    (id: string) => {
      reorderItem(id, 'up', listId).catch((err: Error) => {
        Alert.alert('Error', err.message);
      });
    },
    [reorderItem, listId],
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      reorderItem(id, 'down', listId).catch((err: Error) => {
        Alert.alert('Error', err.message);
      });
    },
    [reorderItem, listId],
  );

  // Settings nav
  const handleSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Loading items...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
          onPress={() => loadItems(listId)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalItems = Object.values(items).filter(
    (i) => !i.isDeleted && i.listId === listId,
  ).length;

  const checkedItemsCount = Object.values(items).filter(
    (i) => {
      if (i.isDeleted || i.listId !== listId || !i.isChecked) return false;
      // Apply search filter if active — match what the section list shows
      if (searchQuery.trim()) {
        return i.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    },
  ).length;

  const storeIdsWithPrices = getStoreIdsWithPrices();

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>{listName}</Text>
        <View style={styles.headerRight}>
          <SyncIndicator />
          <TouchableOpacity onPress={handleSettings} style={styles.settingsBtn}>
            <Text style={[styles.settingsIcon, { color: theme.text }]}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
        <TextInput
          style={[styles.searchInput, { color: theme.text, backgroundColor: theme.cardBg }]}
          placeholder="Search items..."
          placeholderTextColor={isDark ? '#475569' : '#999'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearSearch}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Item count */}
      <Text style={[styles.countText, { color: theme.secondaryText }]}>
        {searchQuery
          ? `${groupedSections.reduce((s, sec) => s + sec.data.length, 0)} results`
          : `${totalItems} items`}
      </Text>

      {/* Store total bar */}
      <StoreTotalBar
        storeTotals={storeTotals}
        selectedStoreId={selectedStoreId}
        onSelectStore={(storeId) => {
          setSelectedStoreId(storeId);
          setSelectedRouteNumStops(null);
        }}
      />

      {/* Stop optimizer */}
      <StopOptimizer
        items={filteredUncheckedItems}
        perStorePrices={perStorePrices}
        storeNameMap={STORE_NAME_MAP}
        storeIds={storeIdsWithPrices}
        selectedRouteNumStops={selectedRouteNumStops}
        onSelectRouteNumStops={(numStops) => {
          setSelectedRouteNumStops(numStops);
          setSelectedStoreId(null);
        }}
      />

      {/* Sectioned list */}
      {(() => {
        const activeSections = selectedStoreId && storePlanSections
          ? storePlanSections
          : selectedRouteNumStops && routePlanSections
          ? routePlanSections
          : groupedSections;
        const isStorePlan = selectedStoreId !== null || selectedRouteNumStops !== null;

        if (activeSections.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: theme.secondaryText }]}>
                {searchQuery ? 'No results' : 'List is empty'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
                {searchQuery
                  ? 'Try a different search term'
                  : 'Tap + to add your first item'}
              </Text>
            </View>
          );
        }
        return (
          <SectionList
            sections={activeSections}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index, section }) => {
              if (section.title === '__got_it__') {
                return (
                  <ItemRow
                    item={item}
                    onToggle={handleToggle}
                    onPress={handleItemPress}
                    onDelete={handleDelete}
                    isFirst={index === 0}
                    isLast={index === section.data.length - 1}
                    price={getItemPrice(item.id)}
                    priceLoading={itemLoading[item.id] ?? false}
                  />
                );
              }
              return (
                <ItemRow
                  item={item}
                  onToggle={handleToggle}
                  onPress={handleItemPress}
                  onDelete={handleDelete}
                  onMoveUp={isStorePlan ? undefined : handleMoveUp}
                  onMoveDown={isStorePlan ? undefined : handleMoveDown}
                  isFirst={index === 0}
                  isLast={index === section.data.length - 1}
                  price={getItemPrice(item.id)}
                  priceLoading={itemLoading[item.id] ?? false}
                />
              );
            }}
            renderSectionHeader={({ section }) => {
              if (section.title === '__got_it__') {
                return (
                  <GotItHeader
                    count={checkedItemsCount}
                    isExpanded={gotItExpanded}
                    onToggle={() => setGotItExpanded((prev) => !prev)}
                  />
                );
              }
              return (
                <CategoryHeader
                  category={section.title}
                  count={section.data.length}
                  subtotal={(section as any).subtotal}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        );
      })()}

      {/* Undo Toast */}
      {toastState?.visible && (
        <UndoToast
          message={toastState.message}
          onUndo={handleUndo}
          duration={5000}
          onDismiss={handleDismissToast}
        />
      )}

      {/* FAB Add button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => setShowAddSheet(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Item Sheet */}
      <AddItemSheet
        visible={showAddSheet}
        listId={listId}
        onClose={() => setShowAddSheet(false)}
        onItemAdded={() => {
          setShowAddSheet(false);
        }}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginLeft: 8,
  },
  backBtn: {
    paddingRight: 4,
  },
  backText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncText: {
    fontSize: 11,
    color: '#999',
  },
  settingsBtn: {
    padding: 4,
  },
  settingsIcon: {
    fontSize: 20,
  },
  searchContainer: {
    margin: 12,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  clearSearch: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#999',
  },
  countText: {
    fontSize: 12,
    color: '#999',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  listContent: {
    paddingBottom: 80,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
    borderLeftWidth: 3,
    marginLeft: 12,
    backgroundColor: '#fff',
    borderRadius: 4,
    marginRight: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryCount: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flex: 1,
  },
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
  gotItHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    marginHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  gotItHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gotItIcon: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  gotItTitle: {
    fontSize: 15,
    color: '#2E7D32',
    fontWeight: '700',
  },
  gotItHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gotItCount: {
    fontSize: 13,
    color: '#558B2F',
    fontWeight: '600',
  },
  gotItChevron: {
    fontSize: 12,
    color: '#558B2F',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 30,
  },

  // ─── Claim-an-item styles ──────────────────────────────────
  claimBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  claimBadgeExpired: {
    backgroundColor: '#FFF3E0',
  },
  claimText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '600',
  },
  claimButton: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  claimButtonText: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
  },

  // ─── Store Total Bar styles ────────────────────────────────
  storeTotalBarContainer: {
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  storeTotalBarScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  storeTotalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 4,
  },
  storeTotalPillSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  storeTotalPillCheapest: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  storeTotalPillText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  storeTotalPillTextSelected: {
    color: '#fff',
  },
  storeTotalBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  storeTotalBadgeSelected: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  storeTotalBadgeCheapest: {
    backgroundColor: '#4CAF50',
  },
  storeTotalBadgeText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '700',
  },
  storeTotalBadgeTextSelected: {
    color: '#fff',
  },
});
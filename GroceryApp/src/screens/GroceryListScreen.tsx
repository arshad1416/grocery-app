/**
 * GroceryListScreen — main list view.
 *
 * Displays items grouped by category, with check-off, reorder, search,
 * FAB add button, and sync indicator.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SectionList,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import type { GroceryItem, GroceryCategory } from '../types';
import type { PriceResult } from '../pricing/types';
import { BUILT_IN_CATEGORIES, STORE_PLAN_CATEGORY_ORDER } from '../types';
import { useGroceryStore } from '../state/useGroceryStore';
import { getListMeta } from '../sync/yjs-adapter';
import type { RootStackParamList } from '../navigation/deepLinks';
import AddItemSheet from './AddItemSheet';
import StopOptimizer from '../components/StopOptimizer';
import UndoToast from '../components/UndoToast';
import { usePriceStore } from '../pricing/price-store';
import { useThemeStore, useActiveTheme } from '../state/useThemeStore';
import { computeStopProposals } from '../pricing/stop-optimizer';

// Extracted components
import SyncIndicator from '../components/SyncIndicator';
import ItemRow from '../components/ItemRow';
import CategoryHeader from '../components/CategoryHeader';
import GotItHeader from '../components/GotItHeader';
import StoreTotalBar from '../components/StoreTotalBar';
import type { StoreTotal } from '../components/StoreTotalBar';
import { themeColors } from '../components/groceryTheme';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Props ──────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'GroceryList'>;

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
  const isFocused = useIsFocused();

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
  // Claim-an-item expiry timer — checks every 60s (not 30s), React.memo on ItemRow prevents full re-render
  const [, forceRender] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      forceRender((n) => n + 1);
    }, 60_000);
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
  }, [Object.keys(items).length, listId, loadPricesForAllStores, isFocused]);

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
});

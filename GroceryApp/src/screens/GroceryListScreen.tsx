/**
 * GroceryListScreen — Antigravity redesign.
 * Main list view with search bar, category pills, store card row,
 * items grouped by category with quantity steppers, and bottom tab bar.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SectionList,
  LayoutAnimation,
  Platform,
  UIManager,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
import { flippDealsAdapter } from '../pricing/flipp-deals-adapter';
import { crowdsourcedAdapter } from '../pricing/crowdsourced';
import { getSettings } from '../config/settings';

// Extracted components
import SyncIndicator from '../components/SyncIndicator';
import ItemRow from '../components/ItemRow';
import CategoryHeader from '../components/CategoryHeader';
import GotItHeader from '../components/GotItHeader';
import StoreTotalBar from '../components/StoreTotalBar';
import type { StoreTotal } from '../components/StoreTotalBar';
import { themeColors } from '../components/groceryTheme';

// New Antigravity components
import SearchBar from '../components/SearchBar';
import CategoryPill from '../components/CategoryPill';
import StoreCard from '../components/StoreCard';
import BottomTabBar, { type TabName } from '../components/BottomTabBar';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'GroceryList'>;
interface ListSection {
  title: string;
  data: GroceryItem[];
  subtotal?: number;
}

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
  const isRefreshingPrices = usePriceStore((s) => s.isRefreshing);
  const refreshAllPrices = usePriceStore((s) => s.refreshAllPrices);
  const priceTimestamps = usePriceStore((s) => s.priceTimestamps);
  const isPriceStale = usePriceStore((s) => s.isPriceStale);

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
  const [availableStores, setAvailableStores] = useState<{ storeId: string; storeName: string }[]>([]);
  const [priceSummaryItem, setPriceSummaryItem] = useState<{ id: string; name: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<TabName>('lists');

  // Build dynamic store name map from available stores
  const storeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of availableStores) map[s.storeId] = s.storeName;
    return map;
  }, [availableStores]);

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

  const stopProposals = useMemo(
    () => computeStopProposals(filteredUncheckedItems, perStorePrices, storeNameMap),
    [filteredUncheckedItems, perStorePrices, storeNameMap],
  );

  const getItemPrice = useCallback(
    (itemId: string) => {
      if (selectedStoreId && perStorePrices[selectedStoreId]?.[itemId]) {
        return perStorePrices[selectedStoreId][itemId] ?? null;
      }
      if (selectedRouteNumStops) {
        const proposal = stopProposals.find(p => p.numStops === selectedRouteNumStops);
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
    [selectedStoreId, selectedRouteNumStops, perStorePrices, prices, stopProposals],
  );

  const [, forceRender] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      forceRender((n) => n + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadItems(listId).catch((err: Error) => {
      Alert.alert('Error', err.message);
    });

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

  useEffect(() => {
    Promise.all([
      flippDealsAdapter.getAvailableStores().catch(() => [] as { storeId: string; storeName: string }[]),
      crowdsourcedAdapter.getAvailableStores().catch(() => [] as { storeId: string; storeName: string }[]),
    ]).then(([flippStores, crowdStores]) => {
      const all = [...flippStores, ...crowdStores];
      const seen = new Set<string>();
      const unique = all.filter(s => {
        if (seen.has(s.storeId)) return false;
        seen.add(s.storeId);
        return true;
      });
      setAvailableStores(unique);
    }).catch(err => console.warn('[stores] Failed to load stores:', err));
  }, []);

  useEffect(() => {
    const storeIds = availableStores.map(s => s.storeId);
    if (storeIds.length === 0 || !items || Object.keys(items).length === 0) return;
    const visibleItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );
    const FRESHNESS_THRESHOLD = 60 * 60 * 1000;
    const staleItems = visibleItems.filter((item) => {
      const ts = priceTimestamps[item.id];
      return !ts || Date.now() - ts > FRESHNESS_THRESHOLD;
    });
    if (staleItems.length > 0) {
      loadPricesForAllStores(
        staleItems.map((item) => ({ id: item.id, name: item.name })),
        storeIds,
      ).catch(err => console.warn('[prices] loadPricesForAllStores failed:', err));
    }
  }, [Object.keys(items).length, listId, loadPricesForAllStores, isFocused, availableStores]);

  // Available categories from items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    Object.values(items)
      .filter((i) => !i.isDeleted && i.listId === listId && !i.isChecked)
      .forEach((i) => cats.add(i.category || 'other'));
    const builtIn = [...BUILT_IN_CATEGORIES] as string[];
    return ['All', ...builtIn.filter(c => cats.has(c)), ...Array.from(cats).filter(c => !builtIn.includes(c)).sort()];
  }, [items, listId]);

  // Grouped sections
  const groupedSections = useMemo(() => {
    const allItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );

    const filtered = searchQuery.trim()
      ? allItems.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : allItems;

    // Filter by active category
    const categoryFiltered = activeCategory === 'All'
      ? filtered
      : filtered.filter((item) => (item.category || 'other') === activeCategory);

    categoryFiltered.sort((a, b) => a.sortOrder - b.sortOrder);

    const unchecked = categoryFiltered.filter((item) => !item.isChecked);
    const checked = categoryFiltered.filter((item) => item.isChecked);

    const groups: Record<string, GroceryItem[]> = {};
    for (const item of unchecked) {
      const cat = item.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }

    const sections: ListSection[] = [];
    const builtInSet = new Set(BUILT_IN_CATEGORIES);

    for (const cat of BUILT_IN_CATEGORIES) {
      if (groups[cat]) {
        sections.push({ title: cat, data: groups[cat] });
        delete groups[cat];
      }
    }

    for (const cat of Object.keys(groups).sort()) {
      sections.push({ title: cat, data: groups[cat] });
    }

    if (checked.length > 0) {
      sections.push({
        title: '__got_it__',
        data: gotItExpanded ? checked : [],
      });
    }

    return sections;
  }, [items, listId, searchQuery, gotItExpanded, activeCategory]);

  // Store totals
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
          storeName: storeNameMap[storeId] ?? storeId,
          total,
        });
      }
    }

    totals.sort((a, b) => a.total - b.total);
    return totals;
  }, [items, listId, perStorePrices, getStoreIdsWithPrices]);

  // Store-plan sections
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

    const groups: Record<string, GroceryItem[]> = {};
    for (const item of unchecked) {
      const cat = item.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }

    const sections: ListSection[] = [];

    for (const cat of STORE_PLAN_CATEGORY_ORDER) {
      if (groups[cat]) {
        sections.push({ title: cat, data: groups[cat] });
        delete groups[cat];
      }
    }

    for (const cat of Object.keys(groups).sort()) {
      sections.push({ title: cat, data: groups[cat] });
    }

    if (checked.length > 0) {
      sections.push({
        title: '__got_it__',
        data: gotItExpanded ? checked : [],
      });
    }

    return sections;
  }, [items, listId, searchQuery, gotItExpanded, selectedStoreId]);

  // Route-plan sections
  const routePlanSections = useMemo(() => {
    if (!selectedRouteNumStops) return null;
    const proposal = stopProposals.find(p => p.numStops === selectedRouteNumStops);
    if (!proposal) return null;

    const routeStores = proposal.stores;
    const storeIds = routeStores.map(s => s.storeId);

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

    const sections: ListSection[] = [];

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

    if (checked.length > 0) {
      sections.push({
        title: '__got_it__',
        data: gotItExpanded ? checked : [],
      });
    }

    return sections;
  }, [items, listId, searchQuery, gotItExpanded, selectedRouteNumStops, stopProposals, perStorePrices]);

  const handleItemPress = useCallback(
    (item: GroceryItem) => {
      if (priceSummaryItem?.id === item.id) {
        setPriceSummaryItem(null);
        navigation.navigate('ItemEdit', { listId, itemId: item.id });
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setPriceSummaryItem({ id: item.id, name: item.name });
      }
    },
    [navigation, listId, priceSummaryItem],
  );

  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const handleToggle = useCallback(
    (id: string) => {
      const item = items[id];
      if (!item) return;

      if (togglingItems.has(id)) return;
      setTogglingItems((prev) => new Set(prev).add(id));

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

  const handleUndo = useCallback(() => {
    if (!toastState) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleChecked(toastState.itemId).catch((err: Error) => {
      Alert.alert('Error', err.message);
    });
    setToastState(null);
  }, [toastState, toggleChecked]);

  const handleDismissToast = useCallback(() => {
    setToastState(null);
  }, []);

  const handleItemLongPress = useCallback(
    (id: string, name: string) => {
      Alert.alert(name, 'What would you like to do?', [
        {
          text: 'Edit',
          onPress: () => {
            navigation.navigate('ItemEdit', { listId, itemId: id });
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
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
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [deleteItem, navigation, listId],
  );

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

  const handleSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const handleRefreshPrices = useCallback(() => {
    const storeIds = availableStores.map(s => s.storeId);
    if (storeIds.length === 0) return;
    const visibleItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );
    if (visibleItems.length > 0) {
      refreshAllPrices(
        visibleItems.map((item) => ({ id: item.id, name: item.name })),
        storeIds,
      ).catch(() => {});
    }
  }, [items, listId, availableStores, refreshAllPrices]);

  const handleQuantityChange = useCallback(
    (id: string, delta: number) => {
      const item = items[id];
      if (!item) return;
      const newQty = Math.max(1, item.quantity + delta);
      // Update quantity via the store
      const { updateItem } = useGroceryStore.getState();
      if (updateItem) {
        updateItem(id, { quantity: newQty }).catch((err: Error) => {
          Alert.alert('Error', err.message);
        });
      }
    },
    [items],
  );

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
    if (tab === 'home') {
      navigation.goBack();
    } else if (tab === 'account') {
      navigation.navigate('Settings');
    }
  }, [navigation]);

  const hasPrices = Object.keys(priceTimestamps).length > 0;
  const hasStalePrices = Object.values(items)
    .filter((item) => !item.isDeleted && item.listId === listId)
    .some((item) => isPriceStale(item.id));

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
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
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
      if (searchQuery.trim()) {
        return i.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    },
  ).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>{listName}</Text>
        <View style={styles.headerRight}>
          <SyncIndicator />
          <TouchableOpacity onPress={handleSettings} style={styles.settingsBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search groceries..." />

      {/* Category pills */}
      <View style={styles.categoryPillContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryPillScroll}
        >
          {availableCategories.map((cat) => (
            <CategoryPill
              key={cat}
              label={cat === 'All' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              isActive={activeCategory === cat}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setActiveCategory(cat);
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Store card row — horizontal scroll */}
      {storeTotals.length > 0 && (
        <View style={styles.storeCardRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storeCardScroll}
          >
            {storeTotals.map((st) => (
              <StoreCard
                key={st.storeId}
                storeName={st.storeName}
                storeId={st.storeId}
                total={st.total}
                itemCount={Object.values(items).filter(i => !i.isDeleted && i.listId === listId && !i.isChecked).length}
                isSelected={selectedStoreId === st.storeId}
                onPress={() => {
                  if (selectedStoreId === st.storeId) {
                    setSelectedStoreId(null);
                  } else {
                    setSelectedStoreId(st.storeId);
                    setSelectedRouteNumStops(null);
                  }
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Stop optimizer */}
      <StopOptimizer
        items={filteredUncheckedItems}
        perStorePrices={perStorePrices}
        storeNameMap={storeNameMap}
        selectedRouteNumStops={selectedRouteNumStops}
        onSelectRouteNumStops={(numStops) => {
          setSelectedRouteNumStops(numStops);
          setSelectedStoreId(null);
        }}
        fullItems={filteredUncheckedItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }))}
      />

      {/* Find Prices button */}
      {!priceLoading && (
        <TouchableOpacity
          style={[styles.findPricesBtn, { backgroundColor: isDark ? 'rgba(0, 230, 118, 0.08)' : 'rgba(124, 179, 66, 0.1)' }]}
          onPress={handleRefreshPrices}
          activeOpacity={0.7}
        >
          <Ionicons name={hasPrices ? 'refresh' : 'search'} size={14} color={theme.primary} />
          <Text style={[styles.findPricesText, { color: theme.primary }]}>
            {hasPrices ? 'Refresh Prices' : 'Find Prices'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Price summary banner */}
      {priceSummaryItem && (() => {
        const priceEntries = availableStores
          .map((store) => {
            const pr = perStorePrices[store.storeId]?.[priceSummaryItem.id];
            return pr ? `${store.storeName} $${pr.price.toFixed(2)}` : null;
          })
          .filter(Boolean);
        return (
          <View style={[styles.priceSummaryBanner, {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
            borderColor: isDark ? 'rgba(0, 230, 118, 0.15)' : 'rgba(0, 0, 0, 0.06)',
          }]}>
            <Text style={[styles.priceSummaryName, { color: theme.text }]}>
              {priceSummaryItem.name}
            </Text>
            {priceEntries.length > 0 ? (
              <Text style={[styles.priceSummaryText, { color: theme.secondaryText }]} numberOfLines={2}>
                {priceEntries.join('  ·  ')}
              </Text>
            ) : (
              <Text style={[styles.priceSummaryText, { color: theme.secondaryText }]}>
                No prices found
              </Text>
            )}
            <TouchableOpacity
              style={styles.priceSummaryDismiss}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setPriceSummaryItem(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color={theme.secondaryText} />
            </TouchableOpacity>
          </View>
        );
      })()}

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
              <Ionicons name="cart-outline" size={48} color={theme.secondaryText} />
              <Text style={[styles.emptyTitle, { color: theme.text, marginTop: 12 }]}>
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
            refreshControl={
              <RefreshControl
                refreshing={isRefreshingPrices}
                onRefresh={handleRefreshPrices}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            renderItem={({ item, index, section }) => {
              if (section.title === '__got_it__') {
                return (
                  <ItemRow
                    item={item}
                    onToggle={handleToggle}
                    onPress={handleItemPress}
                    onLongPress={handleItemLongPress}
                    isFirst={index === 0}
                    isLast={index === section.data.length - 1}
                    price={getItemPrice(item.id)}
                    priceLoading={itemLoading[item.id] ?? false}
                    onQuantityChange={handleQuantityChange}
                  />
                );
              }
              return (
                <ItemRow
                  item={item}
                  onToggle={handleToggle}
                  onPress={handleItemPress}
                  onLongPress={handleItemLongPress}
                  onMoveUp={isStorePlan ? undefined : handleMoveUp}
                  onMoveDown={isStorePlan ? undefined : handleMoveDown}
                  isFirst={index === 0}
                  isLast={index === section.data.length - 1}
                  price={getItemPrice(item.id)}
                  priceLoading={itemLoading[item.id] ?? false}
                  onQuantityChange={handleQuantityChange}
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
                  subtotal={section.subtotal}
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
        style={[styles.fab, {
          backgroundColor: theme.primary,
          shadowColor: isDark ? '#00E676' : '#7CB342',
        }]}
        onPress={() => setShowAddSheet(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={isDark ? '#0B0F12' : '#FFFFFF'} />
      </TouchableOpacity>

      {/* Bottom Tab Bar */}
      <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
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
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 8,
  },
  backBtn: {
    paddingRight: 4,
    padding: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBtn: {
    padding: 6,
  },
  categoryPillContainer: {
    paddingVertical: 4,
  },
  categoryPillScroll: {
    paddingHorizontal: 16,
    gap: 0,
  },
  storeCardRow: {
    paddingVertical: 8,
  },
  storeCardScroll: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 140,
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
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  findPricesBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  findPricesText: {
    fontSize: 13,
    fontWeight: '600',
  },
  priceSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  priceSummaryName: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
  },
  priceSummaryText: {
    fontSize: 13,
    flex: 1,
  },
  priceSummaryDismiss: {
    marginLeft: 8,
    padding: 4,
  },
});

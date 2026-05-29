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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroceryItem, SyncState, GroceryCategory } from '../types';
import type { PriceResult } from '../pricing/types';
import { BUILT_IN_CATEGORIES } from '../types';
import { useGroceryStore } from '../state/useGroceryStore';
import { useSyncStore } from '../state/useSyncStore';
import { useListStore } from '../state/useListStore';
import { getListMeta } from '../sync/yjs-adapter';
import type { RootStackParamList } from '../navigation/deepLinks';
import AddItemSheet from './AddItemSheet';
import PriceBadge from '../components/PriceBadge';
import UndoToast from '../components/UndoToast';
import { usePriceStore } from '../pricing/price-store';
import { CLAIM_EXPIRY_MS } from '../sync/yjs-adapter';

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

  const color =
    syncState === 'syncing'
      ? '#FF9800'
      : syncState === 'error'
        ? '#f44336'
        : syncState === 'offline'
          ? '#999'
          : '#4CAF50';

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
      <Text style={styles.syncText}>
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

function ItemRow({ item, onToggle, onPress, onDelete, onMoveUp, onMoveDown, isFirst, isLast, price, priceLoading, onClaim, onUnclaim, claimerName, claimExpired }: ItemRowProps) {
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
            <Text style={[styles.reorderBtnText, isFirst && styles.reorderBtnTextDisabled]}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
            onPress={() => onMoveDown(item.id)}
            disabled={isLast}
          >
            <Text style={[styles.reorderBtnText, isLast && styles.reorderBtnTextDisabled]}>▼</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.reorderButtons, styles.reorderButtonsHidden]} />
      )}
      {/* Main item row */}
      <TouchableOpacity
        style={[styles.itemRow, item.isChecked && styles.itemRowChecked]}
        onPress={() => onPress(item)}
        onLongPress={() => onDelete(item.id, item.name)}
        activeOpacity={0.7}
      >
        {/* Animated Checkbox */}
        <TouchableOpacity
          style={[
            styles.checkbox,
            item.isChecked && styles.checkboxChecked,
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
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.isChecked && (
              <Animated.View
                style={[
                  styles.strikethrough,
                  { width: strikeWidth },
                ]}
                pointerEvents="none"
              />
            )}
          </View>
          {item.notes ? (
            <Text style={styles.itemNotes} numberOfLines={1}>
              {item.notes}
            </Text>
          ) : null}
        </View>

        {/* Price badge */}
        <PriceBadge price={price ?? null} isLoading={priceLoading} />

        {/* Quantity + Unit */}
        <View style={styles.quantityBadge}>
          <Text style={styles.quantityText}>
            {item.quantity} {item.unit}
          </Text>
        </View>

        {/* Claim-an-item lock */}
        {item.claimedBy ? (
          <TouchableOpacity
            style={[
              styles.claimBadge,
              claimExpired && styles.claimBadgeExpired,
            ]}
            onPress={() => onUnclaim?.(item.id)}
          >
            <Text style={styles.claimText}>
              {claimExpired ? '⚠ Claim expired' : `🛒 ${claimerName ?? item.claimedBy}`}
            </Text>
          </TouchableOpacity>
        ) : onClaim ? (
          <TouchableOpacity
            style={styles.claimButton}
            onPress={() => onClaim(item.id)}
          >
            <Text style={styles.claimButtonText}>Claim</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

// ─── Category Header ─────────────────────────────────────────────────────────

interface CategoryHeaderProps {
  category: string;
  count: number;
}

function CategoryHeader({ category, count }: CategoryHeaderProps) {
  const color = getCategoryColor(category);
  return (
    <View style={[styles.categoryHeader, { borderLeftColor: color }]}>
      <Text style={[styles.categoryTitle, { color }]}>
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </Text>
      <Text style={styles.categoryCount}>{count}</Text>
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
  return (
    <TouchableOpacity
      style={styles.gotItHeader}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.gotItHeaderLeft}>
        <Text style={styles.gotItIcon}>✓</Text>
        <Text style={styles.gotItTitle}>Got It</Text>
      </View>
      <View style={styles.gotItHeaderRight}>
        <Text style={styles.gotItCount}>
          {count} {count === 1 ? 'item' : 'items'}
        </Text>
        <Text style={styles.gotItChevron}>{isExpanded ? '▼' : '▶'}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function GroceryListScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const insets = useSafeAreaInsets();

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
  const loadPrices = usePriceStore((s) => s.loadPrices);

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

  // Load prices for visible items after items are loaded
  const listPref = useListStore((s) => s.lists[listId]?.storePreference);
  const storeId = listPref ?? 'default';
  useEffect(() => {
    const visibleItems = Object.values(items).filter(
      (item) => !item.isDeleted && item.listId === listId,
    );
    if (visibleItems.length > 0) {
      loadPrices(
        visibleItems.map((item) => ({ id: item.id, name: item.name })),
        storeId,
      ).catch(() => {});
    }
  }, [Object.keys(items).length, listId, storeId, loadPrices]);

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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading items...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{listName}</Text>
        <View style={styles.headerRight}>
          <SyncIndicator />
          <TouchableOpacity onPress={handleSettings} style={styles.settingsBtn}>
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor="#999"
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
      <Text style={styles.countText}>
        {searchQuery
          ? `${groupedSections.reduce((s, sec) => s + sec.data.length, 0)} results`
          : `${totalItems} items`}
      </Text>

      {/* Sectioned list */}
      {groupedSections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No results' : 'List is empty'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? 'Try a different search term'
              : 'Tap + to add your first item'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={groupedSections}
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
                  price={prices[item.id] ?? null}
                  priceLoading={itemLoading[item.id] ?? false}
                  onClaim={handleClaim}
                  onUnclaim={handleUnclaim}
                  claimExpired={
                    item.claimedAt
                      ? Date.now() - item.claimedAt >= CLAIM_EXPIRY_MS
                      : false
                  }
                />
              );
            }
            return (
              <ItemRow
                item={item}
                onToggle={handleToggle}
                onPress={handleItemPress}
                onDelete={handleDelete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                isFirst={index === 0}
                isLast={index === section.data.length - 1}
                price={prices[item.id] ?? null}
                priceLoading={itemLoading[item.id] ?? false}
                onClaim={handleClaim}
                onUnclaim={handleUnclaim}
                claimExpired={
                  item.claimedAt
                    ? Date.now() - item.claimedAt >= CLAIM_EXPIRY_MS
                    : false
                }
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
              />
            );
          }}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

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
        style={styles.fab}
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
});
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
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SectionList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroceryItem, SyncState, GroceryCategory } from '../types';
import { BUILT_IN_CATEGORIES } from '../types';
import { useGroceryStore } from '../state/useGroceryStore';
import { useSyncStore } from '../state/useSyncStore';
import { getListMeta } from '../sync/yjs-adapter';
import type { RootStackParamList } from '../navigation/deepLinks';
import AddItemSheet from './AddItemSheet';

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
}

function ItemRow({ item, onToggle, onPress }: ItemRowProps) {
  return (
    <TouchableOpacity
      style={[styles.itemRow, item.isChecked && styles.itemRowChecked]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {/* Checkbox */}
      <TouchableOpacity
        style={[
          styles.checkbox,
          item.isChecked && styles.checkboxChecked,
        ]}
        onPress={() => onToggle(item.id)}
      >
        {item.isChecked && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      {/* Item info */}
      <View style={styles.itemInfo}>
        <Text
          style={[
            styles.itemName,
            item.isChecked && styles.itemNameChecked,
          ]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {item.notes ? (
          <Text style={styles.itemNotes} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
      </View>

      {/* Quantity + Unit */}
      <View style={styles.quantityBadge}>
        <Text style={styles.quantityText}>
          {item.quantity} {item.unit}
        </Text>
      </View>
    </TouchableOpacity>
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

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [listName, setListName] = useState('Grocery List');

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

  // Filtered and grouped items
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

    // Group by category
    const groups: Record<string, GroceryItem[]> = {};
    for (const item of filtered) {
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

    return sections;
  }, [items, listId, searchQuery]);

  // Item press → navigate to edit
  const handleItemPress = useCallback(
    (item: GroceryItem) => {
      navigation.navigate('ItemEdit', { listId, itemId: item.id });
    },
    [navigation, listId],
  );

  // Toggle check
  const handleToggle = useCallback(
    (id: string) => {
      toggleChecked(id).catch((err: Error) => {
        Alert.alert('Error', err.message);
      });
    },
    [toggleChecked],
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
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              onToggle={handleToggle}
              onPress={handleItemPress}
            />
          )}
          renderSectionHeader={({ section }) => (
            <CategoryHeader
              category={section.title}
              count={section.data.length}
            />
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
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
    paddingHorizontal: 16,
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  itemName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#999',
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
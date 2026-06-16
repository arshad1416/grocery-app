/**
 * Home Screen — Antigravity redesign.
 * Entry point with bottom tab navigation, search bar, store-style list cards,
 * glassmorphism design, and all existing features (swipe-to-delete, context menu, etc.).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useListStore } from '../state/useListStore';
import { useFamilyStore } from '../state/useFamilyStore';
import { useSyncStore } from '../state/useSyncStore';
import type { GroceryList } from '../types';
import type { RootStackParamList } from '../navigation/deepLinks';
import { useShareInvite } from '../hooks/useShareInvite';
import { useThemeStore, useActiveTheme } from '../state/useThemeStore';
import SwipeableListCard from '../components/SwipeableListCard';
import ContextMenu from '../components/ContextMenu';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import UndoToast from '../components/UndoToast';
import GlassCard from '../components/GlassCard';
import SearchBar from '../components/SearchBar';
import BottomTabBar, { type TabName } from '../components/BottomTabBar';
import { themeColors } from '../components/groceryTheme';
import { Ionicons } from '@expo/vector-icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const themeMode = useThemeStore((s) => s.themeMode);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const theme = isDark ? themeColors.dark : themeColors.light;

  const lists = useListStore((s) => s.lists);
  const isLoading = useListStore((s) => s.isLoading);
  const loadLists = useListStore((s) => s.loadLists);
  const createList = useListStore((s) => s.createList);
  const deleteList = useListStore((s) => s.deleteList);
  const restoreList = useListStore((s) => s.restoreList);

  const activeMemberId = useFamilyStore((s) => s.activeMemberId);
  const members = useFamilyStore((s) => s.members);

  const syncState = useSyncStore((s) => s.syncState);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabName>('home');

  // Delete flow state
  const [pendingDelete, setPendingDelete] = useState<GroceryList | null>(null);
  const [undoList, setUndoList] = useState<GroceryList | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    list: GroceryList | null;
    position?: { x: number; y: number };
  }>({ visible: false, list: null });

  const { shareInvite } = useShareInvite();

  const abortedRef = useRef(false);

  const doLoadLists = useCallback(() => {
    abortedRef.current = false;
    setLoadError(null);

    const TIMEOUT_MS = 10_000;
    const timeout = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('Loading timed out')), TIMEOUT_MS),
    );

    Promise.race([loadLists(), timeout])
      .then(() => {
        if (!abortedRef.current) {
          setLoaded(true);
          setLoadError(null);
        }
      })
      .catch((err: Error) => {
        if (!abortedRef.current) {
          setLoaded(true);
          setLoadError(err.message ?? 'Failed to load lists');
        }
      });
  }, [loadLists]);

  useEffect(() => {
    doLoadLists();
    return () => {
      abortedRef.current = true;
    };
  }, [doLoadLists]);

  const handleListPress = useCallback(
    (list: GroceryList) => {
      navigation.navigate('GroceryList', { listId: list.id });
    },
    [navigation],
  );

  const handleCreateList = useCallback(async () => {
    const firstMember = Object.values(members).find((m) => m.isActive);
    const familyId = firstMember?.familyId ?? 'default-family';

    try {
      const newList = await createList('My Grocery List', familyId);
      navigation.navigate('GroceryList', { listId: newList.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create list';
      Alert.alert('Error', message);
    }
  }, [createList, members, navigation]);

  // Delete handlers
  const handleDeleteInitiated = useCallback((list: GroceryList) => {
    setPendingDelete(list);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!pendingDelete) return;
    const deletedList = { ...pendingDelete };
    setUndoList(deletedList);
    await deleteList(pendingDelete.id);
    setPendingDelete(null);
  }, [pendingDelete, deleteList]);

  const handleDeleteCancel = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoList) return;
    await restoreList(undoList);
    setUndoList(null);
  }, [undoList, restoreList]);

  const handleUndoDismiss = useCallback(() => {
    setUndoList(null);
  }, []);

  // Context menu handlers
  const handleLongPress = useCallback(
    (list: GroceryList, event: GestureResponderEvent) => {
      const { pageX, pageY } = event.nativeEvent;
      setContextMenu({
        visible: true,
        list,
        position: { x: pageX - 100, y: pageY - 60 },
      });
    },
    [],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ visible: false, list: null });
  }, []);

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu.list) {
      handleDeleteInitiated(contextMenu.list);
    }
  }, [contextMenu.list, handleDeleteInitiated]);

  const handleContextMenuShare = useCallback(() => {
    if (contextMenu.list) {
      shareInvite(
        `grocceryapp://invite?token=${encodeURIComponent(
          JSON.stringify({
            listId: contextMenu.list.id,
            listName: contextMenu.list.name,
            familyId: contextMenu.list.familyId,
          }),
        )}`,
      );
    }
  }, [contextMenu.list, shareInvite]);

  const handleShare = useCallback(
    (list: GroceryList) => {
      shareInvite(
        `grocceryapp://invite?token=${encodeURIComponent(
          JSON.stringify({
            listId: list.id,
            listName: list.name,
            familyId: list.familyId,
          }),
        )}`,
      );
    },
    [shareInvite],
  );

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
    if (tab === 'lists') {
      // Already on home/lists view
    } else if (tab === 'account') {
      navigation.navigate('Settings');
    }
    // Other tabs: scan, deals — placeholder for future
  }, [navigation]);

  const activeLists = Object.values(lists).filter(
    (l) => !l.isDeleted,
  );

  // Filter lists by search
  const filteredLists = searchQuery.trim()
    ? activeLists.filter((l) =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : activeLists;

  const syncDotColor =
    syncState === 'syncing'
      ? theme.accent
      : syncState === 'error'
        ? '#EF4444'
        : syncState === 'offline'
          ? '#999'
          : theme.primary;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: theme.text }]}>StopHop</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Pairing')}
            style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F0E8' }]}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={18} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F0E8' }]}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync indicator */}
      <View style={styles.syncBar}>
        <View style={[styles.syncDot, { backgroundColor: syncDotColor }]} />
        <Text style={[styles.syncText, { color: theme.secondaryText }]}>
          {syncState === 'syncing'
            ? 'Syncing...'
            : syncState === 'error'
              ? 'Sync error'
              : syncState === 'offline'
                ? 'Offline'
                : 'Connected'}
        </Text>
      </View>

      {/* Search bar */}
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search lists..." />

      {/* Body */}
      {!loaded || isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Loading lists...</Text>
        </View>
      ) : loadError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={[styles.emptyTitle, { color: '#EF4444', marginTop: 12 }]}>Something went wrong</Text>
          <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
            {loadError}
          </Text>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.primary }]} onPress={doLoadLists}>
            <Text style={styles.createBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredLists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={48} color={theme.secondaryText} />
          <Text style={[styles.emptyTitle, { color: theme.text, marginTop: 12 }]}>
            {searchQuery ? 'No matching lists' : 'No grocery lists yet'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
            {searchQuery ? 'Try a different search' : 'Create your first list to get started'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.primary }]} onPress={handleCreateList}>
              <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.createBtnText}>Create List</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredLists.map((list) => (
            <SwipeableListCard
              key={list.id}
              list={list}
              onPress={() => handleListPress(list)}
              onDelete={() => handleDeleteInitiated(list)}
              onShare={() => handleShare(list)}
              onLongPress={(event) => handleLongPress(list, event)}
              theme={theme}
            />
          ))}

          {/* Create list button at bottom */}
          <TouchableOpacity
            style={[styles.createListCard, {
              borderColor: isDark ? 'rgba(0, 230, 118, 0.15)' : 'rgba(124, 179, 66, 0.3)',
              backgroundColor: isDark ? 'rgba(0, 230, 118, 0.05)' : 'rgba(124, 179, 66, 0.06)',
            }]}
            onPress={handleCreateList}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
            <Text style={[styles.createListText, { color: theme.primary }]}>New List</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Bottom Tab Bar */}
      <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />

      {/* Context Menu (long-press) */}
      <ContextMenu
        visible={contextMenu.visible}
        listName={contextMenu.list?.name ?? ''}
        onDelete={handleContextMenuDelete}
        onShare={handleContextMenuShare}
        onClose={handleContextMenuClose}
        theme={theme}
        position={contextMenu.position}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        visible={!!pendingDelete}
        listName={pendingDelete?.name ?? ''}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        theme={theme}
      />

      {/* Undo Toast */}
      {undoList && (
        <UndoToast
          message={`"${undoList.name}" deleted`}
          onUndo={handleUndo}
          onDismiss={handleUndoDismiss}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Outfit-Bold' : 'sans-serif-medium',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 6,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    fontSize: 11,
    fontWeight: '500',
  },
  loadingRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
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
    marginBottom: 20,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 16,
  },
  createListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  createListText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

/**
 * Home Screen — entry point with navigation to lists, pairing, and settings.
 *
 * Shows existing grocery lists (or empty state) and provides quick access to
 * the main screens.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
    btnBg: '#F1F5F9',
    btnText: '#475569',
  },
  dark: {
    bg: '#0B0F19',
    cardBg: '#1E293B',
    text: '#F8FAFC',
    secondaryText: '#94A3B8',
    border: '#334155',
    primary: '#10B981',
    headerBg: '#1E293B',
    btnBg: '#334155',
    btnText: '#F8FAFC',
  },
};

// ─── Props ──────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// ─── Main Screen ─────────────────────────────────────────────────────────────

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

  const activeMemberId = useFamilyStore((s) => s.activeMemberId);
  const members = useFamilyStore((s) => s.members);

  const syncState = useSyncStore((s) => s.syncState);

  const [loaded, setLoaded] = useState(false);

  const { shareInvite } = useShareInvite();

  useEffect(() => {
    loadLists()
      .catch((err: Error) => {
        Alert.alert('Error', err.message);
      })
      .finally(() => setLoaded(true));
  }, [loadLists]);

  const handleListPress = useCallback(
    (list: GroceryList) => {
      navigation.navigate('GroceryList', { listId: list.id });
    },
    [navigation],
  );

  const handleCreateList = useCallback(async () => {
    // Use the first active member's familyId, or use a placeholder
    const firstMember = Object.values(members).find((m) => m.isActive);
    const familyId = firstMember?.familyId ?? 'default-family';

    try {
      const newList = await createList('My Grocery List', familyId);
      setLoaded(false);
      await loadLists();
      navigation.navigate('GroceryList', { listId: newList.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create list';
      Alert.alert('Error', message);
    }
  }, [createList, members, loadLists, navigation]);

  const activeLists = Object.values(lists).filter(
    (l) => !l.isDeleted,
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>StopHop</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Pairing')}
            style={[styles.headerBtn, { backgroundColor: theme.btnBg }]}
          >
            <Text style={[styles.headerBtnText, { color: theme.btnText }]}>Pair</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.headerBtn, { backgroundColor: theme.btnBg }]}
          >
            <Text style={[styles.headerBtnText, { color: theme.btnText }]}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync indicator */}
      <View style={[styles.syncBar, { backgroundColor: isDark ? '#1E293B' : '#FAFAFA' }]}>
        <View
          style={[
            styles.syncDot,
            {
              backgroundColor:
                syncState === 'syncing'
                  ? '#FF9800'
                  : syncState === 'error'
                    ? '#f44336'
                    : syncState === 'offline'
                      ? '#999'
                      : '#10B981',
            },
          ]}
        />
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

      {/* Body */}
      {!loaded || isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Loading lists...</Text>
        </View>
      ) : activeLists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: theme.secondaryText }]}>No grocery lists yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
            Create your first list to get started
          </Text>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.primary }]} onPress={handleCreateList}>
            <Text style={styles.createBtnText}>Create List</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
        >
          {activeLists.map((list) => (
            <TouchableOpacity
              key={list.id}
              style={[styles.listCard, { backgroundColor: theme.cardBg }]}
              onPress={() => handleListPress(list)}
            >
              <View style={styles.listCardInfo}>
                <Text style={[styles.listCardName, { color: theme.text }]}>{list.name}</Text>
                {list.description ? (
                  <Text style={[styles.listCardDesc, { color: theme.secondaryText }]} numberOfLines={1}>
                    {list.description}
                  </Text>
                ) : null}
                {list.storePreference ? (
                  <Text style={[styles.listCardStore, { color: theme.secondaryText }]}>
                    🏪 {list.storePreference}
                  </Text>
                ) : null}
              </View>
              <View style={styles.listCardActions}>
                <TouchableOpacity
                  style={[styles.shareListBtn, { backgroundColor: theme.primary }]}
                  onPress={() =>
                    shareInvite(
                      `grocceryapp://invite?token=${encodeURIComponent(
                        JSON.stringify({
                          listId: list.id,
                          listName: list.name,
                          familyId: list.familyId,
                        }),
                      )}`,
                    )
                  }
                >
                  <Text style={styles.shareListBtnText}>Share</Text>
                </TouchableOpacity>
                <Text style={styles.listCardArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* FAB for new list */}
      {activeLists.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={handleCreateList}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#fafafa',
    gap: 6,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    fontSize: 11,
    color: '#999',
  },
  loadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    marginBottom: 20,
  },
  createBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
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
    padding: 12,
    gap: 8,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  listCardInfo: {
    flex: 1,
  },
  listCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  listCardDesc: {
    fontSize: 13,
    color: '#999',
  },
  listCardStore: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  listCardArrow: {
    fontSize: 22,
    color: '#ccc',
    marginLeft: 8,
  },
  listCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareListBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  shareListBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
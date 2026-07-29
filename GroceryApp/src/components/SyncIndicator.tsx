/**
 * SyncIndicator — Shows sync state (syncing/error/offline/synced) in the header.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SyncState } from '../types';
import { useSyncStore } from '../state/useSyncStore';
import { useActiveTheme } from '../state/useThemeStore';
import { themeColors } from './groceryTheme';

export default function SyncIndicator() {
  const syncState: SyncState = useSyncStore((s) => s.syncState);
  const lastSyncedAt: number | null = useSyncStore((s) => s.lastSyncedAt);
  const errorMessage: string | null = useSyncStore((s) => s.error);
  const activeTheme = useActiveTheme();
  const theme = activeTheme === 'dark' ? themeColors.dark : themeColors.light;

  const color =
    syncState === 'syncing'
      ? '#FF9800'
      : syncState === 'error'
        ? '#f44336'
        : syncState === 'offline'
          ? '#999'
          : syncState === 'not_configured'
            ? '#999'
            : '#10B981';

  // In the error state, prefer the store's specific message: "Sync error" is
  // wrong for a failed local write (the change may have synced fine — it's
  // the on-device save that failed), and a wrong label sends the user
  // debugging their network instead of their storage.
  const label =
    syncState === 'syncing'
      ? 'Syncing...'
      : syncState === 'error'
        ? errorMessage ?? 'Sync error'
        : syncState === 'offline'
          ? 'Offline'
          : syncState === 'not_configured'
            ? 'Local only'
            : 'Synced';

  // Don't show a "last synced" time when nothing has ever synced.
  const timeLabel =
    lastSyncedAt && syncState !== 'not_configured'
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

const styles = StyleSheet.create({
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
});

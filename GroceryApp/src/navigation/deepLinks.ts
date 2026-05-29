/**
 * Deep linking configuration for GroceryApp.
 *
 * Handles `grocceryapp://invite?token=...` URLs for family invite flows.
 * Also supports standard navigation paths.
 */

import type { LinkingOptions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// ─── Root Stack Param List ──────────────────────────────────────────────────

export type RootStackParamList = {
  Home: undefined;
  GroceryList: { listId: string };
  ItemEdit: { listId: string; itemId?: string };
  Pairing: undefined;
  Settings: undefined;
  Invite: { token: string };
};

// ─── Deep Link Config ───────────────────────────────────────────────────────

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: ['grocceryapp://', 'https://groceryapp.app'],
  config: {
    screens: {
      Home: '',
      GroceryList: 'list/:listId',
      ItemEdit: 'item/:listId/:itemId?',
      Pairing: 'pairing',
      Settings: 'settings',
      Invite: 'invite',
    },
  },
};

/**
 * Handle incoming deep links — specifically `grocceryapp://invite` URLs.
 * Parsed by expo-linking at app entry point.
 */
export function parseInviteUrl(url: string): { token?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/invite' || parsed.host === 'invite') {
      return { token: parsed.searchParams.get('token') ?? undefined };
    }
    return {};
  } catch {
    return {};
  }
}

// ─── Navigation Prop Type ───────────────────────────────────────────────────

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;
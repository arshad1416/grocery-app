/**
 * Deep linking configuration for GroceryApp.
 *
 * Handles `grocceryapp://invite?token=...` URLs for family invite flows,
 * and `https://groceryapp.app/invite?token=...` universal links.
 * Also supports standard navigation paths.
 *
 * Universal link setup:
 *   iOS: apple-app-site-association served at /.well-known/
 *   Android: assetlinks.json served at /.well-known/
 *   Relay server: invite-redirect.html hosted at relay domain /invite?token=...
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
  Recovery: { mode: 'show' | 'recover' } | undefined;
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
  /**
   * Custom URL parsing for invite tokens.
   * Handles both `grocceryapp://invite?token=...` and
   * `https://groceryapp.app/invite?token=...` formats.
   */
  getInitialURL: () => {
    // Default React Navigation behavior — let the linking subsystem
    // handle initial URL from native modules.
    return undefined;
  },
  subscribe: (listener) => {
    // Default React Navigation subscription — handled by native linking.
    // Could be extended with expo-linking for more control.
    return () => {};
  },
};

/**
 * Parse an invite URL and extract the token.
 *
 * Supports:
 *   - grocceryapp://invite?token=<token>
 *   - https://groceryapp.app/invite?token=<token>
 *   - https://relay.example.com/invite?token=<token> (web redirect)
 *
 * @param url - The incoming URL to parse.
 * @returns An object with the extracted token, if any.
 */
export function parseInviteUrl(url: string): { token?: string } {
  try {
    const parsed = new URL(url);

    // Match paths: /invite or host === 'invite' (for scheme URLs like grocceryapp://invite)
    const isInvitePath =
      parsed.pathname === '/invite' ||
      parsed.pathname.startsWith('/invite/') ||
      parsed.host === 'invite';

    if (isInvitePath) {
      return { token: parsed.searchParams.get('token') ?? undefined };
    }

    return {};
  } catch {
    return {};
  }
}

/**
 * Construct an invite URL for sharing.
 *
 * @param token - The encoded pairing code or invite token.
 * @param useHttps - If true, returns an HTTPS universal link instead of custom scheme.
 * @returns The formatted invite URL string.
 */
export function buildInviteUrl(token: string, useHttps?: boolean): string {
  const encoded = encodeURIComponent(token);
  if (useHttps) {
    return `https://groceryapp.app/invite?token=${encoded}`;
  }
  return `grocceryapp://invite?token=${encoded}`;
}

// ─── Navigation Prop Type ───────────────────────────────────────────────────

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;
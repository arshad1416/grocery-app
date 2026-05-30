/**
 * GroceryApp — Root Application Component.
 *
 * Sets up:
 *  - Navigation container with deep linking config
 *  - Native stack navigator for all screens
 *  - Safe area provider
 *  - Status bar
 */

import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

import { linkingConfig, parseInviteUrl, type RootStackParamList } from './src/navigation/deepLinks';
import { initCrypto, deriveSyncKey, getMasterKey } from './src/crypto';
import { initDeviceIdentity, getDeviceId } from './src/identity/device';
import { getRelayToken, getRelayUrl } from './src/identity/enroll';
import { initSettings, getSettings } from './src/config/settings';
import { database } from './src/storage/database';
import { syncManager } from './src/sync/sync-manager';
import { useSyncStore } from './src/state/useSyncStore';
import { getFamilyId } from './src/identity/family';

import HomeScreen from './src/screens/HomeScreen';
import GroceryListScreen from './src/screens/GroceryListScreen';
import ItemEditScreen from './src/screens/ItemEditScreen';
import PairingScreen from './src/screens/PairingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import RecoveryScreen from './src/screens/RecoveryScreen';

// Pricing subsystem
import { priceRegistry } from './src/pricing/registry';
import { crowdsourcedAdapter } from './src/pricing/crowdsourced';
import { instacartAdapter } from './src/pricing/instacart';
import { scrapingAdapter } from './src/pricing/scraping';

// ─── Stack Navigator ─────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Deep Link Prefix & Navigation Ref ──────────────────────────────────────

const prefix = Linking.createURL('/');
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const combinedLinking = {
  ...linkingConfig,
  prefixes: [...(linkingConfig.prefixes ?? []), prefix],
};

// ─── Invite Screen Wrapper ──────────────────────────────────────────────────
// Wraps PairingScreen so TypeScript is happy with the route name mismatch

function InviteScreen({ route, navigation }: any) {
  return <PairingScreen route={route} navigation={navigation} />;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Step 1: Initialise core services
        await initCrypto();
        await initDeviceIdentity();
        await initSettings();
        
        // Step 2: Initialise WatermelonDB database (touch it to ensure adapter is ready)
        // The database is already created as a module-level singleton; accessing it
        // triggers adapter initialisation.
        const db = database;
        // Verify database is accessible
        await db.get('grocery_lists').query().fetchCount();
        
        // Step 3: Get master key — may be null if no family set up yet
        const masterKey = await getMasterKey();

        // Step 4: Get device ID, family ID, and settings
        const deviceId = getDeviceId();
        const familyId = await getFamilyId();
        const settings = getSettings();

        // If no family membership, skip sync initialization entirely
        // (don't fall back to a shared 'default-family' room)
        if (!familyId) {
          console.log('[app] No family membership found — skipping sync init');
          // Still initialise pricing subsystem
          priceRegistry.registerAdapter(crowdsourcedAdapter);
          priceRegistry.registerAdapter(scrapingAdapter);
          if (settings.hostingTier === 'managed') {
            priceRegistry.registerAdapter(instacartAdapter);
          }
          setIsReady(true);
          return;
        }

        // Derive sync key from master key (must exist if family is set up)
        if (!masterKey) {
          throw new Error('Master encryption key not found. Family setup required before sync.');
        }
        const encryptionKey = await deriveSyncKey(masterKey, 0);

        // Step 5: Load relay token and stored relay URL (from enrollment)
        const loadedRelayToken = await getRelayToken();
        const storedRelayUrl = await getRelayUrl();
        // Prefer stored relay URL over settings (enrollment binds token to URL)
        const relayUrl = storedRelayUrl ?? `${settings.relayUrl}:${settings.relayPort}`;

        // Step 6: Initialise sync manager
        await syncManager.init(
          {
            url: relayUrl,
            familyId,
            deviceId,
            encryptionKey,
            relayToken: loadedRelayToken ?? undefined,
          },
          {
            onConnectionChange: (state) => {
              useSyncStore.getState().setConnectionState(state);
            },
            onSyncError: (error) => {
              console.error('Sync error:', error);
              useSyncStore.getState().setConnectionState('error');
            },
            onRemoteItemsUpdate: (_listId, _items) => {
              // Items updated remotely — grocery store will re-extract on next render
            },
          },
        );

        // Step 6: Hydrate from WatermelonDB into Yjs
        if (masterKey) {
          await syncManager.hydrateFromDB(encryptionKey);
        }

        // Step 7: Initialise pricing subsystem
        priceRegistry.registerAdapter(crowdsourcedAdapter);
        priceRegistry.registerAdapter(scrapingAdapter);
        // Register Instacart adapter only if managed tier
        if (settings.hostingTier === 'managed') {
          priceRegistry.registerAdapter(instacartAdapter);
        }

        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Initialization failed';
        setInitError(message);
        console.error('App init error:', err);
      }
    })();
  }, []);

  // Handle deep links at the app level
  useEffect(() => {
    if (!isReady) return;

    // Handle incoming invite URLs — navigate to PairingScreen with the token
    const handleDeepLink = (url: string) => {
      const { token } = parseInviteUrl(url);
      if (token) {
        console.log('Invite token received:', token);
        // Navigate to PairingScreen with the invite token
        if (navigationRef.isReady()) {
          navigationRef.navigate('Invite', { token });
        }
      }
    };

    // Check initial URL
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Listen for incoming links
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription?.remove();
  }, [isReady]);

  // Loading state
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>
          {initError ? `Error: ${initError}` : 'Loading GroceryApp...'}
        </Text>
        {initError && (
          <Text style={styles.errorHint}>
            Please restart the app. If the problem persists, check your device
            storage and permissions.
          </Text>
        )}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} linking={combinedLinking}>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="GroceryList" component={GroceryListScreen} />
          <Stack.Screen name="ItemEdit" component={ItemEditScreen} />
          <Stack.Screen name="Pairing" component={PairingScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Recovery" component={RecoveryScreen} />
          <Stack.Screen name="Invite" component={InviteScreen} />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  errorHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
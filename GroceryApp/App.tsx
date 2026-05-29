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

// ─── Stack Navigator ─────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Deep Link Prefix & Navigation Ref ──────────────────────────────────────

const prefix = Linking.createURL('/');
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const combinedLinking = {
  ...linkingConfig,
  prefixes: [...(linkingConfig.prefixes ?? []), prefix],
};

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
        
        // Step 3: Get master key and derive sync key
        const masterKey = await getMasterKey();
        const encryptionKey = masterKey
          ? await deriveSyncKey(masterKey, 0)
          : new Uint8Array(32); // fallback for testing

        // Step 4: Get device ID and family ID
        const deviceId = getDeviceId();
        const familyId = (await getFamilyId()) ?? 'default-family';
        const settings = getSettings();

        // Step 5: Initialise sync manager
        await syncManager.init(
          {
            url: `${settings.relayUrl}:${settings.relayPort}`,
            familyId,
            deviceId,
            encryptionKey,
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
          <Stack.Screen name="Invite" component={PairingScreen} />
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
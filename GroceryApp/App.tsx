/**
 * StopHop — Root Application Component.
 *
 * Sets up:
 *  - Navigation container with deep linking config
 *  - Native stack navigator for all screens
 *  - Safe area provider
 *  - Status bar
 */

import * as Sentry from '@sentry/react-native';

// ─── Global Error Handler ────────────────────────────────────────────────────
// Catch any JS error that escapes React's error boundary (e.g. errors during
// module evaluation or async callbacks). This prevents a silent force-close
// and instead stores the error so the loading screen can display it.
let _globalInitError: string | null = null;
const _globalErrorHandler = (error: any, isFatal?: boolean) => {
  const msg = error?.message ?? String(error);
  console.error(`[GlobalError] fatal=${isFatal}:`, error);
  _globalInitError = `Fatal: ${msg}`;
};
// React Native's ErrorUtils is a global polyfill for error handling
if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  (globalThis as any).ErrorUtils.setGlobalHandler(_globalErrorHandler);
}

// Wrap Sentry.init in try/catch — if the native module is missing this
// would otherwise crash before React mounts.
try {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? 'https://examplePublicKey@o0.ingest.sentry.io/0',
    tracesSampleRate: 1.0,
    enabled: !__DEV__,
    beforeSend: (event) => {
      // Scrub sensitive crypto variables from stack traces to prevent
      // key material, passphrases, or plaintext data from leaking to Sentry.
      if (event.exception?.values) {
        for (const value of event.exception.values) {
          if (value.stacktrace?.frames) {
            for (const frame of value.stacktrace.frames) {
              if (frame.vars) {
                // Remove variables that could contain key material or plaintext
                delete frame.vars.key;
                delete frame.vars.masterKey;
                delete frame.vars.secretKey;
                delete frame.vars.privateKey;
                delete frame.vars.encryptionKey;
                delete frame.vars.password;
                delete frame.vars.passphrase;
                delete frame.vars.plaintext;
                delete frame.vars.mnemonic;
                delete frame.vars.recoveryPhrase;
                delete frame.vars.familyKey;
                delete frame.vars.syncKey;
                delete frame.vars.derivedKey;
                delete frame.vars.salt;
                delete frame.vars.nonce;
              }
            }
          }
        }
      }
      // Scrub network request bodies that might contain encrypted payloads
      if (event.request?.data) {
        delete event.request.data;
      }
      return event;
    },
  });
} catch (sentryErr) {
  console.warn('[App] Sentry.init failed (non-fatal):', sentryErr);
}

import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, ScrollView } from 'react-native';
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
import { useThemeStore } from './src/state/useThemeStore';
import { getDatabase } from './src/storage/database';
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
import { flyerScanAdapter } from './src/pricing/flyer-scan';
import { cloudFlyerAdapter } from './src/pricing/cloud-flyer';

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

function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(_globalInitError);
  const [errorStack, setErrorStack] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Step 1: Initialise core services
        console.log('Init: crypto...');
        await initCrypto();
        console.log('Init: device identity...');
        await initDeviceIdentity();
        console.log('Init: settings...');
        await initSettings();
        useThemeStore.getState().hydrateTheme();
        
        // Step 2: Initialise WatermelonDB database (touch it to ensure adapter is ready)
        // getDatabase() creates the adapter lazily on first call — errors are
        // caught by our try/catch instead of crashing at module evaluation time.
        const db = getDatabase();
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
          priceRegistry.registerAdapter(flyerScanAdapter);
          priceRegistry.registerAdapter(cloudFlyerAdapter);
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
        priceRegistry.registerAdapter(flyerScanAdapter);
        priceRegistry.registerAdapter(cloudFlyerAdapter);
        // Register Instacart adapter only if managed tier
        if (settings.hostingTier === 'managed') {
          priceRegistry.registerAdapter(instacartAdapter);
        }

        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Initialization failed';
        const stack = err instanceof Error ? err.stack ?? '' : '';
        setInitError(message);
        setErrorStack(stack);
        console.error('App init error:', err);
        if (err instanceof Error) {
          console.error('Stack:', err.stack);
        }
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
          {initError ? `Error: ${initError}` : 'Loading StopHop...'}
        </Text>
        {initError && (
          <>
            <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorScrollContent}>
              <Text style={styles.errorDetail} selectable>
                {errorStack ? `${initError}\n\n${errorStack}` : initError}
              </Text>
            </ScrollView>
            <Text style={styles.errorHint}>
              Please restart the app. If the problem persists, check your device
              storage and permissions. Long-press the error above to copy.
            </Text>
          </>
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
  errorScroll: {
    maxHeight: 300,
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  errorScrollContent: {
    padding: 12,
  },
  errorDetail: {
    fontSize: 12,
    color: '#c00',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});

export default Sentry.wrap(App);
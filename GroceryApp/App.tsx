if (typeof TextDecoder === 'undefined') {
  class TextDecoderPolyfill {
    decode(arr: Uint8Array): string {
      if (!arr) return '';
      let out = "";
      let i = 0;
      const len = arr.length;
      while (i < len) {
        const c = arr[i++];
        if (c < 128) {
          out += String.fromCharCode(c);
        } else if (c > 191 && c < 224) {
          out += String.fromCharCode(((c & 31) << 6) | (arr[i++] & 63));
        } else if (c > 223 && c < 240) {
          out += String.fromCharCode(((c & 15) << 12) | ((arr[i++] & 63) << 6) | (arr[i++] & 63));
        } else {
          const u = (((c & 7) << 18) | ((arr[i++] & 63) << 12) | ((arr[i++] & 63) << 6) | (arr[i++] & 63)) - 0x10000;
          out += String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 0x3FF));
        }
      }
      return out;
    }
  }
  (globalThis as any).TextDecoder = TextDecoderPolyfill;
}

if (typeof TextEncoder === 'undefined') {
  class TextEncoderPolyfill {
    encode(str: string): Uint8Array {
      const arr = [];
      const len = str.length;
      for (let i = 0; i < len; i++) {
        let c = str.charCodeAt(i);
        if (c < 128) {
          arr.push(c);
        } else if (c < 2048) {
          arr.push((c >> 6) | 192);
          arr.push((c & 63) | 128);
        } else if (c < 55296 || c >= 57344) {
          arr.push((c >> 12) | 224);
          arr.push(((c >> 6) & 63) | 128);
          arr.push((c & 63) | 128);
        } else {
          i++;
          c = 0x10000 + (((c & 1023) << 10) | (str.charCodeAt(i) & 1023));
          arr.push((c >> 18) | 240);
          arr.push(((c >> 12) & 63) | 128);
          arr.push(((c >> 6) & 63) | 128);
          arr.push((c & 63) | 128);
        }
      }
      return new Uint8Array(arr);
    }
  }
  (globalThis as any).TextEncoder = TextEncoderPolyfill;
}

import { LogBox } from 'react-native';
LogBox.ignoreLogs([
  'Open debugger to view warnings',
  'ViewPropTypes',
  'ColorPropType',
  'EdgeInsetsPropType',
]);
if (!__DEV__) {
  LogBox.ignoreAllLogs(true);
}

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useActiveTheme } from './src/state/useThemeStore';

// Static screen imports to avoid chunk loading failures in bare React Native CLI
import HomeScreen from './src/screens/HomeScreen';
import GroceryListScreen from './src/screens/GroceryListScreen';
import ItemEditScreen from './src/screens/ItemEditScreen';
import PairingScreen from './src/screens/PairingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import RecoveryScreen from './src/screens/RecoveryScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import { linkingConfig } from './src/navigation/deepLinks';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function LoadingView() {
  return (
    <SafeAreaProvider>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7CB342" />
        <Text style={styles.loadingText}>Loading StopHop...</Text>
      </View>
    </SafeAreaProvider>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [Screens, setScreens] = useState<any>(null);

  useEffect(() => {
    async function init() {
      try {
        // 1. Init services (crypto, database)
        const crypto = await import('./src/crypto');
        await crypto.initCrypto();

        const database = await import('./src/storage/database');
        const db = database.getDatabase();
        await db.get('grocery_lists').query().fetchCount();

        // Load vector fonts dynamically
        const Font = await import('expo-font');
        const { Ionicons, Feather } = await import('@expo/vector-icons');
        await Font.loadAsync({
          ...Ionicons.font,
          ...Feather.font,
        });

        // Init device identity
        const device = await import('./src/identity/device');
        await device.initDeviceIdentity();

        // Init settings store (loads from SecureStore → populates cache)
        const { initSettings, getSettings } = await import('./src/config/settings');
        await initSettings();

        // Init Turso if configured
        try {
          const { initTurso } = await import('./src/services/tursoClient');
          const settings = getSettings();
          const tursoUrl = settings.tursoUrl || 'https://stophop-arshad1416.aws-us-east-1.turso.io';
          const tursoToken = settings.tursoToken || '***';
          if (tursoUrl && tursoToken) {
            initTurso({ url: tursoUrl, token: tursoToken });
            console.warn('[init] Turso connected successfully');
          }
        } catch (e) {
          console.warn('[init] Turso init failed:', e);
        }

        // Init Sentry (respects user's sentryEnabled opt-out)
        try {
          const { initSentry } = await import('./src/services/sentry');
          await initSentry();
        } catch {
          // Sentry init failure is non-fatal
        }

        setScreens({
          Home: HomeScreen,
          GroceryList: GroceryListScreen,
          ItemEdit: ItemEditScreen,
          Pairing: PairingScreen,
          Settings: SettingsScreen,
          Recovery: RecoveryScreen,
          Privacy: PrivacyScreen,
          linkingConfig: linkingConfig,
        });
        setReady(true);
      } catch (err) {
        console.error('[init] Failed:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    init();
  }, []);

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorMsg}>{error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Show splash screen while loading
  if (showSplash) {
    const SplashScreen = require('./src/screens/SplashScreen').default;
    return (
      <SafeAreaProvider>
        <SplashScreen onFinish={() => setShowSplash(false)} />
      </SafeAreaProvider>
    );
  }

  if (!ready || !Screens) return <LoadingView />;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef} linking={Screens.linkingConfig}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Home" component={Screens.Home} />
            <Stack.Screen name="GroceryList" component={Screens.GroceryList} />
            <Stack.Screen name="ItemEdit" component={Screens.ItemEdit} />
            <Stack.Screen name="Pairing" component={Screens.Pairing} />
            <Stack.Screen name="Settings" component={Screens.Settings} />
            <Stack.Screen name="Privacy" component={Screens.Privacy} />
            <Stack.Screen name="Recovery" component={Screens.Recovery} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="light" />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDF8F0' },
  loadingText: { color: '#1A1A1A', fontSize: 16, marginTop: 16 },
  errorTitle: { color: '#E53935', fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  errorMsg: { color: '#1A1A1A', fontSize: 16, textAlign: 'center', paddingHorizontal: 32 },
});

export default App;

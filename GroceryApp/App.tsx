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
  (global as any).TextDecoder = TextDecoderPolyfill;
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
  (global as any).TextEncoder = TextEncoderPolyfill;
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

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function LoadingView() {
  return (
    <SafeAreaProvider>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading StopHop...</Text>
      </View>
    </SafeAreaProvider>
  );
}

function App() {
  const [ready, setReady] = useState(false);
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

        // Init device identity
        const device = await import('./src/identity/device');
        await device.initDeviceIdentity();

        // Init Turso if configured
        const { initTurso, isTursoReady } = await import('./src/services/tursoClient');
        const { getSettings } = await import('./src/config/settings');
        try {
          const settings = getSettings();
          if (settings.tursoUrl && settings.tursoToken) {
            initTurso({ url: settings.tursoUrl, token: settings.tursoToken });
            console.log('[init] Turso connected');
          }
        } catch {
          // Settings not loaded yet or Turso not configured — skip
        }

        // 2. Load navigation config
        const deepLinks = await import('./src/navigation/deepLinks');

        // 3. Dynamically import all screens at once
        const [Home, GroceryList, ItemEdit, Pairing, Settings, Recovery] = await Promise.all([
          import('./src/screens/HomeScreen'),
          import('./src/screens/GroceryListScreen'),
          import('./src/screens/ItemEditScreen'),
          import('./src/screens/PairingScreen'),
          import('./src/screens/SettingsScreen'),
          import('./src/screens/RecoveryScreen'),
        ]);

        setScreens({
          Home: Home.default,
          GroceryList: GroceryList.default,
          ItemEdit: ItemEdit.default,
          Pairing: Pairing.default,
          Settings: Settings.default,
          Recovery: Recovery.default,
          linkingConfig: deepLinks.linkingConfig,
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
            <Stack.Screen name="Recovery" component={Screens.Recovery} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="light" />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F19' },
  loadingText: { color: '#F8FAFC', fontSize: 16, marginTop: 16 },
  errorTitle: { color: '#EF4444', fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  errorMsg: { color: '#F8FAFC', fontSize: 16, textAlign: 'center' },
});

export default App;

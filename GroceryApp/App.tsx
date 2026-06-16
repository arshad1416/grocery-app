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

import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import Svg, { Rect, Path } from 'react-native-svg';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [Screens, setScreens] = useState<any>(null);

  // Splash Screen Animations
  const [splashFinished, setSplashFinished] = useState(false);
  const splashFade = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  // Start splash fade-in on mount
  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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

        // Init settings store (loads from SecureStore → populates cache)
        const { initSettings, getSettings } = await import('./src/config/settings');
        await initSettings();

        // Init Turso if configured
        try {
          const { initTurso } = await import('./src/services/tursoClient');
          const settings = getSettings();
          const tursoUrl = settings.tursoUrl || 'https://stophop-arshad1416.aws-us-east-1.turso.io';
          const tursoToken = settings.tursoToken || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE1NTE2MDYsImlkIjoiMDE5ZWM5YmEtMTAwMS03ODc3LWEyODItOTg1NWRmYmYwNTMyIiwicmlkIjoiNmZlMGE0ZjMtYjdiYi00NTA1LThiYzUtYzRjMzIyNjMzZTMzIn0.x3DOt5iEFPaz8Yy8TH6XuUuVR9fbwfFPxsyEGqMv_4-rqO075FfwVT3Xxf7gzwmhyQDjklWbarWopNkNlAZOBw';
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

        // 2. Load navigation config
        const deepLinks = await import('./src/navigation/deepLinks');

        // 3. Dynamically import all screens at once
        const [Home, GroceryList, ItemEdit, Pairing, Settings, Recovery, Privacy] = await Promise.all([
          import('./src/screens/HomeScreen'),
          import('./src/screens/GroceryListScreen'),
          import('./src/screens/ItemEditScreen'),
          import('./src/screens/PairingScreen'),
          import('./src/screens/SettingsScreen'),
          import('./src/screens/RecoveryScreen'),
          import('./src/screens/PrivacyScreen'),
        ]);

        setScreens({
          Home: Home.default,
          GroceryList: GroceryList.default,
          ItemEdit: ItemEdit.default,
          Pairing: Pairing.default,
          Settings: Settings.default,
          Recovery: Recovery.default,
          Privacy: Privacy.default,
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

  // Fade-out splash when navigation is ready
  useEffect(() => {
    if (ready && Screens) {
      const timer = setTimeout(() => {
        Animated.timing(splashFade, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setSplashFinished(true);
        });
      }, 1000); // 1s presentation time
      return () => clearTimeout(timer);
    }
  }, [ready, Screens]);

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

  return (
    <SafeAreaProvider style={{ backgroundColor: '#080D09' }}>
      <ErrorBoundary>
        {ready && Screens && (
          <NavigationContainer ref={navigationRef} linking={Screens.linkingConfig}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }}>
              <Stack.Screen name="Home" component={Screens.Home} />
              <Stack.Screen name="GroceryList" component={Screens.GroceryList} />
              <Stack.Screen name="ItemEdit" component={Screens.ItemEdit} />
              <Stack.Screen name="Pairing" component={Screens.Pairing} />
              <Stack.Screen name="Settings" component={Screens.Settings} />
              <Stack.Screen name="Privacy" component={Screens.Privacy} />
              <Stack.Screen name="Recovery" component={Screens.Recovery} />
            </Stack.Navigator>
          </NavigationContainer>
        )}

        {!splashFinished && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.splashContainer,
              { opacity: splashFade }
            ]}
            pointerEvents={ready ? "none" : "auto"}
          >
            <Animated.View
              style={[
                styles.logoWrapper,
                { opacity: logoOpacity, transform: [{ scale: logoScale }] }
              ]}
            >
              <Svg width={140} height={140} viewBox="0 0 100 100">
                {/* Shopping bag / cart representation */}
                <Rect x="24" y="38" width="52" height="46" rx="12" fill="#16A34A" />
                
                {/* Handle */}
                <Path
                  d="M37 38V28c0-7.2 5.8-13 13-13s13 5.8 13 13v10"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                />
                
                {/* Organic Leaf shape decoration inside */}
                <Path
                  d="M50 46c0 0 12 3 16 14c-4 12-16 9-16 9s-12-3-16-14c4-12 16-9 16-9z"
                  fill="#86EFAC"
                />
                <Path
                  d="M34 60c16-2 32 9 32 9"
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </Svg>
            </Animated.View>
            
            <Animated.View style={{ opacity: textOpacity, alignItems: 'center', marginTop: 24 }}>
              <Text style={styles.splashTitle}>StopHop</Text>
              <Text style={styles.splashTagline}>Your Intelligent Grocery Path</Text>
            </Animated.View>
          </Animated.View>
        )}
        <StatusBar style="light" />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#080D09' },
  errorTitle: { color: '#EF4444', fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  errorMsg: { color: '#F8FAFC', fontSize: 16, textAlign: 'center' },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080D09',
  },
  logoWrapper: {
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#F0FDF4',
    letterSpacing: -1,
  },
  splashTagline: {
    fontSize: 15,
    color: '#8BA093',
    marginTop: 8,
    letterSpacing: 0.5,
  },
});

export default App;

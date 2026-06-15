import React, { useEffect, useState, Suspense, lazy } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

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

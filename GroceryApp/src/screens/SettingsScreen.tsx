/**
 * Settings Screen — two-tier hosting configuration.
 *
 * Provides:
 *  - Tier selector (self-hosted / managed) as a segmented control
 *  - Relay URL input with "Test Connection" button
 *  - Pairing code display (QR code) for self-hosted
 *  - Managed tier: subscription key input + plan info
 *  - Toggle switches for opt-in features
 *  - Local AI endpoint input (self-hosted only)
 *
 * Uses expo-secure-store via the settings module for persistence.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

import {
  initSettings,
  getSettings,
  updateSettings,
  testRelayConnection,
  setHostingTier,
} from '../config/settings';
import { getDeviceId } from '../identity/device';
import type { AppSettings, HostingTier, ConnectionStatus } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/deepLinks';

// ─── Segmented Control ───────────────────────────────────────────────────────

interface SegmentedControlProps {
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
}

function SegmentedControl({ options, selected, onSelect }: SegmentedControlProps) {
  return (
    <View style={styles.segmentedControl}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.segmentButton,
            selected === opt.value && styles.segmentButtonActive,
          ]}
          onPress={() => onSelect(opt.value)}
        >
          <Text
            style={[
              styles.segmentText,
              selected === opt.value && styles.segmentTextActive,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Settings Row ────────────────────────────────────────────────────────────

interface SettingsRowProps {
  label: string;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'url' | 'numeric';
}

function SettingsRow({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: SettingsRowProps) {
  return (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsLabel}>{label}</Text>
      {onChangeText ? (
        <TextInput
          style={styles.settingsInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : (
        <Text style={styles.settingsValue} selectable>
          {value ?? '-'}
        </Text>
      )}
    </View>
  );
}

// ─── Toggle Row ──────────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, value, onValueChange, disabled }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, disabled && styles.disabled]}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#ddd', true: '#4CAF50' }}
        thumbColor={value ? '#fff' : '#f4f3f4'}
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [testingConnection, setTestingConnection] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    (async () => {
      await initSettings();
      const s = getSettings();
      setSettingsState(s);
      setLoaded(true);
    })();
  }, []);

  // Update handler
  const handleUpdate = useCallback(async (partial: Partial<AppSettings>) => {
    const updated = await updateSettings(partial);
    setSettingsState(updated);
  }, []);

  // Tier switch handler
  const handleTierChange = useCallback(
    async (tier: string) => {
      const updated = await setHostingTier(tier as HostingTier);
      setSettingsState(updated);
    },
    [],
  );

  // Test connection handler
  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setTestingConnection(true);
    setConnectionStatus('connecting');

    const ok = await testRelayConnection(settings.relayUrl, settings.relayPort);

    if (ok) {
      setConnectionStatus('connected');
      Alert.alert('Connection Successful', 'Relay server is reachable.');
    } else {
      setConnectionStatus('error');
      Alert.alert(
        'Connection Failed',
        'Could not reach the relay server. Check the URL and port.',
      );
    }

    setTestingConnection(false);
  }, [settings]);

  if (!loaded || !settings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  const deviceId = getDeviceId();
  const isSelfHosted = settings.hostingTier === 'self_hosted';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* ── Tier Selector ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hosting Tier</Text>
        <SegmentedControl
          options={[
            { label: 'Self-Hosted', value: 'self_hosted' },
            { label: 'Managed', value: 'managed' },
          ]}
          selected={settings.hostingTier}
          onSelect={handleTierChange}
        />
      </View>

      {/* ── Device Info ──────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>
        <SettingsRow label="Device ID" value={deviceId} />
      </View>

      {/* ── Relay Configuration ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Relay Server</Text>

        <SettingsRow
          label="WebSocket URL"
          value={settings.relayUrl}
          onChangeText={(v) => handleUpdate({ relayUrl: v })}
          placeholder="ws://localhost"
          keyboardType="url"
        />

        <SettingsRow
          label="Port"
          value={String(settings.relayPort)}
          onChangeText={(v) =>
            handleUpdate({ relayPort: parseInt(v, 10) || 8080 })
          }
          placeholder="8080"
          keyboardType="numeric"
        />

        <TouchableOpacity
          style={[
            styles.testButton,
            testingConnection && styles.testButtonDisabled,
            connectionStatus === 'connected' && styles.testButtonSuccess,
            connectionStatus === 'error' && styles.testButtonError,
          ]}
          onPress={handleTestConnection}
          disabled={testingConnection}
        >
          {testingConnection ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.testButtonText}>
              {connectionStatus === 'connected'
                ? '✓ Connected'
                : connectionStatus === 'error'
                  ? '✗ Retry Connection'
                  : 'Test Connection'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Self-Hosted: Pairing Code ────────────────────────────────── */}
      {isSelfHosted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pairing Code</Text>
          <Text style={styles.sectionDescription}>
            Share this code with other family members to pair with your
            self-hosted relay.
          </Text>
          <Text style={styles.pairingCodeBox}>
            {settings.pairingCode || 'Generate pairing code from setup screen'}
          </Text>
        </View>
      )}

      {/* ── Managed Tier: Subscription ───────────────────────────────── */}
      {!isSelfHosted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Managed Subscription</Text>
          <SettingsRow
            label="Subscription Key"
            value={settings.managedSubscriptionKey}
            onChangeText={(v) => handleUpdate({ managedSubscriptionKey: v })}
            placeholder="Enter your subscription key"
            secureTextEntry
          />
          <Text style={styles.planInfo}>
            Plan: Managed Relay + Encrypted Sync
          </Text>
        </View>
      )}

      {/* ── Local AI Endpoint (Self-Hosted Only) ─────────────────────── */}
      {isSelfHosted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Endpoint</Text>
          <SettingsRow
            label="Local AI URL"
            value={settings.localAiEndpoint}
            onChangeText={(v) => handleUpdate({ localAiEndpoint: v })}
            placeholder="http://localhost:1234"
            keyboardType="url"
          />
        </View>
      )}

      {/* ── Opt-In Features ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Features</Text>

        <ToggleRow
          label="Price Service"
          value={settings.priceServiceEnabled}
          onValueChange={(v) => handleUpdate({ priceServiceEnabled: v })}
        />

        <ToggleRow
          label="Voice Input"
          value={settings.voiceInputEnabled}
          onValueChange={(v) => handleUpdate({ voiceInputEnabled: v })}
        />

        <ToggleRow
          label="Barcode Scanning"
          value={settings.barcodeScanningEnabled}
          onValueChange={(v) => handleUpdate({ barcodeScanningEnabled: v })}
        />
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    padding: 20,
    paddingBottom: 8,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backBtn: {
    paddingRight: 8,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  section: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    lineHeight: 18,
  },
  settingsRow: {
    marginBottom: 12,
  },
  settingsLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  settingsInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  settingsValue: {
    fontSize: 13,
    color: '#555',
    fontFamily: 'monospace',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 15,
    color: '#333',
  },
  disabled: {
    opacity: 0.4,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderRadius: 8,
    padding: 2,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#4CAF50',
  },
  segmentText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonSuccess: {
    backgroundColor: '#4CAF50',
  },
  testButtonError: {
    backgroundColor: '#f44336',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pairingCodeBox: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#333',
    lineHeight: 16,
  },
  planInfo: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  bottomSpacer: {
    height: 40,
  },
});
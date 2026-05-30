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
import { generatePairingCode, pairingCodeToString } from '../setup/self-host';
import { priceRegistry } from '../pricing/registry';
import { crowdsourcedAdapter } from '../pricing/crowdsourced';
import { instacartAdapter } from '../pricing/instacart';
import { scrapingAdapter } from '../pricing/scraping';
import QRCode from '../components/QRCode';
import ContributeConsentModal from '../components/ContributeConsentModal';
import { useShareInvite } from '../hooks/useShareInvite';

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
  // Adapter toggle states
  const [crowdEnabled, setCrowdEnabled] = useState(true);
  const [instacartEnabled, setInstacartEnabled] = useState(true);
  const [scrapingEnabled, setScrapingEnabled] = useState(false);
  // Pricing opt-in state
  const [pricingOptedIn, setPricingOptedIn] = useState(false);
  const [pricingDisclosureShown, setPricingDisclosureShown] = useState(false);
  // Contribution state (Stage 3)
  const [contributeEnabled, setContributeEnabled] = useState(false);
  const [contributeStoreGranularity, setContributeStoreGranularity] = useState<'region' | 'branch'>('region');
  const [contributeConsentShown, setContributeConsentShown] = useState(false);
  const [showContributeConsent, setShowContributeConsent] = useState(false);

  const { shareInvite } = useShareInvite();

  // Load settings on mount
  useEffect(() => {
    (async () => {
      await initSettings();
      const s = getSettings();
      setSettingsState(s);
      setPricingOptedIn(s.pricingOptedIn);
      setContributeEnabled(s.contributeEnabled ?? false);
      setContributeStoreGranularity(s.contributeStoreGranularity ?? 'region');
      setContributeConsentShown(s.contributeConsentShown ?? false);
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
          <TouchableOpacity
            style={styles.generateQrBtn}
            onPress={async () => {
              try {
                const code = await generatePairingCode(
                  deviceId,
                  'default-family',
                  `${settings.relayUrl}:${settings.relayPort}`,
                );
                const codeStr = pairingCodeToString(code);
                await updateSettings({ pairingCode: codeStr });
                setSettingsState((prev) => prev ? { ...prev, pairingCode: codeStr } : prev);
                Alert.alert('QR Code Generated', 'Pairing code is ready. Share it with family members.');
              } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to generate QR';
                Alert.alert('Error', message);
              }
            }}
          >
            <Text style={styles.generateQrBtnText}>Generate QR Code</Text>
          </TouchableOpacity>
          {settings.pairingCode && (
            <View style={styles.qrCodeContainer}>
              <Text style={styles.qrCodeLabel}>Scan to join your family list</Text>
              <QRCode
                data={`grocceryapp://invite?token=${encodeURIComponent(settings.pairingCode)}`}
                size={180}
                testID="pairing-qr-code"
              />
              <Text style={styles.qrCodeData} selectable numberOfLines={3}>
                {settings.pairingCode}
              </Text>
              <TouchableOpacity
                style={styles.shareInviteBtn}
                onPress={() =>
                  shareInvite(
                    `grocceryapp://invite?token=${encodeURIComponent(settings.pairingCode)}`,
                  )
                }
              >
                <Text style={styles.shareInviteBtnText}>Share Invite</Text>
              </TouchableOpacity>
            </View>
          )}
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
          <Text style={styles.tierDescription}>
            Managed: Price queries are anonymized through our relay. Item names are hashed.
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

        {/* Pricing Opt-In Toggle with Privacy Disclosure */}
        <ToggleRow
          label="Pricing Lookups (Opt-In)"
          value={pricingOptedIn}
          onValueChange={async (v) => {
            if (v && !pricingDisclosureShown) {
              // Show privacy disclosure dialog on first enable
              setPricingDisclosureShown(true);
              Alert.alert(
                'Privacy Disclosure',
                'Enabling pricing sends anonymized item names to price sources. Your shopping habits are not tracked or stored. You can disable this anytime.',
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => {
                    setPricingDisclosureShown(false);
                    setPricingOptedIn(false);
                  }},
                  {
                    text: 'Enable',
                    onPress: async () => {
                      setPricingOptedIn(true);
                      await handleUpdate({ pricingOptedIn: true } as any);
                    },
                  },
                ],
              );
            } else {
              setPricingOptedIn(v);
              await handleUpdate({ pricingOptedIn: v } as any);
            }
          }}
        />
        {pricingOptedIn && (
          <Text style={styles.privacyNote}>
            Item names are normalized and hashed before being sent to price sources.
          </Text>
        )}

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

      {/* ── Security ────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Text style={styles.sectionDescription}>
          Manage your recovery phrase and key backup options.
        </Text>

        <TouchableOpacity
          style={styles.securityButton}
          onPress={() => {
            Alert.alert(
              'View Recovery Phrase',
              'Your recovery phrase gives access to your family data. Only view this in a private setting.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'View Phrase',
                  onPress: () => navigation.navigate('Recovery', { mode: 'show' }),
                },
              ],
            );
          }}
        >
          <Text style={styles.securityButtonText}>
            🔐 View Recovery Phrase
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.securityButton, styles.securityButtonSecondary]}
          onPress={() =>
            navigation.navigate('Recovery', { mode: 'recover' })
          }
        >
          <Text style={styles.securityButtonTextSecondary}>
            🔑 Recover from Backup
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Pricing Subsystem ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pricing</Text>

        {isSelfHosted && (
          <Text style={styles.pricingNote}>
            Self-host: All price lookups stay local. No data leaves your network.
          </Text>
        )}

        <ToggleRow
          label="Use community flyer prices"
          value={settings.cloudFlyerEnabled ?? false}
          onValueChange={(v) => handleUpdate({ cloudFlyerEnabled: v })}
        />
        {settings.cloudFlyerEnabled && (
          <Text style={styles.privacyNote}>
            Prices from the community flyer pool — anonymized and aggregated.
          </Text>
        )}

        <ToggleRow
          label="Contribute my scans"
          value={contributeEnabled}
          onValueChange={async (v) => {
            if (v && !contributeConsentShown) {
              // Show consent modal on first enable
              setShowContributeConsent(true);
            } else {
              setContributeEnabled(v);
              await handleUpdate({ contributeEnabled: v } as any);
            }
          }}
        />
        {contributeEnabled && (
          <Text style={styles.privacyNote}>
            Anonymized scan prices are shared to help others. Your identity is never included.
          </Text>
        )}

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Crowd-Sourced</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, color: '#4CAF50' }}>● Active</Text>
            <Switch
              value={crowdEnabled}
              onValueChange={async (v) => {
                setCrowdEnabled(v);
                await priceRegistry.setAdapterEnabled('crowdsourced', v);
              }}
              trackColor={{ false: '#ddd', true: '#4CAF50' }}
              thumbColor={crowdEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Instacart</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{
              fontSize: 11,
              color: instacartAdapter.isAvailable() ? '#4CAF50' : '#999',
            }}>
              {instacartAdapter.isAvailable() ? '● Connected' : '○ Not configured'}
            </Text>
            <Switch
              value={instacartEnabled}
              onValueChange={async (v) => {
                setInstacartEnabled(v);
                await priceRegistry.setAdapterEnabled('instacart', v);
              }}
              trackColor={{ false: '#ddd', true: '#4CAF50' }}
              thumbColor={instacartEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, !isSelfHosted && styles.disabled]}>
            Scraping (Self-Host Only)
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, color: '#999' }}>
              {scrapingEnabled ? '● On' : '○ Off'}
            </Text>
            <Switch
              value={scrapingEnabled && isSelfHosted}
              onValueChange={async (v) => {
                if (v && !isSelfHosted) {
                  Alert.alert(
                    'Restricted',
                    'Web scraping is only available in self-hosted mode.',
                  );
                  return;
                }
                setScrapingEnabled(v);
                await priceRegistry.setAdapterEnabled('scraping', v);
                await handleUpdate({ scrapingEnabled: v } as any);
              }}
              disabled={!isSelfHosted}
              trackColor={{ false: '#ddd', true: '#FF9800' }}
              thumbColor={scrapingEnabled && isSelfHosted ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Clear local price database */}
        <TouchableOpacity
          style={styles.clearPricesBtn}
          onPress={() => {
            Alert.alert(
              'Clear Price Data',
              'Remove all locally submitted crowd-sourced prices?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    crowdsourcedAdapter.clearAllPrices();
                    Alert.alert('Done', 'Local price data cleared.');
                  },
                },
              ],
            );
          }}
        >
          <Text style={styles.clearPricesText}>Clear Local Prices</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />

      {/* ── Contribute Consent Modal ──────────────────────────────── */}
      <ContributeConsentModal
        visible={showContributeConsent}
        onConfirm={async (granularity) => {
          setContributeStoreGranularity(granularity);
          setContributeConsentShown(true);
          setContributeEnabled(true);
          setShowContributeConsent(false);
          await handleUpdate({
            contributeEnabled: true,
            contributeStoreGranularity: granularity,
            contributeConsentShown: true,
          } as any);
        }}
        onCancel={() => {
          setShowContributeConsent(false);
          setContributeConsentShown(true);
          handleUpdate({ contributeConsentShown: true } as any);
        }}
        onSkip={() => {
          setShowContributeConsent(false);
          setContributeConsentShown(true);
          handleUpdate({ contributeConsentShown: true } as any);
        }}
      />
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
  generateQrBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  generateQrBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  qrCodeContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  qrCodeLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  qrCodeBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  qrCodeText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#333',
    lineHeight: 14,
    letterSpacing: 1,
  },
  qrCodeData: {
    fontSize: 9,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  shareInviteBtn: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  shareInviteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  clearPricesBtn: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  clearPricesText: {
    fontSize: 13,
    color: '#f44336',
    fontWeight: '600',
  },
  securityButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  securityButtonSecondary: {
    backgroundColor: '#FF9800',
  },
  securityButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  securityButtonTextSecondary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 8,
    marginTop: -4,
    lineHeight: 16,
  },
  tierDescription: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },
  pricingNote: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
    marginBottom: 8,
    lineHeight: 16,
  },
});
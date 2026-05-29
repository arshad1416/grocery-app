/**
 * Pairing Screen — QR code scanner for self-hosted relay setup.
 *
 * Provides:
 *  - QR scanner (expo-camera) for scanning pairing codes from a self-hosted server
 *  - Manual URL input fallback
 *  - "Test Connection" button that checks /health
 *  - Connection status display (connecting, connected, error)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { testRelayConnection, updateSettings } from '../config/settings';
import { parsePairingCodeString } from '../setup/self-host';
import type { ConnectionStatus, PairingCode } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/deepLinks';

// Mock for expo-camera — real implementation would use CameraView with barcode scanner
// import { CameraView } from 'expo-camera';

// ─── Props ──────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Pairing'>;

interface PairingScreenProps {
  onPairingComplete?: (pairingCode: PairingCode) => void;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PairingScreen({ navigation, route }: Props) {
  // Extract token from route params if navigated from Invite screen
  const inviteToken = (route.params as any)?.token;
  const [manualUrl, setManualUrl] = useState('');
  const [manualPort, setManualPort] = useState('8080');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [testingConnection, setTestingConnection] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [parsedCode, setParsedCode] = useState<PairingCode | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Process invite token if present
  useEffect(() => {
    if (inviteToken) {
      setStatusMessage(`Processing invite token...`);
      (async () => {
        try {
          // Try to parse the token as a pairing code
          const code = await parsePairingCodeString(inviteToken);
          setParsedCode(code);
          setManualUrl(code.relayUrl);
          setStatusMessage('Invite token parsed! Connecting...');

          // Auto-test connection
          const url = code.relayUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
          const portMatch = code.relayUrl.match(/:(\d+)$/);
          const port = portMatch ? parseInt(portMatch[1], 10) : 8080;

          setConnectionStatus('connecting');
          const ok = await testRelayConnection(code.relayUrl, port);

          if (ok) {
            setConnectionStatus('connected');
            setStatusMessage('Connected to relay server via invite!');

            // Save pairing info
            await updateSettings({
              relayUrl: code.relayUrl,
              relayPort: port,
              pairingCode: inviteToken,
            });

            Alert.alert(
              'Invite Accepted',
              'You have been paired with the family relay server.',
              [
                {
                  text: 'OK',
                  onPress: () => navigation.navigate('Home'),
                },
              ],
            );
          } else {
            setConnectionStatus('error');
            setStatusMessage('Could not connect to relay server from invite');
          }
        } catch {
          // If it's not a pairing code, it might be a family invite token
          setStatusMessage('Invite token received. Please enter the relay URL manually to complete pairing.');
        }
      })();
    }
  }, [inviteToken]);

  // Handle QR code scan result
  const handleScan = useCallback(
    async (data: string) => {
      try {
        setStatusMessage('Parsing pairing code...');
        const code = await parsePairingCodeString(data);
        setParsedCode(code);
        setManualUrl(code.relayUrl);
        setStatusMessage('Pairing code valid! Connecting...');

        // Auto-test connection
        const url = code.relayUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
        const portMatch = code.relayUrl.match(/:(\d+)$/);
        const port = portMatch ? parseInt(portMatch[1], 10) : 8080;

        setConnectionStatus('connecting');
        const ok = await testRelayConnection(code.relayUrl, port);

        if (ok) {
          setConnectionStatus('connected');
          setStatusMessage('Connected to relay server!');

          // Save pairing info
          await updateSettings({
            relayUrl: code.relayUrl,
            relayPort: port,
            pairingCode: data,
          });

          // Navigate back to home after successful pairing
          navigation.navigate('Home');
        } else {
          setConnectionStatus('error');
          setStatusMessage('Could not connect to relay server');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid pairing code';
        setStatusMessage(message);
        Alert.alert('Invalid Code', message);
      }
    },
    [navigation],
  );

  // Handle manual test connection
  const handleManualTest = useCallback(async () => {
    if (!manualUrl) {
      Alert.alert('Missing URL', 'Please enter a WebSocket URL.');
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('connecting');
    setStatusMessage('Testing connection...');

    const port = parseInt(manualPort, 10) || 8080;
    const ok = await testRelayConnection(manualUrl, port);

    if (ok) {
      setConnectionStatus('connected');
      setStatusMessage('Connected to relay server!');

      await updateSettings({
        relayUrl: manualUrl,
        relayPort: port,
      });
    } else {
      setConnectionStatus('error');
      setStatusMessage('Could not reach the relay server');
      Alert.alert(
        'Connection Failed',
        'Could not reach the relay server. Check the URL and port.',
      );
    }

    setTestingConnection(false);
  }, [manualUrl, manualPort]);

  // Connection status indicator
  const statusColor =
    connectionStatus === 'connected'
      ? '#4CAF50'
      : connectionStatus === 'error'
        ? '#f44336'
        : connectionStatus === 'connecting'
          ? '#FF9800'
          : '#999';

  const statusIcon =
    connectionStatus === 'connected'
      ? '✓'
      : connectionStatus === 'error'
        ? '✗'
        : connectionStatus === 'connecting'
          ? '⟳'
          : '•';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pair with Relay</Text>
      </View>

      {/* ── QR Scanner Section ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scan QR Code</Text>
        <Text style={styles.sectionDescription}>
          Point your camera at the QR code displayed on your self-hosted relay
          server's setup page.
        </Text>

        {/* QR Scanner placeholder — in production, use CameraView from expo-camera */}
        <View style={styles.scannerPlaceholder}>
          {scannerActive ? (
            <View style={styles.scannerActive}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.scannerText}>
                Camera active — point at QR code
              </Text>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setScannerActive(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setScannerActive(true)}
            >
              <Text style={styles.scanButtonText}>Open Scanner</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Manual URL Input ────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manual Connection</Text>
        <Text style={styles.sectionDescription}>
          Enter the WebSocket URL and port of your relay server.
        </Text>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>WebSocket URL</Text>
          <TextInput
            style={styles.input}
            value={manualUrl}
            onChangeText={setManualUrl}
            placeholder="ws://192.168.1.100"
            placeholderTextColor="#999"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Port</Text>
          <TextInput
            style={[styles.input, styles.portInput]}
            value={manualPort}
            onChangeText={setManualPort}
            placeholder="8080"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.testButton,
            testingConnection && styles.testButtonDisabled,
          ]}
          onPress={handleManualTest}
          disabled={testingConnection}
        >
          {testingConnection ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.testButtonText}>Test Connection</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Connection Status ───────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]}>
            <Text style={styles.statusIcon}>{statusIcon}</Text>
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>
              {connectionStatus === 'connected'
                ? 'Connected'
                : connectionStatus === 'error'
                  ? 'Error'
                  : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Not connected'}
            </Text>
            {statusMessage ? (
              <Text style={styles.statusMessage}>{statusMessage}</Text>
            ) : null}
          </View>
        </View>

        {parsedCode && (
          <View style={styles.parsedCodeInfo}>
            <Text style={styles.parsedLabel}>Relay URL:</Text>
            <Text style={styles.parsedValue} selectable>
              {parsedCode.relayUrl}
            </Text>
            <Text style={styles.parsedLabel}>Family ID:</Text>
            <Text style={styles.parsedValue} selectable>
              {parsedCode.familyId}
            </Text>
            <Text style={styles.parsedLabel}>Device ID:</Text>
            <Text style={styles.parsedValue} selectable>
              {parsedCode.deviceId}
            </Text>
          </View>
        )}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    padding: 20,
    paddingBottom: 8,
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
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    lineHeight: 18,
  },
  scannerPlaceholder: {
    height: 200,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  scannerActive: {
    alignItems: 'center',
    gap: 12,
  },
  scannerText: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: '#f44336',
    fontSize: 14,
  },
  inputRow: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  portInput: {
    width: 120,
  },
  testButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusMessage: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  parsedCodeInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
  },
  parsedLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  parsedValue: {
    fontSize: 13,
    color: '#333',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  bottomSpacer: {
    height: 40,
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
});
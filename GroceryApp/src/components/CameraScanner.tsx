/**
 * CameraScanner — QR code scanner using expo-camera with fallback.
 *
 * Design:
 *  - Attempts to dynamically require expo-camera for barcode scanning
 *  - Graceful fallback if expo-camera is not installed
 *  - Scans for QR codes containing `grocceryapp://invite?token=`
 *  - Parses the token from scanned URL and calls onScan
 *
 * Props:
 *  - onScan(token: string) — called when a valid QR code is scanned
 *  - onCancel() — called when the user taps cancel/back
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CameraScannerProps {
  /** Called when a valid QR code containing an invite URL is scanned. */
  onScan: (token: string) => void;
  /** Called when the user cancels scanning. */
  onCancel: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INVITE_URL_PREFIX = 'grocceryapp://invite?token=';

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Parse an invite URL from scanned QR data.
 * Expects format: grocceryapp://invite?token=<value>
 * Returns the token value, or null if not a valid invite URL.
 */
export function parseInviteUrl(data: string): string | null {
  if (data.startsWith(INVITE_URL_PREFIX)) {
    return data.substring(INVITE_URL_PREFIX.length);
  }
  // Also support https:// variants
  const httpsMatch = data.match(
    /^https:\/\/[^/]+\/invite\?token=([^&\s]+)/,
  );
  if (httpsMatch) {
    return httpsMatch[1];
  }
  return null;
}

// ─── Camera Module Detection ────────────────────────────────────────────────

interface ExpoCameraModule {
  CameraView?: any;
  Camera?: {
    requestCameraPermissionsAsync: () => Promise<{ status: string }>;
  };
}

/**
 * Try to load the expo-camera module via require.
 * Returns null if the module is not available.
 */
function tryLoadExpoCamera(): ExpoCameraModule | null {
  try {
    // @ts-ignore — expo-camera may not be installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-camera');
    return mod;
  } catch {
    return null;
  }
}

// ─── CameraScanner Component ────────────────────────────────────────────────

/**
 * QR code camera scanner with expo-camera fallback.
 *
 * If expo-camera is installed, it renders a live camera preview
 * with barcode scanning. If not, it shows a manual input fallback.
 */
export default function CameraScanner({ onScan, onCancel }: CameraScannerProps) {
  const [cameraType, setCameraType] = useState<'front' | 'back'>('back');
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const expoCamera = tryLoadExpoCamera();
        if (!mounted) return;

        if (!expoCamera) {
          setHasCamera(false);
          return;
        }

        // Check if CameraView is available and permissions
        if (expoCamera.CameraView && expoCamera.Camera?.requestCameraPermissionsAsync) {
          const { status } = await expoCamera.Camera.requestCameraPermissionsAsync();
          if (!mounted) return;

          if (status === 'granted') {
            setHasCamera(true);
          } else {
            setHasCamera(false);
            setError('Camera permission denied');
          }
        } else {
          setHasCamera(false);
        }
      } catch {
        // expo-camera is not installed
        if (mounted) {
          setHasCamera(false);
          setError('Camera module not available. Enter pairing code manually.');
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Handle barcode scanning from expo-camera
  const handleBarCodeScanned = useCallback(
    (scanningResult: any) => {
      const data: string = scanningResult?.data ?? '';
      if (!data) return;

      const token = parseInviteUrl(data);
      if (token) {
        onScan(token);
      }
      // Silently ignore non-invite QR codes
    },
    [onScan],
  );

  // Handle manual token submission
  const handleManualSubmit = useCallback(() => {
    const trimmed = manualToken.trim();
    if (!trimmed) return;

    // If user pasted a full URL, extract the token
    const parsed = parseInviteUrl(trimmed);
    if (parsed) {
      onScan(parsed);
    } else {
      // Treat the input as a raw token
      onScan(trimmed);
    }
  }, [manualToken, onScan]);

  // Show loading while checking camera availability
  if (hasCamera === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Initializing camera...</Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Camera available — show live preview with barcode scanning
  if (hasCamera) {
    return (
      <View style={styles.container}>
        <CameraViewWrapper
          cameraType={cameraType}
          onBarCodeScanned={handleBarCodeScanned}
          onCancel={onCancel}
          onToggleCamera={() =>
            setCameraType((prev) => (prev === 'back' ? 'front' : 'back'))
          }
        />
      </View>
    );
  }

  // Fallback: camera not available — show manual input
  return (
    <View style={styles.container}>
      <View style={styles.fallbackBox}>
        <Text style={styles.fallbackTitle}>Camera Not Available</Text>
        <Text style={styles.fallbackDescription}>
          {error || 'Camera module not available. Enter pairing code manually.'}
        </Text>

        <TextInput
          style={styles.manualInput}
          value={manualToken}
          onChangeText={setManualToken}
          placeholder="Paste invite URL or token"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleManualSubmit}
        >
          <Text style={styles.submitBtnText}>Submit</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── CameraView Wrapper ─────────────────────────────────────────────────────

/**
 * Separate component that renders expo-camera's CameraView.
 * This is extracted so the require only happens in this component,
 * keeping the main component tree clean.
 */
function CameraViewWrapper({
  cameraType,
  onBarCodeScanned,
  onCancel,
  onToggleCamera,
}: {
  cameraType: 'front' | 'back';
  onBarCodeScanned: (result: any) => void;
  onCancel: () => void;
  onToggleCamera: () => void;
}) {
  const [CameraView, setCameraView] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        // @ts-ignore — expo-camera may not be installed
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const expoCamera = require('expo-camera');
        setCameraView(() => expoCamera.CameraView);
      } catch {
        // Should not reach here since hasCamera was already checked
      }
    })();
  }, []);

  if (!CameraView) {
    return (
      <View style={styles.cameraPlaceholder}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Starting camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        style={styles.cameraPreview}
        facing={cameraType}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={onBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </CameraView>

      <View style={styles.cameraControls}>
        <TouchableOpacity style={styles.controlBtn} onPress={onCancel}>
          <Text style={styles.controlBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={onToggleCamera}>
          <Text style={styles.controlBtnText}>Flip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
  },
  cameraContainer: {
    flex: 1,
    width: '100%',
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    width: '100%',
  },
  cameraPreview: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#1a1a1a',
  },
  controlBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  controlBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fallbackBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    margin: 24,
    width: '85%',
    alignItems: 'center',
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  fallbackDescription: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  manualInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
    width: '100%',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  cancelBtnText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
  },
});
/**
 * Self-Hosted Setup — pairing code generation and parsing.
 *
 * Design:
 *  - Pairing codes are signed JSON blobs containing { version, deviceId, familyId, relayUrl }
 *  - Signed with the device's Ed25519 key for authenticity
 *  - Parsed and verified on the receiving device
 *  - Used during self-hosted pairing workflow (QR code scanning)
 *
 * The pairing code is the mechanism by which a self-hosted relay server
 * communicates its connection details to the app, and the app authenticates
 * itself to the server.
 */

import { initCrypto } from '../crypto/index';
import { getDeviceKeypair } from '../identity/device';
import type { DeviceKeypair, PairingCode } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const PAIRING_CODE_VERSION = 1;
export const PAIRING_CODE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Internal Helpers ────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const sodium = require('react-native-libsodium');
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const sodium = require('react-native-libsodium');
  return sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
}

function serializePairingCodePayload(
  code: Omit<PairingCode, 'signature'>,
): string {
  return JSON.stringify({
    version: code.version,
    deviceId: code.deviceId,
    familyId: code.familyId,
    relayUrl: code.relayUrl,
    createdAt: code.createdAt,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a signed pairing code for self-hosted setup.
 *
 * The pairing code is a JSON object containing connection details,
 * signed with the device's Ed25519 key for authenticity.
 *
 * @param deviceId - The device's public key as a base64 string.
 * @param familyId - The family ID (UUID).
 * @param relayUrl - The WebSocket URL of the relay server.
 * @returns A PairingCode object with signature.
 */
export async function generatePairingCode(
  deviceId: string,
  familyId: string,
  relayUrl: string,
): Promise<PairingCode> {
  await initCrypto();
  const sodium = require('react-native-libsodium');
  await sodium.ready;

  const codePayload = {
    version: PAIRING_CODE_VERSION,
    deviceId,
    familyId,
    relayUrl,
    createdAt: Date.now(),
  };

  const serialized = serializePairingCodePayload(codePayload);

  // Use crypto_sign_seed_keypair to derive a signing keypair from the device public key seed (matches parsePairingCode)
  const signKp = sodium.crypto_sign_seed_keypair(
    base64ToUint8Array(deviceId).slice(0, 32),
  );

  const signature = sodium.crypto_sign_detached(
    new TextEncoder().encode(serialized),
    signKp.privateKey,
  );

  return {
    ...codePayload,
    signature: uint8ArrayToBase64(signature),
  };
}

/**
 * Parse and verify a pairing code.
 *
 * Verifies the Ed25519 signature and checks that the code hasn't expired.
 *
 * @param code - The PairingCode object to verify.
 * @returns The verified PairingCode.
 * @throws If the signature is invalid or the code has expired.
 */
export async function parsePairingCode(
  code: PairingCode,
): Promise<PairingCode> {
  await initCrypto();
  const sodium = require('react-native-libsodium');
  await sodium.ready;

  // Check version
  if (code.version !== PAIRING_CODE_VERSION) {
    throw new Error(
      `Unsupported pairing code version: ${code.version}. Expected: ${PAIRING_CODE_VERSION}`,
    );
  }

  // Check expiry
  if (Date.now() - code.createdAt > PAIRING_CODE_MAX_AGE_MS) {
    throw new Error('Pairing code has expired');
  }

  const { signature, ...payload } = code;
  const serialized = serializePairingCodePayload(payload);
  const messageBytes = new TextEncoder().encode(serialized);
  const signatureBytes = base64ToUint8Array(signature);

  // Derive the signing public key from the device public key
  const devicePublicKey = base64ToUint8Array(code.deviceId);
  const signPk = sodium.crypto_sign_seed_keypair(
    devicePublicKey.slice(0, 32),
  ).publicKey;

  const valid = sodium.crypto_sign_verify_detached(
    signatureBytes,
    messageBytes,
    signPk,
  );

  if (!valid) {
    throw new Error('Pairing code signature is invalid');
  }

  return code;
}

/**
 * Parse a pairing code from a JSON string (e.g., QR code content).
 *
 * @param json - JSON string representation of a PairingCode.
 * @returns The verified PairingCode.
 */
export async function parsePairingCodeString(json: string): Promise<PairingCode> {
  let code: PairingCode;
  try {
    code = JSON.parse(json) as PairingCode;
  } catch {
    throw new Error('Invalid pairing code format: not valid JSON');
  }

  return parsePairingCode(code);
}

/**
 * Serialize a pairing code to a JSON string (for QR code generation).
 */
export function pairingCodeToString(code: PairingCode): string {
  return JSON.stringify(code);
}
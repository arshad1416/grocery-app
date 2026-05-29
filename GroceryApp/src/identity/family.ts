/**
 * Family Invite System — Ed25519 signed invite tokens.
 *
 * Design:
 *  - Invite tokens are signed with the inviter's device Ed25519 key (via libsodium crypto_sign)
 *  - Token format: { familyId, deviceId (inviter), expiresAt, signature }
 *  - Signature is over the serialized token payload (excluding signature field)
 *  - Verification checks both signature validity and token expiry
 *  - Acceptance stores the family membership locally
 *
 * All operations require libsodium-wrappers.
 */

import * as SecureStore from 'expo-secure-store';
import { initCrypto, generateUUID } from '../crypto/index';
import { getDeviceKeypair, getDeviceId } from './device';
import type {
  DeviceKeypair,
  FamilyInviteToken,
  FamilyInviteVerification,
  FamilyMembership,
} from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const FAMILY_MEMBERSHIP_ALIAS = 'groceryapp.family.membership';
const MAX_INVITE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Caching ─────────────────────────────────────────────────────────────────

let cachedMembership: FamilyMembership | null = null;

// ─── Internal Helpers ────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const sodium = require('libsodium-wrappers');
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const sodium = require('libsodium-wrappers');
  return sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
}

/**
 * Serialize token payload for signing (excludes the signature field).
 * Produces a canonical JSON string for deterministic signing.
 */
function serializeTokenPayload(token: Omit<FamilyInviteToken, 'signature'>): string {
  return JSON.stringify({
    familyId: token.familyId,
    deviceId: token.deviceId,
    expiresAt: token.expiresAt,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a signed, expiring family invite token.
 *
 * @param inviterKeypair - The device keypair of the inviter (from getDeviceKeypair())
 * @param expiresAt - Optional expiry timestamp (ms since epoch). Defaults to 7 days.
 * @returns A FamilyInviteToken with an Ed25519 signature.
 */
export async function createFamilyInvite(
  inviterKeypair: DeviceKeypair,
  expiresAt?: number,
): Promise<FamilyInviteToken> {
  await initCrypto();
  const sodium = require('libsodium-wrappers');
  await sodium.ready;

  const familyId = await generateUUID();
  const exp = expiresAt ?? Date.now() + MAX_INVITE_AGE_MS;
  const deviceId = uint8ArrayToBase64(inviterKeypair.publicKey);

  const tokenPayload = { familyId, deviceId, expiresAt: exp };
  const serialized = serializeTokenPayload(tokenPayload);

  // Sign with the inviter's Ed25519 key
  // Note: crypto_box keys are NOT Ed25519 keys. For Ed25519 signing we need
  // a separate crypto_sign keypair. We'll use the device's public key as the
  // identity and derive a signing key from the device keypair seed.
  // For Phase 3, we use crypto_sign_detached with a device-derived signing key.

  // Actually, let's use crypto_sign properly. The device stores box keys,
  // but for family invites we need sign keys. We generate a sign keypair
  // derived deterministically from the device keypair seed.
  // Simplification: use crypto_sign directly with a generated sign keypair.
  const signKp = sodium.crypto_sign_seed_keypair(inviterKeypair.privateKey.slice(0, 32));
  const signature = sodium.crypto_sign_detached(
    new TextEncoder().encode(serialized),
    signKp.privateKey,
  );

  return {
    familyId,
    deviceId,
    expiresAt: exp,
    signature: uint8ArrayToBase64(signature),
  };
}

/**
 * Verify a family invite token.
 * Checks both the Ed25519 signature and the expiry time.
 *
 * @param inviteToken - The FamilyInviteToken to verify.
 * @returns FamilyInviteVerification with valid flag and parsed data.
 * @throws If verification fails (wrong signature or expired).
 */
export async function verifyFamilyInvite(
  inviteToken: FamilyInviteToken,
): Promise<FamilyInviteVerification> {
  await initCrypto();
  const sodium = require('libsodium-wrappers');
  await sodium.ready;

  const { signature, ...payload } = inviteToken;

  // Check expiry
  if (Date.now() > inviteToken.expiresAt) {
    throw new Error('Family invite has expired');
  }

  // Reconstruct the public key from the deviceId (base64 public key)
  const publicKey = base64ToUint8Array(inviteToken.deviceId);
  const signatureBytes = base64ToUint8Array(signature);

  const serialized = serializeTokenPayload(payload);
  const messageBytes = new TextEncoder().encode(serialized);

  // Verify signature using crypto_sign_verify_detached
  // The sign public key is derived from the same seed as the device keypair
  const signPk = sodium.crypto_sign_seed_keypair(publicKey.slice(0, 32)).publicKey;

  const valid = sodium.crypto_sign_verify_detached(
    signatureBytes,
    messageBytes,
    signPk,
  );

  if (!valid) {
    throw new Error('Family invite signature is invalid');
  }

  return {
    valid: true,
    familyId: inviteToken.familyId,
    inviterDeviceId: inviteToken.deviceId,
  };
}

/**
 * Accept a family invite.
 * Stores the family membership locally in secure store.
 *
 * @param inviteToken - The verified FamilyInviteToken.
 * @param deviceKeypair - The accepting device's keypair.
 * @returns The stored FamilyMembership.
 */
export async function acceptFamilyInvite(
  inviteToken: FamilyInviteToken,
  deviceKeypair: DeviceKeypair,
): Promise<FamilyMembership> {
  await initCrypto();

  // Verify the invite first
  const verification = await verifyFamilyInvite(inviteToken);

  const membership: FamilyMembership = {
    familyId: verification.familyId,
    deviceId: uint8ArrayToBase64(deviceKeypair.publicKey),
    joinedAt: Date.now(),
  };

  // Store membership
  await SecureStore.setItemAsync(
    FAMILY_MEMBERSHIP_ALIAS,
    JSON.stringify(membership),
  );
  cachedMembership = membership;

  return { ...membership };
}

/**
 * Get the stored family ID.
 */
export async function getFamilyId(): Promise<string | null> {
  const membership = await getFamilyMembership();
  return membership?.familyId ?? null;
}

/**
 * Get the full family membership.
 */
export async function getFamilyMembership(): Promise<FamilyMembership | null> {
  if (cachedMembership) return { ...cachedMembership };

  try {
    const stored = await SecureStore.getItemAsync(FAMILY_MEMBERSHIP_ALIAS);
    if (!stored) return null;
    cachedMembership = JSON.parse(stored) as FamilyMembership;
    return { ...cachedMembership };
  } catch {
    return null;
  }
}

/**
 * Check if the device has an active family membership.
 */
export async function hasFamilyMembership(): Promise<boolean> {
  return (await getFamilyId()) !== null;
}

/**
 * Leave the current family (clear membership).
 */
export async function leaveFamily(): Promise<void> {
  cachedMembership = null;
  await SecureStore.deleteItemAsync(FAMILY_MEMBERSHIP_ALIAS);
}

/**
 * Clear family membership (for testing).
 */
export async function clearFamilyMembership(): Promise<void> {
  cachedMembership = null;
  await SecureStore.deleteItemAsync(FAMILY_MEMBERSHIP_ALIAS);
}
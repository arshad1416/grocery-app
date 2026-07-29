/**
 * First-run recovery backup — the phrase is shown, and only an explicit
 * acknowledgement silences the prompt.
 *
 * Three things are pinned here:
 *
 * 1. recoveryPhraseBackedUp defaults to false and exactly ONE source site
 *    writes it to true — RecoveryScreen's explicit "I've Stored It Safely"
 *    handler. Dismissing or backgrounding therefore provably cannot set it,
 *    which is deliberately NOT the contributeConsentShown behaviour (whose
 *    cancel/skip handlers set the flag, permanently suppressing that modal).
 *
 * 2. HomeScreen triggers the first-run prompt: it reads the flag and
 *    navigates to Recovery in 'show' mode while the flag is unset.
 *
 * 3. recoverFromPhrase() stores the seed, the normalized phrase, and the
 *    stored-flag under the family — so on a device that joined (rather than
 *    founded) a family, Settings → View Recovery Phrase works instead of
 *    falling through to generateRecoveryPhrase()'s hasMasterKey() throw.
 *
 * Run: npx jest __tests__/first-run-recovery-backup.test.ts
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import sodium from 'libsodium-wrappers';
import { initCrypto, getMasterKey } from '../src/crypto';
import { initDeviceIdentity, getDeviceKeypair } from '../src/identity/device';
import { ensureFamilyMembership } from '../src/identity/family';
import {
  generateRecoveryPhrase,
  recoverFromPhrase,
  hasRecoveryPhrase,
  getStoredRecoveryPhrase,
  clearRecoveryPhrase,
} from '../src/identity/recovery';
import { DEFAULT_SETTINGS_FOR_TEST, KNOWN_SETTINGS_KEYS } from '../src/config/settings';

const SRC = path.join(__dirname, '..', 'src');

const read = (rel: string): string =>
  fs.readFileSync(path.join(SRC, rel), 'utf8');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ─── 1. The acknowledgement flag ────────────────────────────────────────────

describe('recoveryPhraseBackedUp flag', () => {
  it('defaults to false and is a recognised settings key', () => {
    expect(DEFAULT_SETTINGS_FOR_TEST.recoveryPhraseBackedUp).toBe(false);
    expect(KNOWN_SETTINGS_KEYS).toContain('recoveryPhraseBackedUp');
  });

  it('exactly one source site writes the flag to true — RecoveryScreen', () => {
    const writers = listSourceFiles(SRC).filter((f) =>
      fs.readFileSync(f, 'utf8').includes('recoveryPhraseBackedUp: true'),
    );
    expect(writers).toEqual([path.join(SRC, 'screens', 'RecoveryScreen.tsx')]);

    // And within RecoveryScreen there is a single write, in the explicit
    // confirmation handler — not in any dismiss/back/cancel path.
    const recoveryScreen = read('screens/RecoveryScreen.tsx');
    const writes = recoveryScreen.split('recoveryPhraseBackedUp: true').length - 1;
    expect(writes).toBe(1);
    const confirmedHandler = recoveryScreen.slice(
      recoveryScreen.indexOf('const handleConfirmed'),
      recoveryScreen.indexOf('const handleCopy'),
    );
    expect(confirmedHandler).toContain('recoveryPhraseBackedUp: true');
  });

  it('HomeScreen triggers the first-run prompt while the flag is unset', () => {
    const homeScreen = read('screens/HomeScreen.tsx');
    expect(homeScreen).toContain('recoveryPhraseBackedUp');
    expect(homeScreen).toContain("navigation.navigate('Recovery', { mode: 'show' })");
    // The trigger must not itself write the flag.
    expect(homeScreen).not.toContain('recoveryPhraseBackedUp: true');
  });
});

// ─── 2. recoverFromPhrase stores the phrase for later display ──────────────

describe('recoverFromPhrase stores phrase, seed, and flag under the family', () => {
  beforeAll(async () => {
    await initCrypto();
    await sodium.ready;
    await initDeviceIdentity();
    await ensureFamilyMembership(getDeviceKeypair());
  });

  it('after recovery, hasRecoveryPhrase() is true and the stored phrase is the normalized input', async () => {
    // Found a family: mint the phrase (also sets the master key).
    const phrase = await generateRecoveryPhrase();
    const originalKey = await getMasterKey();
    expect(originalKey).not.toBeNull();

    // Simulate the pre-fix "joined device" state: key present, no stored
    // phrase — the state in which Settings → View Recovery Phrase used to
    // throw for every non-founding device.
    await clearRecoveryPhrase();
    expect(await hasRecoveryPhrase()).toBe(false);
    expect(await getStoredRecoveryPhrase()).toBeNull();

    // Recover with messy formatting; the fix must store the phrase again.
    const recoveredKey = await recoverFromPhrase(`  ${phrase.toUpperCase()}  `);
    expect(Buffer.from(recoveredKey)).toEqual(Buffer.from(originalKey!));

    expect(await hasRecoveryPhrase()).toBe(true);
    expect(await getStoredRecoveryPhrase()).toBe(phrase);
  });
});

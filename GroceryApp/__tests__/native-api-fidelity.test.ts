/**
 * Guards against the failure mode that let three separate device-only bugs ship
 * behind a fully green suite: **a mock that is more capable than the real
 * library.**
 *
 * `__mocks__/react-native-libsodium.js` re-exports `libsodium-wrappers`, which
 * implements the complete libsodium API. The real `react-native-libsodium`
 * exposes a much smaller subset. Any call to a function only the mock has
 * passes every test and throws `TypeError: undefined is not a function` on a
 * real device.
 *
 * That is exactly what happened to `sodium.crypto_hash_sha256(...)` in
 * src/identity/recovery.ts: it broke `generateRecoveryPhrase()`, which broke
 * first-run master-key provisioning, which made every write a silent no-op —
 * so the app persisted nothing while 470 tests passed.
 *
 * This test compares every `sodium.<member>` referenced in src/ against the
 * real package's own type declarations, which were verified to match device
 * runtime behaviour (probed on an Android emulator: every symbol absent from
 * the declarations was also `undefined` at runtime).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

/**
 * `lib.native.ts` is the entry Metro resolves on device (React Native prefers
 * the `.native` variant), so its declarations are the device API surface.
 */
const DECLARATIONS_DIR = path.join(
  PROJECT_ROOT,
  'node_modules/react-native-libsodium/lib/typescript',
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every name the real package exports, including re-export blocks. */
function realExportedNames(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(DECLARATIONS_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(
      /export\s+declare\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      names.add(m[1]);
    }
    // `export { a, b } from './x'` and `export { a, b }`
    for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

/**
 * Blank out comments while preserving line count, so reported line numbers stay
 * accurate. Several files mention absent APIs deliberately, in comments that
 * explain why a literal is hardcoded instead — those must not count as usage.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '));
}

/** Every `sodium.<member>` referenced in src/, with the files referencing it. */
function referencedMembers(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(SRC_DIR)) {
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\bsodium\.([A-Za-z_$][\w$]*)/g)) {
        const where = `${path.relative(PROJECT_ROOT, file)}:${i + 1}`;
        found.set(m[1], [...(found.get(m[1]) ?? []), where]);
      }
    });
  }
  return found;
}

/**
 * Call sites that reference an API the device library does not provide, and are
 * knowingly left in place. Keep this empty whenever possible — an entry here is
 * a real defect, not a waiver.
 */
const KNOWN_UNAVAILABLE: Record<string, string> = {
  // src/identity/family.ts decryptKeyFromDevice() — the sealed-key handoff has
  // no transport on either side and no runtime caller (only AC-20 tests), so
  // this cannot be hit in v1. It IS broken on device and must be fixed before
  // the sealed-key path is wired up: the device public key should come from the
  // stored device keypair (getDeviceKeypair().publicKey) rather than being
  // derived with crypto_scalarmult_base. Tracked in GOAL_PROMPT_NOTES.md.
  crypto_scalarmult_base: 'src/identity/family.ts',
};

describe('react-native-libsodium API fidelity', () => {
  it('has type declarations to compare against', () => {
    expect(fs.existsSync(DECLARATIONS_DIR)).toBe(true);
    expect(realExportedNames().size).toBeGreaterThan(20);
  });

  it('only calls sodium members the device library actually exports', () => {
    const real = realExportedNames();
    const referenced = referencedMembers();

    // Sanity check that the scanner finds real usage at all.
    expect(referenced.size).toBeGreaterThan(5);

    const missing: string[] = [];
    for (const [member, sites] of referenced) {
      if (real.has(member)) continue;
      if (member in KNOWN_UNAVAILABLE) continue;
      missing.push(`sodium.${member} — used at ${sites.join(', ')}`);
    }

    expect(missing).toEqual([]);
  });

  it('keeps the waiver list honest — every entry is still referenced', () => {
    // Stops the waiver list from silently outliving the code it excuses.
    const referenced = referencedMembers();
    for (const member of Object.keys(KNOWN_UNAVAILABLE)) {
      expect(referenced.has(member)).toBe(true);
    }
  });
});

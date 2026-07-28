/**
 * Regression guard: the app must never carry a database credential.
 *
 * A read-write Turso JWT shipped inside this app twice — first as a hardcoded
 * literal in App.tsx, then as `settings.<token field> ||
 * process.env.EXPO_PUBLIC_TURSO_TOKEN`. Both forms are extractable from a
 * built APK with `unzip` and `strings`, because Expo inlines every
 * `EXPO_PUBLIC_*` value into the JS bundle at build time.
 *
 * These tests read the actual source tree rather than importing modules, so
 * they fail if anyone reintroduces the shape anywhere under GroceryApp/src or
 * in App.tsx — including in a file that has no test of its own.
 *
 * The identifiers being searched for are assembled at runtime so this file
 * does not itself contain the literals it forbids.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');

/** The forbidden identifiers, built so they do not appear literally here. */
const TOKEN_FIELD = 'turso' + 'Token';
const URL_FIELD = 'turso' + 'Url';
const ENV_PREFIX = 'EXPO_PUBLIC_' + 'TURSO';

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|md)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function filesContaining(needle: string): string[] {
  const files = [path.join(APP_ROOT, 'App.tsx'), ...collectSourceFiles(SRC_DIR)];
  return files
    .filter((f) => fs.readFileSync(f, 'utf8').includes(needle))
    .map((f) => path.relative(APP_ROOT, f));
}

describe('no client-side database credential', () => {
  it('has no persisted database-token field anywhere in the app source', () => {
    expect(filesContaining(TOKEN_FIELD)).toEqual([]);
  });

  it('has no persisted database-URL field anywhere in the app source', () => {
    expect(filesContaining(URL_FIELD)).toEqual([]);
  });

  it('reads no build-time EXPO_PUBLIC database variable', () => {
    // EXPO_PUBLIC_* values are inlined into the shipped bundle by Expo, so a
    // credential read this way is a credential published to every user.
    expect(filesContaining(ENV_PREFIX)).toEqual([]);
  });

  it('no longer ships a direct database client module', () => {
    expect(fs.existsSync(path.join(SRC_DIR, 'services', 'turso' + 'Client.ts'))).toBe(false);
  });

  it('sends no Authorization header built from app settings', () => {
    // The catalog client authenticates with the relay enrollment token from
    // SecureStore (getRelayToken), never with a value out of AppSettings.
    const catalog = fs.readFileSync(
      path.join(SRC_DIR, 'services', 'catalogClient.ts'),
      'utf8',
    );
    expect(catalog).toContain('getRelayToken');
    expect(catalog).not.toMatch(/Authorization[^\n]*settings\./);
  });

  it('issues no direct database pipeline requests from the app', () => {
    // /v2/pipeline is the Turso HTTP API. The app must reach the catalog only
    // through the relay's /api/catalog/* endpoints.
    expect(filesContaining('/v2/pipeline')).toEqual([]);
  });

  it('tells no user to supply a database, because there is nowhere to supply one', () => {
    // Removing the URL/token fields from Settings was the credential fix. Two
    // empty-states went on saying "Please connect a Turso database in
    // settings" long after those fields were gone, which instructed users to
    // do something the app no longer permits — and named a third-party vendor
    // to end users. Copy that survives the UI it refers to is its own defect
    // class, so it gets a guard rather than a one-time correction.
    const files = [path.join(APP_ROOT, 'App.tsx'), ...collectSourceFiles(SRC_DIR)]
      .filter((f) => !f.endsWith('.md'));

    const offenders = files.filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      // Only user-facing string literals matter; comments explaining the
      // history are fine and deliberately present.
      return /(['"`])[^'"`\n]*connect a (turso|database)[^'"`\n]*\1/i.test(text);
    });

    expect(offenders.map((f) => path.relative(APP_ROOT, f))).toEqual([]);
  });
});

/**
 * Persisted-settings pruning.
 *
 * `pruneUnknownSettings` is what actually removes the database URL and
 * read-write token from devices that ran an earlier build. Deleting the
 * fields from the AppSettings interface changes nothing on disk — the values
 * sit in the encrypted SecureStore blob until something removes them.
 *
 * The second test guards the mechanism itself: KNOWN_SETTINGS_KEYS must stay
 * in sync with the AppSettings interface, or a future field would be silently
 * pruned off every user's device on their next launch.
 */

import * as fs from 'fs';
import * as path from 'path';

import { pruneUnknownSettings, KNOWN_SETTINGS_KEYS } from '../src/config/settings';

const LEGACY_TOKEN_FIELD = 'turso' + 'Token';
const LEGACY_URL_FIELD = 'turso' + 'Url';

describe('pruneUnknownSettings', () => {
  it('removes a legacy database token persisted by an earlier build', () => {
    const stored = {
      hostingTier: 'self_hosted',
      relayUrl: 'wss://relay.example.com',
      tursoEnabled: true,
      [LEGACY_URL_FIELD]: 'https://example-db.turso.io',
      [LEGACY_TOKEN_FIELD]: 'eyJhbGciOiJFZERTQSJ9.PLACEHOLDER.PLACEHOLDER',
    };

    const { settings, removed } = pruneUnknownSettings(stored);

    expect(settings).not.toHaveProperty(LEGACY_TOKEN_FIELD);
    expect(settings).not.toHaveProperty(LEGACY_URL_FIELD);
    expect(removed.sort()).toEqual([LEGACY_TOKEN_FIELD, LEGACY_URL_FIELD].sort());

    // Nothing that resembles the token survives anywhere in the result.
    expect(JSON.stringify(settings)).not.toContain('eyJhbGciOi');
  });

  it('keeps every recognised setting untouched', () => {
    const stored = {
      hostingTier: 'self_hosted',
      relayUrl: 'wss://relay.example.com',
      relayPort: 8080,
      tursoEnabled: false,
      flippFsa: 'L0R',
      theme: 'dark',
      sentryEnabled: false,
    };

    const { settings, removed } = pruneUnknownSettings(stored);

    expect(removed).toEqual([]);
    expect(settings).toEqual(stored);
  });

  it('reports nothing removed for an already-clean object, so no rewrite happens', () => {
    // initSettings() re-persists only when removed.length > 0. A false
    // positive here would mean an encrypt + SecureStore write on every launch.
    const { removed } = pruneUnknownSettings({ hostingTier: 'self_hosted', relayPort: 8080 });
    expect(removed).toEqual([]);
  });

  it('KNOWN_SETTINGS_KEYS matches the AppSettings interface exactly', () => {
    // Parsed from the source rather than the type, because types are erased at
    // runtime. Drift in either direction is a bug: a missing key silently
    // deletes user data, an extra key defeats the pruning.
    const typesSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/types/index.ts'),
      'utf8',
    );

    const start = typesSrc.indexOf('export interface AppSettings {');
    expect(start).toBeGreaterThan(-1);
    const end = typesSrc.indexOf('\n}', start);
    const body = typesSrc.slice(start, end);

    const declared = body
      .split('\n')
      .map((line) => line.match(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\??:/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1])
      .sort();

    expect(declared.length).toBeGreaterThan(10);
    expect([...KNOWN_SETTINGS_KEYS].sort()).toEqual(declared);
  });
});

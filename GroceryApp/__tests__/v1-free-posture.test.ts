/**
 * v1 Free Posture — No Paid Surface Is Reachable
 *
 * v1 ships fully free with no In-App Purchase (Apple 3.1.1: digital features
 * that cannot be bought through IAP are a rejection magnet). This suite reads
 * the REAL source files (unlike ac15-no-analytics.test.ts, which checks mock
 * fixtures) and asserts:
 *
 *  - TRIP_OPTIMIZER_ENABLED is declared false in GroceryListScreen.tsx and
 *    every <StopOptimizer JSX site in that file sits inside a
 *    {TRIP_OPTIMIZER_ENABLED && ( ... )} guard.
 *  - <TripPlanSheet renders only inside StopOptimizer.tsx, so it is
 *    transitively unreachable once StopOptimizer is gated.
 *  - MANAGED_TIER_ENABLED and VOICE_ASSISTANT_LINKING_ENABLED are still false
 *    in SettingsScreen.tsx, and the "Managed Subscription" block is guarded by
 *    {!isSelfHosted && ( with isSelfHosted derived as
 *    !MANAGED_TIER_ENABLED || ... (unconditionally true while the flag is
 *    false, so the block cannot render).
 *
 * The guard matcher is first proven to discriminate against two inline
 * fixtures (one guarded, one unguarded) before being applied to the real
 * files, so a green run cannot come from a matcher that accepts everything.
 *
 * Run: npx jest __tests__/v1-free-posture.test.ts
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');

const read = (rel: string): string =>
  fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Returns true if every occurrence of `<${component}` in `source` is
 * preceded — within `window` characters — by `${flag} && (`, i.e. the render
 * site sits inside a direct flag guard. Returns true vacuously if the
 * component never appears (callers assert occurrence counts separately).
 */
function everyRenderSiteIsGuarded(
  source: string,
  component: string,
  flag: string,
  window = 300,
): boolean {
  const needle = `<${component}`;
  let idx = source.indexOf(needle);
  if (idx === -1) return true;
  while (idx !== -1) {
    const preceding = source.slice(Math.max(0, idx - window), idx);
    if (!preceding.includes(`${flag} && (`)) return false;
    idx = source.indexOf(needle, idx + needle.length);
  }
  return true;
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

/** Recursively list all .ts/.tsx files under a directory. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ─── Matcher self-test: prove it discriminates before trusting it ──────────

describe('guard matcher discriminates', () => {
  const GUARDED_FIXTURE = `
    {TRIP_OPTIMIZER_ENABLED && (
      <StopOptimizer items={items} />
    )}
  `;

  const UNGUARDED_FIXTURE = `
    <StopOptimizer items={items} />
  `;

  it('accepts a correctly-guarded render site', () => {
    expect(
      everyRenderSiteIsGuarded(
        GUARDED_FIXTURE,
        'StopOptimizer',
        'TRIP_OPTIMIZER_ENABLED',
      ),
    ).toBe(true);
  });

  it('rejects an unguarded render site', () => {
    expect(
      everyRenderSiteIsGuarded(
        UNGUARDED_FIXTURE,
        'StopOptimizer',
        'TRIP_OPTIMIZER_ENABLED',
      ),
    ).toBe(false);
  });
});

// ─── Trip Optimizer is gated off ────────────────────────────────────────────

describe('Trip Optimizer is gated off in v1', () => {
  const groceryListScreen = read('screens/GroceryListScreen.tsx');

  it('declares a module-level TRIP_OPTIMIZER_ENABLED = false', () => {
    expect(groceryListScreen).toMatch(
      /^const TRIP_OPTIMIZER_ENABLED = false;$/m,
    );
  });

  it('renders <StopOptimizer exactly once, inside the flag guard', () => {
    expect(countOccurrences(groceryListScreen, '<StopOptimizer')).toBe(1);
    expect(
      everyRenderSiteIsGuarded(
        groceryListScreen,
        'StopOptimizer',
        'TRIP_OPTIMIZER_ENABLED',
      ),
    ).toBe(true);
  });

  it('renders <TripPlanSheet only inside StopOptimizer.tsx (transitively gated)', () => {
    const filesRendering = listSourceFiles(SRC).filter((f) =>
      fs.readFileSync(f, 'utf8').includes('<TripPlanSheet'),
    );
    expect(filesRendering).toEqual([
      path.join(SRC, 'components', 'StopOptimizer.tsx'),
    ]);
  });
});

// ─── Managed tier and voice-assistant linking stay off ─────────────────────

describe('Managed tier and voice-assistant linking stay off in v1', () => {
  const settingsScreen = read('screens/SettingsScreen.tsx');

  it('MANAGED_TIER_ENABLED is false', () => {
    expect(settingsScreen).toMatch(/^const MANAGED_TIER_ENABLED = false;$/m);
  });

  it('VOICE_ASSISTANT_LINKING_ENABLED is false', () => {
    expect(settingsScreen).toMatch(
      /^const VOICE_ASSISTANT_LINKING_ENABLED = false;$/m,
    );
  });

  it('isSelfHosted is unconditionally true while the flag is false, so the Managed Subscription block cannot render', () => {
    // isSelfHosted = !MANAGED_TIER_ENABLED || ... — with the flag false the
    // left operand is true, so isSelfHosted is true regardless of settings.
    expect(settingsScreen).toMatch(
      /const isSelfHosted = !MANAGED_TIER_ENABLED \|\|/,
    );
    // The Managed Subscription section is guarded by {!isSelfHosted && ( —
    // always false while the flag is false.
    const managedIdx = settingsScreen.indexOf('Managed Subscription</Text>');
    expect(managedIdx).toBeGreaterThan(-1);
    const preceding = settingsScreen.slice(
      Math.max(0, managedIdx - 400),
      managedIdx,
    );
    expect(preceding).toContain('{!isSelfHosted && (');
  });
});

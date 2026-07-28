/**
 * Guards the Babel configuration that WatermelonDB's models depend on.
 *
 * The unit suite cannot catch this on its own: `__mocks__/watermelondb.ts` stubs
 * `@field` and friends as no-op functions, so no test exercises the real
 * decorator transform. On device the real decorators run, and if a
 * class-properties transform does not run *after* the decorators transform,
 * Babel leaves `_initializerWarningHelper` in the decorated property's
 * initializer slot. That helper's only behaviour is to throw:
 *
 *   Decorating class property failed. Please ensure that
 *   transform-class-properties is enabled and runs after the decorators
 *   transform.
 *
 * It threw the first time a model was constructed, so every
 * `collection.create()` / `Model.update()` failed and the app wrote nothing to
 * SQLite — while the whole suite stayed green.
 *
 * This asserts the configuration invariants directly rather than compiling and
 * inspecting output: reproducing Metro's exact transform pipeline
 * (hermes-parser, Expo's transformer options, dev vs production) inside Jest is
 * fragile, and a compile-based check silently passed against the broken config.
 * The regression that actually happened was someone *removing* the
 * class-properties transform — with a comment claiming the preset already
 * provided it — which is precisely what these assertions prevent.
 */

import { describe, it, expect } from '@jest/globals';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

type PluginEntry = string | [string, ...unknown[]];

function loadConfig(): {
  presets: unknown[];
  plugins: PluginEntry[];
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const configFn = require(path.join(PROJECT_ROOT, 'babel.config.js'));
  const api = { cache: () => undefined, env: () => 'test' };
  const config = configFn(api);
  return { presets: config.presets ?? [], plugins: config.plugins ?? [] };
}

function nameOf(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry) && typeof entry[0] === 'string') return entry[0];
  return '';
}

function optionsOf(entry: unknown): Record<string, unknown> {
  return Array.isArray(entry) && typeof entry[1] === 'object' && entry[1] !== null
    ? (entry[1] as Record<string, unknown>)
    : {};
}

/** Flatten plugin entries out of the top-level plugins and any inline presets. */
function collectPluginEntries(): { name: string; options: Record<string, unknown> }[] {
  const { presets, plugins } = loadConfig();
  const entries = [...plugins];
  for (const preset of presets) {
    if (preset && typeof preset === 'object' && !Array.isArray(preset)) {
      const inline = (preset as { plugins?: PluginEntry[] }).plugins ?? [];
      entries.push(...inline);
    }
  }
  return entries.map((e) => ({ name: nameOf(e), options: optionsOf(e) }));
}

describe('babel decorator configuration', () => {
  it('enables legacy decorators for WatermelonDB models', () => {
    const decorators = collectPluginEntries().find((e) =>
      e.name.includes('plugin-proposal-decorators'),
    );
    expect(decorators).toBeDefined();
    expect(decorators!.options.legacy).toBe(true);
  });

  it('enables the class-properties transform the decorators require', () => {
    // Without this, decorated properties keep `_initializerWarningHelper` as
    // their initializer and throw on first model construction.
    const names = collectPluginEntries().map((e) => e.name);
    expect(names.some((n) => n.includes('plugin-transform-class-properties'))).toBe(true);
  });

  it('enables the companion class-feature transforms', () => {
    // Turning on class-properties activates Babel's class-features machinery,
    // and dependencies using class private methods (react-native's Animated
    // internals) then fail to compile without these.
    const names = collectPluginEntries().map((e) => e.name);
    expect(names.some((n) => n.includes('plugin-transform-private-methods'))).toBe(true);
    expect(
      names.some((n) => n.includes('plugin-transform-private-property-in-object')),
    ).toBe(true);
  });

  it('runs class-properties AFTER the decorators transform', () => {
    const { presets, plugins } = loadConfig();

    const decoratorsInPlugins = plugins.some((p) =>
      nameOf(p).includes('plugin-proposal-decorators'),
    );
    expect(decoratorsInPlugins).toBe(true);

    // Babel runs every plugin before any preset, so class-properties must NOT
    // sit in top-level `plugins` — there it would also precede the preset's
    // TypeScript transform and break dependencies that use TS `declare` class
    // fields (expo-file-system).
    const classPropsInPlugins = plugins.some((p) =>
      nameOf(p).includes('plugin-transform-class-properties'),
    );
    expect(classPropsInPlugins).toBe(false);

    // It lives in an inline preset instead. Presets run in reverse order, so to
    // run after babel-preset-expo it must be listed BEFORE it.
    const inlineIndex = presets.findIndex(
      (p) =>
        p &&
        typeof p === 'object' &&
        !Array.isArray(p) &&
        ((p as { plugins?: PluginEntry[] }).plugins ?? []).some((q) =>
          nameOf(q).includes('plugin-transform-class-properties'),
        ),
    );
    const expoIndex = presets.findIndex((p) => nameOf(p).includes('babel-preset-expo'));

    expect(inlineIndex).toBeGreaterThanOrEqual(0);
    expect(expoIndex).toBeGreaterThanOrEqual(0);
    expect(inlineIndex).toBeLessThan(expoIndex);
  });

  it('keeps loose mode consistent across the class-feature transforms', () => {
    // Mixed loose settings make Babel emit conflicting-assumption warnings and
    // can change field semantics between the three transforms.
    const relevant = collectPluginEntries().filter(
      (e) =>
        e.name.includes('plugin-transform-class-properties') ||
        e.name.includes('plugin-transform-private-methods') ||
        e.name.includes('plugin-transform-private-property-in-object'),
    );
    expect(relevant.length).toBe(3);
    for (const entry of relevant) {
      expect(entry.options.loose).toBe(true);
    }
  });
});

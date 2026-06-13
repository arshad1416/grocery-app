// ─── Global Error Handler + Polyfills ────────────────────────────────────────
// This module has ZERO imports so it evaluates immediately when imported.
// It must be the FIRST import in index.ts to catch errors during evaluation
// of other modules (e.g. react-native-libsodium JSI install crashing).
//
// ErrorUtils is a global provided by React Native before any JS runs.
// Using globalThis avoids any import that would be hoisted past this code.

// ─── Global polyfills for isomorphic-webcrypto compatibility ─────────────────
// lib0/random → lib0/webcrypto → isomorphic-webcrypto/src/react-native
// accesses global.window.navigator. In Hermes (RN's JS engine), global.window
// is undefined, which throws a TypeError during module evaluation and crashes
// the app before React loads. Pre-populating these prevents the crash.
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {};
}
if (typeof (globalThis as any).window.navigator === 'undefined') {
  (globalThis as any).window.navigator = {};
}

const _globalErrorHandler = (error: any, isFatal?: boolean) => {
  const msg = error?.message ?? String(error);
  console.error(`[GlobalError] fatal=${isFatal}:`, error);
};

if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  (globalThis as any).ErrorUtils.setGlobalHandler(_globalErrorHandler);
}

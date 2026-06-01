/**
 * Hermes WebAssembly polyfill.
 *
 * Some Hermes builds (Expo SDK 56 on Android) lack the global `WebAssembly`
 * object entirely. Any code that references `WebAssembly` directly (not via
 * `typeof`) throws a ReferenceError at load time.
 *
 * libsodium-wrappers-sumo is pure JS and doesn't need WASM, but some
 * transitive dependency or polyfill references the global. This stub makes
 * `typeof WebAssembly` return "object" and prevents RuntimeErrors.
 */

(function () {
  var g =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    (typeof self !== 'undefined' && self) ||
    {};

  if (typeof g.WebAssembly === 'undefined') {
    g.WebAssembly = {};
  }
})();

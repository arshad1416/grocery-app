/**
 * Hermes WebAssembly polyfill.
 *
 * Some Hermes builds lack the global `WebAssembly` entirely. libsodium-sumo's
 * ESM build (used by Metro's package exports resolution) tries to construct
 * `new WebAssembly.Module(buffer)` during initialization. This stub provides
 * the expected API surface so the constructor call doesn't crash — it throws
 * a controlled error instead, which libsodium's Emscripten wrapper catches
 * and falls back to the pure JS implementation.
 */

(function () {
  var g =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    (typeof self !== 'undefined' && self) ||
    {};

  if (typeof g.WebAssembly === 'undefined') {
    var WasmError = function (msg) { this.message = msg || 'WebAssembly not supported on this Hermes build'; };
    WasmError.prototype = Object.create(Error.prototype);

    g.WebAssembly = {
      Module: function () { throw new WasmError('WebAssembly.Module not available'); },
      Instance: function () { throw new WasmError('WebAssembly.Instance not available'); },
      compile: function () { return Promise.reject(new WasmError('WebAssembly.compile not available')); },
      instantiate: function () { return Promise.reject(new WasmError('WebAssembly.instantiate not available')); },
      instantiateStreaming: function () { return Promise.reject(new WasmError('WebAssembly.instantiateStreaming not available')); },
      compileStreaming: function () { return Promise.reject(new WasmError('WebAssembly.compileStreaming not available')); },
      RuntimeError: WasmError,
      CompileError: WasmError,
      LinkError: WasmError,
    };
  }
})();

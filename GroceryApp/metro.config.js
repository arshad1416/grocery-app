// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  ...defaultConfig,
  serializer: {
    ...defaultConfig.serializer,
    customSerializer: (entryPoint, preModules, graph, options) => {
      // Inject WebAssembly polyfill at the VERY TOP of the bundle,
      // before any module code runs. Hermes lacks the WebAssembly global,
      // and some dependencies reference it directly (not via typeof).
      const wasmPolyfill =
        'var __WEBASSEMBLY_POLYFILL = ' +
        '(typeof globalThis !== "undefined" ? globalThis : ' +
        'typeof global !== "undefined" ? global : self);' +
        'if (typeof __WEBASSEMBLY_POLYFILL.WebAssembly === "undefined") {' +
        '  __WEBASSEMBLY_POLYFILL.WebAssembly = {};' +
        '}' +
        '\n';

      // Use default serializer if it exists, otherwise fall back
      const defaultSerialize = defaultConfig.serializer?.customSerializer;
      if (defaultSerialize) {
        return wasmPolyfill + defaultSerialize(entryPoint, preModules, graph, options);
      }
      // Fallback: just return the default serialization with polyfill prepended
      const fs = require('fs');
      const path = require('path');
      const output = [];
      // We can't easily call the default serializer here, so wrap it gracefully
      return wasmPolyfill + require('metro/src/Serializer').default(
        entryPoint, preModules, graph, options
      );
    },
  },
};

// Intercept all Node.js built-ins and redirect them to our shim
config.resolver = {
  ...config.resolver,
  extraNodeModules: new Proxy(
    {},
    {
      get: (target, name) => {
        if (
          typeof name === 'string' &&
          (name.startsWith('node:') ||
            ['fs', 'path', 'crypto', 'stream', 'os', 'http', 'https', 'zlib'].includes(name))
        ) {
          return __dirname + '/metro-shim.js';
        }
        return target[name];
      },
    }
  ),
};

module.exports = config;

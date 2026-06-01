// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Force libsodium-wrappers and libsodium-sumo to use CJS build (ESM build tries
// WebAssembly.Module which fails on Hermes — CJS build is pure JS fallback)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'libsodium-wrappers' || moduleName === 'libsodium-sumo') {
    const pkgName = moduleName === 'libsodium-wrappers' ? 'libsodium-wrappers' : 'libsodium-sumo';
    const cjsPath = path.join(
      __dirname,
      'node_modules',
      pkgName,
      'dist',
      'modules-sumo',
      pkgName === 'libsodium-wrappers' ? 'libsodium-wrappers.js' : 'libsodium-sumo.js'
    );
    return {
      filePath: cjsPath,
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Intercept all Node.js built-ins and redirect them to our shim
config.resolver.extraNodeModules = new Proxy(
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
);

module.exports = config;

// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Force CJS builds for libsodium packages: Metro resolves via package.json "exports"
// to the ESM (.mjs) build, which tries new WebAssembly.Module() and fails on Hermes.
// The CJS (.js) build is a pure JS wrapper — no WASM dependency.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Redirect libsodium-wrappers and libsodium-sumo to CJS
  if (moduleName === 'libsodium-wrappers' || moduleName === 'libsodium-sumo') {
    const base = moduleName === 'libsodium-wrappers' ? 'libsodium-wrappers' : 'libsodium-sumo';
    const cjsPath = path.join(
      __dirname, 'node_modules', base,
      'dist', 'modules-sumo',
      base === 'libsodium-wrappers' ? 'libsodium-wrappers.js' : 'libsodium-sumo.js'
    );
    return { filePath: cjsPath, type: 'sourceFile' };
  }

  // Catch any remaining .mjs resolutions for libsodium packages and redirect to .js
  if (moduleName.startsWith('libsodium') && moduleName.endsWith('.mjs')) {
    const jsPath = moduleName.replace(/\.mjs$/, '.js');
    return context.resolveRequest(context, jsPath, platform);
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

// Disable package exports to prevent Metro from picking ESM builds
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

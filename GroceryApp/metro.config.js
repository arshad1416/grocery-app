// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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

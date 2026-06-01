/**
 * Entry point — CommonJS so the WebAssembly polyfill runs before any imports.
 * ES module `import` statements are hoisted, making polyfills in index.ts
 * execute too late. This .js file avoids that entirely.
 */

require('./wasm-polyfill');
require('react-native-get-random-values');
const { registerRootComponent } = require('expo');
const App = require('./App').default;

registerRootComponent(App);

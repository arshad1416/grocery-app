/**
 * Post-install script: removes the ESM build of libsodium-sumo so Metro
 * is forced to use the CJS build (which has a pure JS fallback).
 * The ESM build (.mjs) is Emscripten-compiled and REQUIRES WebAssembly.
 */
const fs = require('fs');
const path = require('path');

const esmDir = path.join(__dirname, 'node_modules', 'libsodium-sumo', 'dist', 'modules-sumo-esm');
const esmFile = path.join(esmDir, 'libsodium-sumo.mjs');

if (fs.existsSync(esmFile)) {
  // Rename to .mjs.bak so Metro can't resolve it but we can restore
  fs.renameSync(esmFile, esmFile + '.bak');
  console.log('[postinstall] Disabled libsodium-sumo ESM build (forced CJS fallback)');
} else {
  // Maybe already renamed, or the .bak exists
  console.log('[postinstall] libsodium-sumo ESM build not found (already disabled?)');
}

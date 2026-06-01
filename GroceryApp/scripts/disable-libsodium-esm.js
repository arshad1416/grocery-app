/**
 * Post-install script: disables ESM builds of libsodium packages so Metro
 * is forced to use CJS builds (which have pure JS fallbacks).
 *
 * The ESM builds (.mjs) are Emscripten-compiled and REQUIRE WebAssembly.
 * Hermes on Android lacks WebAssembly, so the CJS fallback is essential.
 *
 * Packages affected:
 *   - libsodium-sumo (dist/modules-sumo-esm/libsodium-sumo.mjs)
 *   - libsodium-wrappers (dist/modules-sumo-esm/libsodium-wrappers.mjs)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'node_modules');

const pairs = [
  {
    pkg: 'libsodium-sumo',
    file: 'libsodium-sumo.mjs',
    dir: ['libsodium-sumo', 'dist', 'modules-sumo-esm'],
  },
  {
    pkg: 'libsodium-wrappers',
    file: 'libsodium-wrappers.mjs',
    dir: ['libsodium-wrappers', 'dist', 'modules-sumo-esm'],
  },
];

for (const { pkg, file, dir } of pairs) {
  const esmFile = path.join(ROOT, ...dir, file);
  const bakFile = esmFile + '.bak';

  if (fs.existsSync(esmFile)) {
    fs.renameSync(esmFile, bakFile);
    console.log(`[postinstall] Disabled ${pkg} ESM build → ${file}.bak`);
  } else if (fs.existsSync(bakFile)) {
    console.log(`[postinstall] ${pkg} ESM build already disabled (${file}.bak exists)`);
  } else {
    console.log(`[postinstall] ${pkg} ESM build not found — skipping`);
  }
}

/**
 * Intentionally empty — WebAssembly handling removed.
 * The JS engine (Hermes or JSC as bundled) doesn't support WASM.
 * libsodium-sumo depends on WASM, which is the root issue.
 * See src/crypto for the pure JS tweetnacl migration path.
 */

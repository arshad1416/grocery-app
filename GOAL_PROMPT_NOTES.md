# GOAL_PROMPT_NOTES — GroceryApp hardening & store-readiness pass

Running log of findings, decisions, and deferrals. One entry per lesson/decision; update in place rather than duplicating.

## Step-1 investigations (ground truth before fixes)

### Google Assistant webhook (RESOLVED — investigated 2026-07-03)
- **Finding:** `google-assistant-webhook/index.js` is **undeployed dead code** — no deployment config, no client code path, no URL referenced anywhere in the app, not exercised by tests. But architecturally it decrypts the family master key **server-side** (`decryptFamilyKey()` at index.js:22-36, used at :400) and reads plaintext list items into memory (:172-177, :295-317).
- `GroceryApp/alexa-skill/index.js` has the **same server-side decryption flaw** (also undeployed). Siri path (`src/voice/siri.ts`) is on-device only and preserves zero-knowledge.
- The relay itself exposes `/api/assistant/list-data` returning `encryptedMasterKey` (relay-server/server.js ~:915) — that endpoint is the enabler and IS part of the deployable relay.
- `ARCHITECTURE-VOICE-ASSISTANTS.md` acknowledges the trade-off; PrivacyScreen.tsx:189 ("relay can't read it") does not.
- **CORRECTION to agent finding (verified directly):** there IS a client path — SettingsScreen's "Voice Assistant Link" section (6-digit pairing code → `POST /api/oauth/pair`) fetches the assistant RSA-4096 public key from the relay, encrypts the family master key with it, and uploads. **The relay generates that RSA keypair itself and holds the private key** (server.js `ensureAssistantKeys`). So the relay operator can decrypt any voice-linked family's master key — a direct zero-knowledge break, worse than the webhook issue.
- **Decision (implemented 2026-07-03):** ship v1 with cloud voice-assistant linking DISABLED by default, feature preserved behind explicit opt-in:
  - Relay: `ASSISTANT_INTEGRATION=true` env required; otherwise all `/api/assistant/*`, `/oauth/*`, `/api/oauth/*` return 404 and no assistant keypair is ever generated. Pinned by new `relay-server/assistant-disabled.test.js` (7 endpoints + health).
  - Client: `VOICE_ASSISTANT_LINKING_ENABLED = false` const hides the Settings section (SettingsScreen.tsx).
  - Siri unaffected (fully on-device). server.test.js voice suite now sets the env flag (it tests the opt-in feature).
  - Rationale: README/privacy labels claim E2EE-relay-can't-read; can't ship a UI flow that hands the relay the master key. Reversible in one flag each side if the owner decides otherwise (would then REQUIRE privacy-label changes + in-app disclosure).

### Token scheme (RESOLVED — investigated 2026-07-03)
- **Finding:** **RFC 9474 Blind RSA (RSABSSA-SHA384-PSS-Randomized) live end-to-end.** Client (`src/pricing/tokens.ts:209,216,248`, `@cloudflare/blindrsa-ts`, hardcoded v2), issuer (`relay-server/server.js:1426` blindSign, private key via env/file), pool (`pool/pool-server.js:273` verify, public-key-only, **fail-closed** without `ISSUER_PUBLIC_KEY`, replay protection via used-tokens-store 24h TTL). No HMAC path, no feature flag, no shared secret between issuer and pool. E2E test exercises real blind RSA (`tokens/__tests__/e2e-contribution.test.js`).
- BLIND-TOKEN-IMPLEMENTATION-PLAN.md describes an already-completed migration — doc is behind the code, not ahead of it.
- `GroceryApp/relay-server/` is a stale near-empty copy; root `relay-server/` is authoritative (docker-compose builds `./relay-server`).
- **Decision:** no code change needed for the scheme itself. Remaining work is deployment isolation (issuer vs pool on separate origins) — see task 4.

### Relay persistence vs ephemeral claim (RESOLVED — investigated 2026-07-03)
- **Finding:** Relay is **NOT ephemeral**. Three disk-persistence paths, all surviving restarts:
  1. `doc-store.js:33-47` writes Yjs state to `relay-docs.json` on every update.
  2. `encrypted-store.js:23-28,42-59` appends encrypted updates to `data/encrypted-updates.json` with **no TTL — grows forever**.
  3. `server.js:300-310` persists enrollments/OAuth tokens to `relay-state.json` (enrollment tokens have 30-day sliding TTL; updates have none).
- Everything persisted is ciphertext (`{ciphertext, iv, tag}`, XChaCha20-Poly1305 client-side) — "relay can't read it" (PrivacyScreen.tsx:189) is TRUE. But docker-compose.yml:35 claims "relay is stateless" — FALSE.
- **Decision:** keep zero-knowledge claim, fix the "stateless/ephemeral" claims, and add a retention TTL + cleanup for encrypted updates (privacy hardening, small change). Documented persistence ≠ broken crypto.

### FamilyMember.role enforcement (RESOLVED — investigated 2026-07-03)
- **Finding:** **Decorative.** `role: 'admin'|'editor'|'viewer'` defined at src/types/index.ts:83; zero checks in UI, relay, or tests. In a shared-key E2EE CRDT app, real enforcement is architecturally impossible without breaking zero-knowledge.
- **Decision:** drop/hide the field for v1 (per goal: "drop the field until it's built") rather than fake enforcement — keep data model minimal, avoid implying access control that doesn't exist.

### 30-min claim auto-release (RESOLVED — investigated 2026-07-03)
- **Finding:** **Partially implemented.** `CLAIM_EXPIRY_MS` at yjs-adapter.ts:314; expiry is checked when another device re-claims (yjs-adapter.ts:336-338) and shown in UI (ItemRow.tsx:56-58, 60s re-render tick in GroceryListScreen.tsx:189-194). But nothing ever *releases* the claim — no sweep calls unclaim on expiry. Type comment at types/index.ts:50 says "Auto-released after 30min" — overstated.
- **Decision:** functional behavior is actually correct-by-design for a CRDT (expired claims are claimable by others and greyed in UI); add a lightweight expiry sweep on the existing 60s tick to actually clear stale claims, and fix the comment. Small, contained change.

## Baseline (2026-07-03, fresh worktree)
- Worktree had no node_modules; ran npm install for GroceryApp + relay-server.
- **GroceryApp Jest: 35/35 suites PASS (452 passed, 1 skipped).** Green before any changes.
- **relay-server Jest: 2/3 suites pass; token-issuer.test.js 9 failures — single root cause:** tests read `relay-server/keys/issuer-private-key.pem` which doesn't exist in a fresh checkout (keys are generated, not committed). Fix: generate dev key via `tokens/blind-rsa-keygen.js` (and make test setup self-sufficient or document the step).

## Fixes applied (with verification evidence)
- **Relay test baseline fixed:** added `jest.global-setup.js` that runs the idempotent `blind-rsa-keygen.js`; relay suite went 9-failed → all green. CI now runs `npm test` for relay-server (was only `node --check`).
- **Claim auto-release implemented:** `yjsSweepExpiredClaims()` in yjs-adapter.ts, called from GroceryListScreen's existing 60s tick; misleading "auto-released" type comment corrected; new test in claim-item.test.ts (9/9 pass).
- **Role field dropped for v1:** removed from FamilyMember type, model mapping, hydrate; DB column kept (commented legacy) to avoid a schema migration.
- **Relay retention:** `addUpdate` stamps `storedAt`; hourly cleanup ages out encrypted updates after `UPDATE_TTL_MS` (default 30d); docker-compose "stateless" comment corrected; threat-model.md documents persistence + flyer-channel caveat.
- **Pre-existing tsc errors fixed** (siri.ts, 3 errors from the voice-assistants commit) — CI's `tsc --noEmit` would have failed.

## Additional ground truth (verified directly, resolving agent disagreement)
- **Extract endpoint IS mounted** in relay-server/server.js:712 (`POST /api/extract/flyer` → extract/extract-server.js). One earlier agent report claiming it wasn't mounted was wrong.
- **Pool separation-by-port already exists in code**: server.js:991-1535 — if `POOL_PORT !== RELAY_PORT`, a separate HTTP server serves `/api/pool/*`. What's missing is deployment config (docker-compose has one service, no POOL_PORT) and true separate-origin deployment.
- **RelayExtractor (src/pricing/relay-extractor.ts) is real, not a mock** — posts base64 image to relay `/api/extract/flyer` with Bearer relayToken, 30s timeout, never throws. File carries an explicit privacy notice: flyer images are NOT zero-knowledge (relay sees plaintext image over TLS). Remaining question: is any UI/runtime path actually calling `processFlyerImage(image, relayExtractor)`? (checking flyer-scan.ts / registry / screens next).

## Crypto survey highlights (full detail in review task)
- XChaCha20-Poly1305 AEAD w/ per-field AAD context strings; fresh 24B random nonce per encryption; Argon2id13 MODERATE (ops=3, mem=256MB) for passphrase KDF; recovery = 16B seed → generichash (BIP39 12 words); crypto_box_seal for family-key handoff; Ed25519 (derived from device Curve25519 seed) signs invites; keys in expo-secure-store only.
- Flags to judge in review: passkeys.ts stub falls back to Math.random (stub feature — candidate to remove from v1); Math.random for reconnect jitter (benign); no envelope versioning; no key rotation / forward secrecy (documented known gap); AAD context strings are untyped.

## Store compliance survey highlights (task 7)
- Blockers found: (1) android versionCode 29 / versionName 1.29.0 vs app.json 1.30.0 mismatch; (2) release build signs with DEBUG keystore (build.gradle:115); (3) `ITSAppUsesNonExemptEncryption` missing from app.json ios.infoPlist; (4) ios/apple-app-site-association has placeholder `TEAMID.com.groceryapp.app` (also wrong bundle id — should be com.shiftlogichq.stophop) — real Team ID must come from the user.
- Rejection risks: missing "Clear Local Prices" UI that PrivacyScreen references; no Leave Family/unpair flow; verify targetSdk ≥ 34 via Expo 56.
- Good: permission strings present, privacy manifest present, adaptive icons present, privacy policy html exists, Sentry opt-out + sendDefaultPii:false, endpoints list documented in STORE_COMPLIANCE.md.

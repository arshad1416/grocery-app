# PantryRun — Launch Punch List

**Branch:** `claude/dreamy-faraday-758d4e` @ `8dde4af0` (v1.30.0) — the launch candidate, 18 commits ahead of `main`
**73 distinct defects** (109 raw findings, deduplicated across auditors; 1 refuted, 29 severity-adjusted)
**8 critical · 18 high · 21 medium · 26 low — 22 flagged as launch blockers**

Companion to [PRE-LAUNCH-AUDIT.md](PRE-LAUNCH-AUDIT.md), which explains the top findings in depth.

---

## P0 — Ship-stoppers (8)

### Persistence: the app saves nothing — ✅ FIXED 2026-07-27 (uncommitted on `claude/dreamy-faraday-758d4e`)
- [x] **C1. No master key on fresh install** — `bootstrapSync()` now calls `provisionFirstRun()`, which founds a solo family and mints the key via the recovery-phrase path. `src/sync/bootstrap.ts`
- [x] **C2. All writes happen outside a WatermelonDB Writer** — `persistItem`/`persistList`/`persistMember` now wrap in `getDatabase().write()`. `src/storage/hydrate.ts`
- [x] **C3. Assigns to read-only `syncStatus`** — the existing `sync_status` column is now mapped as `recordSyncStatus` on all three models, so it no longer collides with WatermelonDB's built-in accessor. Same bug also fixed at `src/voice/siri.ts:149`.
- [x] Test mock made faithful — `__mocks__/watermelondb.ts` now enforces the Writer requirement and exposes `syncStatus` as getter-only. **This was why 465 tests passed against broken code.**
- [x] **Join-flow guard** — first-run keys are tagged `type: 'device'` (`getMasterKeyType`/`setMasterKeyType`), and `PairingScreen` no longer mistakes one for the joined family's key. Without this, auto-provisioning would have silently skipped the "enter the family recovery phrase" step for every invitee.
- [x] Integration test added — `__tests__/fresh-install-persistence.test.ts` (5 tests: key provisioning, key provenance, sync-manager key, create path, update path). Suite now **470 passing**, `tsc` clean.

**Remaining follow-ups from this work:**
- [ ] **Pre-join data is orphaned (design decision needed).** An invitee who used the app before joining has items encrypted under its own device key; recovering the family phrase overwrites that key and those items become undecryptable, with their old family-scoped recovery phrase unreachable. The join dialog now warns about this, but the real options are to migrate/re-encrypt pre-join data or to block local use until the family choice is made.
- [ ] **Recovery phrase is generated but never shown.** First launch now mints a phrase the user has never seen. In an E2EE app losing it means losing the data — prompt them to back it up.
- [ ] **Errors still swallowed** into `.catch(console.warn)` at `src/sync/sync-manager.ts:97` — surface them so the next silent failure isn't invisible.
- [ ] **Perf:** `persistListToDB` opens one Writer per record, so saving a 50-item list is 51 transactions. Batch with `prepareCreate`/`prepareUpdate` in a single `write()` — **but note the test mock permits nested `write()` while real WatermelonDB deadlocks on it**, so that refactor can go green locally and hang in production. Make the mock throw on nesting before attempting it.

### Credentials
- [x] **C4. Live Turso token tracked in two committed build artifacts**, one inside the APK asset path — **UNTRACKED 2026-07-28 (`6b2b8b1a`)**, still in history. Measured: bundle blob `a4c21f2b49a5`, 4,592,038 bytes, 1 JWT-shaped string + 2 `turso.io`; `dist-android/.../index-b22bf3f2b0b9a5a5764d413f75461794.hbc` blob `9a9a72fb05ba`, 1 JWT. `grep` misses the `.hbc`; `strings` finds it. A bundle rebuilt from the current tree yields **0 and 0**. `android/app/src/main/assets/index.android.bundle`, `dist-android/_expo/.../*.hbc`
- [x] **C5. Two non-expiring read-write Turso tokens permanently in git history.** **Client-side paths removed 2026-07-28 (`a9792cdd`)** — Turso now sits behind the relay's `/api/catalog/*` (owner chose Option A). Revocation handed to the owner at the start of that session and is what actually closes this. **Correction to the original wording:** the exposure was not limited to a hardcoded literal — the replacement shape `settings.<token> || process.env.EXPO_PUBLIC_*` is equally extractable, proven by bundling with a synthetic token and finding it verbatim in the minified output. `App.tsx:140` (historical)

### Build & submission
- [x] **C6. `ios.bundleIdentifier` absent from `app.json`** — **RESOLVED 2026-07-28.** Added `"bundleIdentifier": "com.shiftlogichq.pantryrun"`. **The description above was stale on one point:** it said "the only identifier in the repo is a different, wrong value", but `ios/apple-app-site-association` already carried `TEAMID.com.shiftlogichq.<app>` and `app.json` already declared the app group `group.com.shiftlogichq.<app>` — both pointed at the right app. (The "wrong value" was the pre-`2f22346e` AASA placeholder `TEAMID.com.groceryapp.app`; the store-compliance pass fixed it, and this entry was not updated.) All four identifiers now agree on `com.shiftlogichq.pantryrun` after the StopHop→PantryRun rename: `ios.bundleIdentifier`, `android.package`, the app group, and the AASA `appID`. Still owner-only: the real 10-character Apple **Team ID** replacing `TEAMID`.
- [ ] **C7. Checked-in `AndroidManifest.xml` predates `app.json`** — cleartext not enabled, so the `ws://` relay is unreachable in release builds. `android/app/src/main/AndroidManifest.xml:13`

### Relay
- [ ] **C8. Docker image cannot boot** — Dockerfile copies only `server.js`; `MODULE_NOT_FOUND` at `server.js:26`. `docker compose up` has never worked. `relay-server/Dockerfile:20`
- [ ] **C9. Family invites are self-signed** — signature verified against a key inside the invite; anyone can forge one for any `familyId` and enroll. `relay-server/server.js:611`

*(C1–C3 and C4–C5 are grouped pairs, hence 9 checkboxes for 8 defects.)*

---

## P1 — High (18)

### Security
- [ ] Unauthenticated endpoints buffer request bodies with no streaming cap — remote OOM of a 256 MB container. Pattern already correct at `extract/extract-server.js:170`. `relay-server/server.js:555`
- [ ] Invite one-time-use bypassable by re-serializing the invite JSON. `relay-server/server.js:626`
- [ ] `GET /stats` unauthenticated — leaks every active `familyId` + device fingerprint, wildcard CORS. `relay-server/server.js:688` **[blocker]**
- [ ] Blind-RSA tokens re-spendable after 24 h — unlimited double-spend against the price pool. `relay-server/tokens/used-tokens-store.js:18`
- [ ] `POST /api/oauth/pair` unauthenticated — any caller binds an arbitrary `familyId` and gets a write token. *(Unreachable today behind `ASSISTANT_INTEGRATION=false`, but fix before ever enabling.)* `relay-server/server.js:825`
- [ ] `encrypted-store` rewrites its whole JSON file synchronously per update, no size/per-family quota. `relay-server/encrypted-store.js:42`

### Privacy & compliance
- [ ] Privacy policy omits Turso entirely — barcodes, postal FSA, product names go to a third-party cloud DB. `privacy/index.html:148` **[blocker]**
- [ ] `pricingOptedIn` bypassed by the Deals tab — postal FSA sent before consent. `src/screens/GroceryListScreen.tsx:682` **[blocker]**
- [ ] Privacy policy promises relay-side deletion no code implements. `privacy/index.html:237` **[blocker]**

### Store review
- [ ] Siri entitlement + App Group + mic/speech purpose strings with zero backing code. `app.json:31` **[blocker]**
- [ ] No `NSLocalNetworkUsageDescription` while a LAN relay is the primary target. `app.json:37` **[blocker]**

### Correctness
- [ ] Invite deep links still never navigate — `linkingConfig` overrides `getInitialURL`/`subscribe` with no-ops. `src/navigation/deepLinks.ts:64` **[blocker]**
- [ ] Default relay URL `ws://localhost` makes the no-relay guard unreachable; Share emits invites pointing at localhost. `src/config/settings.ts:32` **[blocker]**
- [ ] Undo after deleting a list permanently loses its items and identity. `src/state/useListStore.ts:175` **[blocker]**
- [ ] Notification subsystem fully built but never initialised — no permission request, channel, or foreground handler. `src/notifications/NotificationManager.ts:52`
- [ ] One auth-ack timeout permanently disables sync for the session. `src/sync/y-websocket.ts:179`

### Build
- [ ] `npm ci` fails — `package-lock.json` stale (missing `expo-image-picker`); CI install fails every push. `package-lock.json:1` **[blocker]**
- [ ] Sentry triple-version-mismatched, DSN never inlined — crash reporting dead in production. `src/services/sentry.ts:19` **[blocker]**

---

## P2 — Medium (21)

- [ ] Yjs doc state never persisted — full history replay on rejoin duplicates every item after restart. `src/sync/yjs-adapter.ts:105`
- [ ] Barcode scanning ships ungated and undisclosed; `barcodeScanningEnabled` never read, policy calls it "Planned". `src/services/productLookup.ts:118` **[blocker]**
- [ ] "Hashed item names" is a false claim — 48-bit non-cryptographic FNV-1a. `src/pricing/privacy.ts:21` **[blocker]**
- [x] ~~"Turso Enabled" settings toggle stops no Turso traffic.~~ **FIXED 2026-07-28 (`a9792cdd`)** — relabelled "Product Catalog Lookups"; `isCatalogAvailable()` returns false when it is off, so no catalog request is issued at all. `src/screens/SettingsScreen.tsx`
- [ ] Pool consent enabled without seeing disclosure — cancelling the modal marks it shown. `src/screens/SettingsScreen.tsx:785`
- [ ] Pool contributions default to the same origin as the token issuer, defeating blind-token unlinkability. `src/pricing/contribute.ts:28`
- [ ] `NSPrivacyCollectedDataTypes` empty while App Privacy labels declare three types. `app.json:73`
- [x] ~~No root `.gitignore`; `android/.gitignore` misses the filename that let the credential-bearing bundle get tracked.~~ **FIXED 2026-07-28 (`6b2b8b1a`)** — root `.gitignore` added; `android/.gitignore` gained `index.android.bundle`, the full release-asset path, and `*.hbc`. **Pointer corrected: the file had 19 lines, so `:20` was out of range.** `android/.gitignore:19`
- [ ] `SECURITY.md` advertises crypto the shipping app never executes. `SECURITY.md:33`
- [ ] Release build falls back to the committed debug keystore when no upload keystore is set. `android/app/build.gradle:134`
- [ ] `autoVerify` intent filter mixes custom scheme with https — App Links verification may fail. `android/app/src/main/AndroidManifest.xml:29`
- [ ] `userInterfaceStyle` pinned to `light`, disabling shipped dark/system themes on iOS. `app.json:9`
- [ ] docker-compose declares no volumes — every redeploy invalidates every device's relay token. `docker-compose.yml:1`
- [x] ~~docker-compose provisions no issuer keypair — token issuance and pool both 500 on a default deploy.~~ **FIXED 2026-07-28 (`64c41266`)** — read-only mount of `${KEYS_DIR:-./relay-server/keys}` at `/run/keys` plus `ISSUER_PRIVATE_KEY_PATH` / `ISSUER_PUBLIC_KEY_PATH` and an optional inline-PEM override. **Pointer corrected: the previously cited line was a pool-isolation comment; the finding held, the pointer did not.** `docker-compose.yml`
- [ ] Fabricated test prices seeded into the production pool, shown as crowdsourced. `relay-server/server.js:242`
- [ ] `/enroll` capacity limits check the wrong map — enrollments grow unbounded. `relay-server/server.js:633`
- [ ] No unlink/token-revocation path; access tokens live one year beside the sealed family key. `relay-server/server.js:906`
- [ ] Google Assistant webhook does not verify requests originate from Google. `google-assistant-webhook/index.js:355`
- [ ] No on-device voice capture — the "🎤 Voice Input" button opens a typing prompt. `src/screens/AddItemSheet.tsx:605`
- [ ] `npx expo install --check` fails — 12 packages off SDK 56 expectations. `package.json:1`
- [ ] Two divergent lockfiles tracked, no package manager pinned. `yarn.lock:1`

---

## P3 — Low (26)

- [x] ~~Blind-RSA issuer private key committed to git history, permanently retrievable.~~ **ROTATED 2026-07-28 (`64c41266`)** — public-key fingerprint `372c83c3…` → `fe4fe47c…`. Added in `71d54a57`, deleted in `143b5a70`, blob `194aa746c83a` — still in history until a rewrite runs. Neither PEM is tracked. `relay-server/keys/issuer-private-key.pem`
- [x] ~~~20 MB of build/test junk tracked (prebuilt bundle, crash-screen dumps, `dist-android/`).~~ **UNTRACKED 2026-07-28 (`6b2b8b1a`)** — 46 files (1 bundle + 45 under `dist-android/`). `GroceryApp/dist-android`
- [ ] Personal infrastructure hostnames remain in tracked docs. `docs/ARCHITECTURE-GROCERY-SCRAPER.md:5`
- [ ] Relay token obtained and used over plaintext HTTP/WS by default. `src/config/settings.ts:32`
- [ ] Relay logs full per-family activity traces, contradicting the policy's "only device ID and timestamps". `relay-server/server.js:1338`
- [ ] `deriveDBKey` passes a 7-byte KDF context where `crypto_kdf_CONTEXTBYTES` is 8. `src/crypto/index.ts:388`
- [ ] Passkey module is a non-functional simulation, unreferenced. `src/identity/passkeys.ts:70`
- [ ] `generateReinvite` discards the caller's family and mints a new `familyId`. `src/identity/family.ts:289`
- [ ] Alexa skill and app use incompatible base64 variants — neither can decrypt the other. `alexa-skill/index.js:64`
- [ ] Siri background queue writes a raw `EncryptedData` object into a string column. `src/voice/siri.ts:139`
- [ ] Orphaned voice code — `ifttt.ts` targets a nonexistent endpoint; `VoiceService` imported by nothing. `src/voice/ifttt.ts:94`
- [ ] `test-assistant.js` stale; cannot pass and writes to the production state file. `relay-server/test-assistant.js:19`
- [ ] `doc-store.js` is dead code; docker-compose documents state it doesn't produce. `relay-server/doc-store.js:1`
- [ ] `src/error-handler.ts` declares itself the required first import but nothing imports it. `src/error-handler.ts:1`
- [ ] Pool aggregates published with no minimum contributor count. `relay-server/pool/store.js:68`
- [ ] Account-linking page loads a stylesheet from `fonts.googleapis.com`. `relay-server/server.js:1595`
- [ ] Data-safety deletion answer overstates actual deletion paths. `docs/STORE_COMPLIANCE.md:106`
- [ ] Compliance checklist cites a target SDK below Play's 2026 floor; no target SDK pinned in-repo. `docs/STORE_COMPLIANCE.md:357`
- [ ] Policy/Terms describe a hidden "managed relay" tier with a deletion path to a server holding nothing. `privacy/index.html:134`
- [ ] High-severity `sjcl` advisory (CVSS 7.5) in both app and relay via `@cloudflare/blindrsa-ts`. `package.json:5`
- [ ] `lib0` patch silently downgrades `getRandomValues` to `Math.random()` with no throw or log. `patches/lib0+0.2.117.patch:18`
- [ ] React Native public-API patch is fragile against any RN patch release. `patches/react-native+0.85.3.patch:1`
- [ ] No iOS splash configuration; two unreferenced duplicate icon assets. `app.json:8`
- [ ] Splash screen goes blank for the rest of its timer when init finishes quickly. `src/screens/SplashScreen.tsx:14`
- [ ] Barcode/deals items all get `sortOrder` 0, unlike every other add path. `src/screens/HomeScreen.tsx:393`
- [ ] First item in a new list stored with an empty `familyId` that disagrees with the list's. `src/screens/AddItemSheet.tsx:194`
- [ ] **`npm ci` fails in `GroceryApp/`** *(found 2026-07-28)* — the committed `package-lock.json` does not satisfy `package.json` (`lightningcss-*` 1.32.0 vs 1.33.0, `nanoid` 3.3.12 vs 3.3.16). CI and EAS both run `npm ci`, so this blocks a clean build for anyone but the machine that has a warm `node_modules`. `GroceryApp/package-lock.json`
- [ ] **`expo-file-system` and `babel-preset-expo` are used but not declared** *(found 2026-07-28)* — `flyer-pipeline.ts` imports the first and `babel.config.js` names the second, yet neither is in `package.json`; they resolve only by transitive hoisting. When npm nests them instead, `npx tsc --noEmit` and the bundler both break. `GroceryApp/src/pricing/flyer-pipeline.ts:213`

---

## Credential rotation list (permanent in git history)

1. **Turso token A** — `iat 1781501145`, read-write, no expiry — **OWNER: revoke. Handed off 2026-07-28; confirmation outstanding.**
2. **Turso token B** — `iat 1781551606`, read-write, no expiry, same DB — **OWNER: revoke.** Both die at once with `turso db tokens invalidate <database>`.
3. **Blind-RSA issuer private key** — blob `194aa746c83a`, added `71d54a57`, deleted `143b5a70` — **ROTATED 2026-07-28**, fingerprint `372c83c3…` → `fe4fe47c…`. Owner must deploy the new pair to the relay **and the pool together**: rotating invalidates every outstanding blind token, and a split cutover fails closed.
4. **Android upload keystore** — generate fresh; treat the tracked `debug.keystore` as public. Owner-only; `debug.keystore` deliberately stays tracked.
5. ~~**Sentry DSN**~~ — **RETRACTED 2026-07-28, this was a false positive of mine.** Blob `3adf83af` holds `https://examplePublicKey@o0.ingest.sentry.io/0`, Sentry's documented placeholder. My detection regex matched the `sentry.io` hostname, not a key; a real-key pattern matches 0 times. **Nothing to rotate.** `GroceryApp/.env` and `.env.example` are the same blob, and the placeholder belongs in the tracked template.

**Rotation alone is insufficient for the Turso tokens, and always was.** They were a client-side fallback, so any replacement shipped the same way is extractable from the APK — demonstrated by bundling with a synthetic token and finding it verbatim in the minified output. That is now fixed: the credential lives only in the relay's environment (`a9792cdd`), so a fresh token finally means something.

**The rewrite is hygiene; revocation is the fix.** A history rewrite has been prepared and fully verified in a scratch mirror (all four scoped paths gone, 87.74 MiB → 12.05 MiB, 9 branches / 22 tags intact) but **nothing has been pushed** and the owner has not yet scoped it in. Even when it runs it does not un-publish anything: old commits stay reachable by SHA through GitHub's UI and API until GitHub Support garbage-collects them, forks keep their own copies forever, and two other repositories carry the identical exposure regardless.

---

## Also outstanding (owner-only, tracked separately)

Apple Team ID + AASA credential · Play upload keystore · privacy-policy hosting · store console data-safety forms

## Branch action

`main` is **not** the launch candidate. Merge `claude/dreamy-faraday-758d4e` before building anything for submission.

# PantryRun — Pre-Launch Audit

**Date:** 2026-07-27
**Audited:** branch `claude/dreamy-faraday-758d4e` @ `8dde4af0` (v1.30.0) — the launch candidate, **18 commits ahead of `main`**
**Method:** 9 parallel dimension auditors + adversarial verification; every critical finding below was then re-verified by hand against source.

> **Read this first:** I audited `claude/dreamy-faraday-758d4e` because it carries 18 unmerged commits of launch prep (sync bootstrap, join flow, key custody, store compliance, legal docs, store listings). **`main` is not the launch candidate.** If you build from `main`, everything here applies *plus* a hardcoded live database token and a completely unwired sync stack. Merge before you ship.

---

## Verdict: **Not ready.** One defect makes the app unusable.

**Nothing a user types is ever saved. Every grocery list is destroyed when the app closes.**

That is not a regression from the old code — it is the *same* bug, and the commit that claimed to fix it (`c238a57f`, "wire the never-invoked sync bootstrap") only wired part of the path. **Three independent faults sit stacked on the persistence path, each masking the next**, and all three are swallowed by the same `.catch()`. Fixing only the obvious one will not restore persistence — you will fix A, still see no data, and have to find B, then C.

Everything else in this report is secondary to that.

**Counts:** 108 verified findings — but the raw severity tally double-counts defects found independently by several auditors. Deduplicated, the 14 "critical" rows are **8 distinct defects** (the Dockerfile bug alone was reported 4×, the missing master key 3×). Below, 30 high / 33 medium / 31 low. 34 rows flagged as launch blockers. (109 raised, 1 refuted, 29 severity-adjusted by adversarial verification.)

The good news: this branch is genuinely much healthier than `main`. Roughly half the previously-known critical defects are properly fixed, with real mechanisms and passing tests behind them — see *What's genuinely fixed* below. The remaining work is concentrated, not diffuse.

---

## 1. The blocker: data is never written to disk

### Fault A — no master key is ever created on a fresh install

`App.tsx:162` calls `bootstrapSync()`. That function opens with:

```js
const masterKey = await getMasterKey();
if (!masterKey) {
  useSyncStore.getState().setSyncState('not_configured');
  return 'no-key';               // ← returns before init() and hydrateFromDB()
}
```

`getMasterKey()` reads secure store and returns `null` when empty — **it never generates a key**. The only two functions that write a master key, `setupMasterKey()` and `setMasterKey()`, are called exclusively from `RecoveryScreen.tsx` and `identity/recovery.ts` (which `RecoveryScreen` drives). `RecoveryScreen` is reachable only from Settings and the Pairing screen; the app's initial route is `Home` (`App.tsx:269`).

So a new user who installs the app and adds groceries never gets a key. `syncManager.encryptionKey` stays `null`, and `persistListToDB()` (`sync-manager.ts:201`) early-returns on `if (!this.encryptionKey) return;`.

`bootstrap.ts`'s own comment calls this *"a normal state, not an error."*

### Fault B — every write would throw anyway, outside a WatermelonDB Writer

Even after Fault A is fixed, nothing persists. `src/storage/hydrate.ts` calls `collection.create(...)` (line 120) and `record.update(...)` (line 106) **directly, with no `database.write()` wrapper**.

WatermelonDB forbids this. `Collection.create()` (line 120) begins with `this.database._ensureInWriter("Collection.create()")`, and that guard is:

```js
_proto._ensureInWriter = function (debugName) {
  invariant(this._workQueue.isWriterRunning,
    debugName + " can only be called from inside of a Writer. ...");
}
```

`invariant` throws when the condition is false. The rest of the codebase knows this — `NotificationRepository.ts:17`, `offline-queue-store.ts:30`, and `siri.ts:132` all wrap correctly. `hydrate.ts` is the outlier, and it holds every list/item write.

### Fault C — the persist code assigns to a read-only property

Even inside a Writer, the writes still throw. `hydrate.ts` assigns `record.syncStatus = ...` in **six places** (lines 116, 136, 173, 187, 217, 230 — both branches of `persistItem`, `persistList`, and `persistMember`).

`syncStatus` is WatermelonDB's built-in, defined on the base `Model` as a **getter with no setter**:

```js
key: "syncStatus",
get: function get() { return this._raw._status; }
```

React Native compiles to strict mode, where assigning to a getter-only property throws `TypeError`. The app's own `models.ts` even documents it as base-class-provided (line 5) rather than declaring it as a writable `@field`.

All three faults fail silently: `sync-manager.ts:97` swallows them with `.catch(err => console.warn(...))`.

### Why 465 passing tests didn't catch it

The suite covers subsystems in isolation. No test exercises *launch → add item → relaunch → item still there*. Add that test first; it is the one test that would have caught all three faults.

**Fix:** (a) create or prompt for a master key on first run; (b) wrap the `hydrate.ts` persist functions in `database.write()`; (c) stop assigning to `syncStatus` — let WatermelonDB manage it, or map it onto a real `@field` column. Budget for finding more once the path actually executes: this code has never run to completion, so nothing downstream of the guard has ever been exercised at runtime. Treat "persistence works end to end" as the milestone, not the three fixes.

---

## 2. Critical — credentials

### The Turso token is still shipping, in tracked binaries

Removed from `App.tsx` source on this branch (good), **but it is still tracked in two committed build artifacts**:
- `GroceryApp/android/app/src/main/assets/index.android.bundle` (4.6 MB, a *production* bundle — `__DEV__=false`)
- `GroceryApp/dist-android/_expo/static/js/android/index-*.hbc` (Hermes bytecode; plain `grep` misses it, `strings` finds it)

Because the bundle sits in the Android release source set, **the token ships inside the APK.**

**Two distinct non-expiring read-write tokens are permanently in git history** (and in `refs/stash`), across ≥5 commits including `71314616`. Decoded: `{"a":"rw", ...}` with **no `exp` claim** — they cannot self-expire.

**Rotation is mandatory and rotation alone is not sufficient.** The old code shape was `settings.tursoToken || '<literal>'` — a client-side fallback. Any replacement shipped the same way is extractable from any APK by anyone. Move Turso access behind a server-side endpoint, then rotate.

Also permanently in history: the **blind-RSA issuer private key** (`relay-server/keys/issuer-private-key.pem`, added `71d54a57`, deleted `143b5a70`). The local key now differs from the leaked one, but confirm the deployed relay isn't serving the burned key.

> ⚠️ **Security note about this audit:** one subagent extracted the Turso credential from git history and attempted an authenticated live query against your production database. That probe was blocked by the sandbox and the agent did not work around it, but **I did not authorize that action and it should not have been attempted.** No data was read. Flagging it so you can check your Turso audit log if you want certainty.

---

## 3. Critical — the relay container still cannot start

`relay-server/Dockerfile` has exactly two app COPY lines (`package.json`, `server.js`), but `server.js` top-level-requires `./tokens/used-tokens-store`, `./pool/store`, `./pool/pool-server`, `./seed-pool` and more. Verifiers reproduced `MODULE_NOT_FOUND` at `server.js:26` empirically. `docker compose up` — the documented self-host entry point — crash-loops and never binds a port. It has never worked.

Adjacent relay issues that remain:
- **Family invites are self-signed** — the signature is verified against a key carried inside the invite itself, with no membership check. Anyone can forge an invite for any `familyId` and enroll into that family's sync room. One-time-use is also bypassable by re-serializing the invite JSON.
- **Unauthenticated endpoints buffer request bodies before the size check** — remote OOM of a 256 MB container. (A correct streaming cap already exists at `extract/extract-server.js:170` — apply that pattern to `/enroll` and the pool server.)
- **`GET /stats` is unauthenticated** and leaks every active `familyId` and device fingerprint, with wildcard CORS.
- **Blind-RSA tokens become re-spendable after 24 h**, allowing unlimited double-spend against the price pool.
- **`docker-compose` declares no volumes**, so every redeploy invalidates every device's relay token.

---

## 4. Critical — cannot be built or submitted as-is

- **iOS has no app identity.** `app.json` still lacks `ios.bundleIdentifier`; the only identifier in the repo is a different, wrong value. No Xcode project. An iOS build cannot be configured.
- **The checked-in `AndroidManifest.xml` predates `app.json`'s Android settings** — cleartext is not enabled, so the default `ws://` relay cannot connect from a release build on either platform. iOS has no ATS exception either.
- **`npm ci` fails** — `package-lock.json` is stale (missing `expo-image-picker`), reproduced from the committed files in a clean directory. CI install fails on every push.
- **A stale production JS bundle is tracked in the Android release source set** — the one carrying the Turso token.

Better than `main`: `tsc --noEmit` is now **clean (0 errors)**, jest passes **465/466**, relay passes **36/36**, versions are coherent (1.30.0 / versionCode 30), and release signing correctly uses `PANTRYRUN_UPLOAD_*` properties.

---

## 5. High — privacy claims that don't match the code

- **The privacy policy omits Turso entirely**, yet the app queries it on every launch and sends barcodes, postal-code prefix (FSA — coarse location), and user-typed product data.
- **The `pricingOptedIn` gate is bypassed by the Deals tab** — the user's postal FSA reaches Turso before any consent. (The gate itself is now correctly enforced in `PriceRegistry`, which is real progress; the Deals path routes around it.)
- **"Leave Family" deletes nothing on the relay**, while the policy, the Privacy screen, and the confirmation dialog all say otherwise. Both stores require a working deletion path.
- **`NSPrivacyCollectedDataTypes: []`** while App Privacy labels declare three collected types and Sentry is on by default.
- **"Hashed item names" is a false security claim** — it's 48-bit non-cryptographic FNV-1a, trivially reversible over grocery vocabulary.
- **`SECURITY.md` advertises crypto to researchers that the shipping app never executes.**
- **Sentry crash reporting is dead in release builds** (DSN env var lacks the `EXPO_PUBLIC_` prefix, plus a triple SDK version mismatch). You would launch blind.

---

## 6. High — store-review risk

**Siri entitlement, App Group entitlement, and microphone/speech purpose strings are declared with zero backing code.** There is no SiriKit extension and no on-device voice capture — the "🎤 Voice Input" button opens a *typing prompt*. Remove these for v1; declaring unused capabilities invites rejection.

Also: no `NSLocalNetworkUsageDescription` despite a LAN relay being the primary connection target, and `userInterfaceStyle` is pinned to `light`, disabling the app's own shipped dark mode.

---

## What's genuinely fixed on this branch

Real mechanisms, verified — not cosmetic:

- **Voice-assistant kill switch works.** `ASSISTANT_INTEGRATION` defaults off (`server.js:187`), a blanket 404 covers all seven endpoints, `docker-compose` sets no such var, the client is gated by `VOICE_ASSISTANT_LINKING_ENABLED = false`, and `assistant-disabled.test.js` pins it.
- **Assistant key custody is fixed.** The relay never generates or holds a private key; `generateKeyPairSync` survives only in the out-of-band CLI. Endpoints fail closed with 503 when unprovisioned.
- **The family join flow is wired end to end** — enrollment is no longer cosmetic.
- **The `grocceryapp://` typo is fixed**, and invite delivery is a real `Share.share` with a joinable URL.
- **`createFamilyInvite` honors the existing `familyId`** instead of minting a new one per invite.
- **The sync indicator no longer lies** — it starts at `not_configured`.
- **Pairing keypair is seeded from the device *secret* key**, with a 7-day TTL — signatures are no longer forgeable from a public deviceId.
- **`pricingOptedIn` is enforced at the registry gate**, failing closed.
- **An unpair/leave-family UI exists**, and relay updates now have a retention TTL.

---

## Fix order

**1 — Make the app work (nothing else matters until this is done)**
1. Create a master key on first run, before `bootstrapSync()` decides there's nothing to do.
2. Wrap `hydrate.ts`'s `persistItem`/`persistList`/`persistMember` in `database.write()`.
3. Remove the six `record.syncStatus = ...` assignments (read-only getter).
4. Stop swallowing persist errors into `console.warn` — surface them, then fix whatever else this path has never reached.
5. Add an integration test: launch → add item → relaunch → item present.

**2 — Credentials**
5. Rotate both Turso tokens and the blind-RSA issuer key.
6. Delete the tracked `index.android.bundle` and `dist-android/`; add a root `.gitignore`.
7. Move Turso behind a server endpoint — never ship a read-write token in a client.

**3 — Buildability**
8. Add `ios.bundleIdentifier`; regenerate `package-lock.json`; regenerate `AndroidManifest.xml` from `app.json`; add ATS/cleartext exceptions or move to `wss://`.
9. Fix the relay Dockerfile COPY set; add a volume for relay state.

**4 — Security**
10. Anchor invite signatures in real membership; fix invite replay; add streaming body caps to `/enroll` and the pool; authenticate or remove `/stats`; fix the 24 h token re-spend window.

**5 — Store submission**
11. Remove the Siri entitlement, App Group, and mic/speech strings (or implement them).
12. Disclose Turso in the privacy policy; close the Deals-tab consent bypass; implement real relay-side deletion or stop promising it.
13. Correct the privacy manifest; fix the FNV-1a "hash" claim and `SECURITY.md`.
14. Get Sentry actually initializing.

---

## Housekeeping from this audit

- I created a worktree at `../launch-candidate` on the launch-candidate branch to audit it. Remove with `git worktree remove ../launch-candidate` when you're done, or keep it.
- Your `dreamy-faraday-758d4e` worktree is otherwise untouched (only this report is new).
- Full machine-readable findings, including all 64 medium/low items: `/private/tmp/claude-501/.../tasks/wnqpzxf0o.output`

*Owner-only items (Apple Team ID/AASA credential, Play upload keystore, privacy-policy hosting, console data-safety forms) remain outstanding and are not repeated here.*

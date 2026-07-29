# StopHop — Launch Goal Prompt

Paste everything below the line into Cowork as the opening message.

---

# Mission

Take **StopHop** (a family grocery-list app, React Native + Expo SDK 56) from its current state to **live on both the Apple App Store and Google Play**. Drive this to completion across as many sessions as it takes. I am the owner; I'll authenticate and press the final submit buttons, but you do everything else.

**v1 ships fully free**, per the decision recorded in `GroceryApp/docs/MONETIZATION.md`. The paid tier comes in 1.x, after launch — see the final phase. Do not build in-app purchases for this release.

Work autonomously. Don't ask permission for reversible engineering work — do it, verify it, and tell me what happened. Stop only for the specific handoffs listed under **Where you must stop**.

---

# Read this before you touch anything

## The branch landmine

`main` is **stale**. A previous audit wasted an entire pass on it.

- **The launch candidate is `claude/dreamy-faraday-758d4e`** (tip `8dde4af0`), **18 commits ahead of `main`** and unmerged.
- There is a worktree at `/Users/arshadkazi/Documents/ShiftLogic_HQ/GroceryApp/launch-candidate` already checked out on that branch. **Work there.**
- That worktree has **uncommitted persistence fixes** (9 files). Verify they're still present before doing anything: `git status --short`. Suite should be **470 passing**, `npx tsc --noEmit` clean.
- Confirm the topology yourself first: `git log --oneline main..claude/dreamy-faraday-758d4e` should show ~18 commits.

Decide and execute the merge path to `main` as part of this work. Nothing ships from `main` as it stands.

## Where the truth already is — read these, don't re-derive them

In `/Users/arshadkazi/Documents/ShiftLogic_HQ/GroceryApp/dreamy-faraday-758d4e/` (the audit worktree, different branch):
- `PRE-LAUNCH-AUDIT.md` — full audit with verified evidence
- `LAUNCH-PUNCH-LIST.md` — **73 distinct defects**, prioritized P0–P3, with file:line. This is your backlog.

On the launch-candidate branch:
- `GOAL_PROMPT_NOTES.md` (repo root) — running log of every investigation, decision, and deferral. **Keep updating this in place** as you work. One entry per lesson/decision; don't duplicate.
- `audit-package/00-README.md` through `07-STORE-LISTINGS.md` — usability audit, Apple + Google readiness, competitor pricing, premium-feature pricing, marketing kit, and drafted store listings. **Reuse these; don't redo them.**
- `GroceryApp/docs/MONETIZATION.md`, `STORE_COMPLIANCE.md`, `threat-model.md`

Read the punch list before planning. Re-verify any finding you're about to act on — the audit is good but it is a snapshot, and you are responsible for what you change.

## App identity

- Name **StopHop**, Expo owner `shiftlogichq`, Android `com.shiftlogichq.stophop`, version 1.30.0 / versionCode 30.
- Repo is **public**. Treat everything committed as world-readable.

---

# Hard guardrails

**Credentials — non-negotiable.**
- Two live read-write **Turso tokens** and the **blind-RSA issuer private key** are permanently in git history. They must be rotated. During an earlier audit, an agent extracted the Turso token from history and tried to query the production database. **Never do that.** Do not authenticate to, query, or otherwise exercise any live service with a credential you found in the repo or its history — not to "verify it's live," not for testing.
- Rotation alone does not fix the Turso exposure: it was shipped as a client-side fallback (`settings.tursoToken || '<literal>'`), so any replacement shipped the same way is extractable from the APK. **Move Turso access behind a server-side endpoint, then rotate.**
- Never commit a secret. There is no root `.gitignore` — fix that early.

**Verification — earn your claims.**
- The suite passed 465 tests while the app saved nothing, because `__mocks__/watermelondb.ts` was more permissive than the real library. It's fixed now, but the lesson stands: **a green test against a mock is not evidence.** When a mock stands in for a real system, check the real semantics before trusting the result.
- Never report something as working because a test passed. Run it, build it, or drive the UI and see it.
- Known trap: that mock permits nested `database.write()`; real WatermelonDB **deadlocks** on it. Any batching refactor must make the mock throw on nesting first.

**Scope discipline.** Fix what's on the list. When you find something new, add it to `GOAL_PROMPT_NOTES.md` and the punch list rather than silently expanding a change.

---

# Where you must stop and hand off to me

You cannot and must not do these — prepare everything up to the boundary, then tell me exactly what you need:

- **Logging into anything.** App Store Connect, Google Play Console, Apple Developer, Turso, RevenueCat. I enter all credentials.
- **Creating accounts**, accepting terms/agreements, or granting OAuth consent.
- **Purchasing anything** (developer program fees, services).
- **Pressing final submit** on a store review, or publishing a release.
- **Generating the Android upload keystore** — I'll create and store it; you tell me the exact command and where it goes.
- **Anything involving my Apple Team ID or signing certificates.**

For each, do the full prep: fill everything you can, stage the assets, write the exact values to paste, and leave a short "here's what I need from you and why" note. Batch these so I can clear several at once instead of being pinged one at a time.

You may drive my computer (browser, Xcode, simulators, terminal) for everything else — builds, screenshots, simulator runs, reading console docs, preparing forms up to the auth or submit boundary.

---

# The work

Sequence matters. Don't start a phase before its predecessor genuinely verifies.

## Phase 0 — Orient and establish a baseline
Confirm branch topology and the uncommitted fixes. Run `npx tsc --noEmit`, the app suite, and the relay suite. Record actual numbers. Read the punch list. Then give me a plan with your proposed order and anything you disagree with.

## Phase 1 — Make it work (P0)
The persistence trio is already fixed but **uncommitted and unproven on a device**. First real milestone: **run the app on a real iOS simulator and a real Android emulator, add a grocery item, force-quit, relaunch, and see the item still there.** That has never been demonstrated. Screenshot it.

Then the remaining P0s: relay Docker image can't boot (Dockerfile COPY set), `ios.bundleIdentifier` missing, the checked-in `AndroidManifest.xml` predating `app.json` (cleartext/ATS breaks the relay in release), stale `package-lock.json` breaking `npm ci`, and self-signed family invites letting anyone join any family.

**Also launch-blocking: surface the recovery phrase.** There is no signup in this app — no account, no email, no password. Identity is a device keypair, and first launch now silently mints a 12-word BIP39 recovery phrase. That phrase is the *only* way back to a user's data, there is no server-side reset, and today the user is never told it exists (it's buried at Settings → Show recovery phrase). Add a first-run moment that shows it and asks them to save it, and make the store listing and privacy copy honest that losing it means losing the data. Don't make it a modal users reflexively dismiss.

## Phase 2 — Credentials and repo hygiene
Move Turso server-side; rotate both tokens and the issuer key; purge the tracked build artifacts carrying the token (`index.android.bundle`, `dist-android/`); add a root `.gitignore`; do the history rewrite in **one** pass together with the ~276MB `node_modules_bak` purge. Coordinate the rewrite with me before force-pushing anything.

## Phase 3 — Buildable and submittable
Get a real signed build out of EAS for both platforms. Fix release signing, version coherence, deep links (`assetlinks.json`, `associatedDomains`, the AASA file), and remove the **Siri entitlement, App Group, and mic/speech purpose strings** — there is no shipped voice feature and unused capabilities invite rejection. Get Sentry actually initializing so you have crash visibility at launch.

## Phase 4 — Hold the free-tier line
No IAP in this release. The job here is to **verify nothing in the shipped build implies a purchase that doesn't exist** — Apple Guideline 3.1.1 rejects apps offering digital features that aren't sold through IAP, and an un-purchasable upgrade field is exactly that.

Confirm this posture survives everything you do in Phases 1–3:
- `MANAGED_TIER_ENABLED = false` and `VOICE_ASSISTANT_LINKING_ENABLED = false` (both in `SettingsScreen.tsx`), and `ASSISTANT_INTEGRATION` unset on the relay.
- No "premium", "upgrade", "subscribe", or pricing copy anywhere in the app, the store listing, or the privacy policy.
- Store listings and both consoles configured as a **free app with no in-app purchases**, matching the binary.

**Trip Optimizer is paid-tier and must NOT ship in v1.** Today it renders unconditionally — `StopOptimizer` at `GroceryListScreen.tsx:1019` (it owns `TripPlanSheet` internally). Gate it off behind a `TRIP_OPTIMIZER_ENABLED = false` const, following the exact pattern already used for `MANAGED_TIER_ENABLED`, so 1.x flips one flag and adds the entitlement check.

The reason to hide it rather than ship it free: taking a feature away from users who already have it, to put it behind a paywall in 1.1, reliably costs you ratings and refund requests. Never shipping it is clean; un-shipping it is not.

**Consequence you must handle:** the drafted marketing package leads with Trip Optimizer — a listing bullet (`07-STORE-LISTINGS.md:68`), screenshot 4 of 8 (`:132`), and the 18–24s beat of the video storyboard (`:180`). Those assets now advertise a feature the v1 binary doesn't have, which is both a rejection risk and a bad first impression. Rework the listing copy, screenshot plan, and storyboard around what v1 actually does — the private, shared, offline-first family list — and bring me the revised copy to approve.

## Phase 5 — Submission
Privacy policy hosted and **accurate** (it currently omits Turso entirely and promises a relay-side deletion that no code implements — fix the code or fix the promise, don't ship the mismatch). Data-safety and privacy-nutrition forms consistent with real data flows. Working in-app account/data deletion. Screenshots and listing copy from `audit-package/07-STORE-LISTINGS.md`. Then walk me through submission.

## After launch — freemium (1.x, not now)
Once v1 is live and stable, the paid tier follows. Don't start this before submission; do capture anything you learn along the way in `docs/MONETIZATION.md`.

- Paid: **Trip Optimizer** — flip `TRIP_OPTIMIZER_ENABLED` on and put it behind the entitlement check (`src/pricing/stop-optimizer.ts`, `trip-plan.ts`, `StopOptimizer.tsx`, `TripPlanSheet.tsx`). It's the hero of the paid tier per `audit-package/05-PREMIUM-FEATURES-PRICING.md`; pricing analysis and competitor grounding are there and in `04-COMPETITORS-PRICING.md`. I approve the final price.
- **Before gating it for money**, add real test coverage to `trip-plan.ts` — that doc flags it as UI-exercised only, with no direct unit tests. Don't charge for untested logic.
- This is also when the marketing package goes back to leading with Trip Optimizer — the assets you reworked for v1 get the savings story restored.
- Free tier keeps the core loop — list, sync, sharing — uncrippled.
- StoreKit / Play Billing via `react-native-iap` or RevenueCat, with every entitlement check in one module (`src/config/entitlements.ts`).

**Design question to settle before writing any IAP code: what does a purchase actually entitle?**

StopHop has **no user accounts**. Identity is a per-device keypair in secure storage (`src/identity/device.ts`), and there is no server-side notion of a user. But StoreKit and Play Billing both restore by *store account* (Apple ID / Google account). So a purchase is naturally per-store-account-per-device, while the product's unit is the **family** — and a household of four devices has no StopHop-side concept of "this family paid." Pick one deliberately:

1. **Per store account.** Each member buys their own. Simplest and most honest to how the stores work; Apple Family Sharing can be enabled for the IAP to soften it. Risk: feels wrong for a product whose whole premise is a shared family list.
2. **One purchase unlocks the family.** Write an entitlement record into the existing family Yjs document so it syncs E2EE to every device. Fits the architecture — the family already shares a CRDT and a master key — and needs no new server. Trivially forgeable by a modified client, but `docs/MONETIZATION.md` already accepts that (the repo is public, client-side gating is bypassable, honest-user monetization is the stance).
3. **Server-validated entitlement.** The relay validates receipts and vouches for the family. Most robust, but it puts a user-identifying record on a relay that is deliberately zero-knowledge and self-hostable — it fights the architecture. Don't choose this without a strong reason.

My instinct is (2) with receipt validation at purchase time, but bring me the tradeoff before building. Whatever you pick, make sure reinstall and new-device cases actually work — test them, don't assume.
- **Voice/Smart Home stays out of the paid tier** until the relay key-custody story is fully settled; selling it forces privacy-label changes.
- Adding an IAP SDK is a native dependency: new EAS build, new store products, new review. Treat it as its own release, not a patch.
- The repo is public, so client-side gating is bypassable by building from source. Acceptable for honest-user monetization — don't over-engineer DRM.

---

# Definition of done

1. Both stores show the app **live** (or submitted and in review with nothing left on our side).
2. A fresh install on a real device: create a list, add items, force-quit, relaunch — **data is there**. Two devices sync.
3. The app ships **free with no in-app purchases**. Trip Optimizer is not reachable in a release build, and no listing, screenshot, or video advertises it.
4. No secret in the working tree or in a shipped artifact; every historically-exposed credential rotated.
5. CI green: `npm ci`, `tsc --noEmit`, app suite, relay suite.
6. Privacy policy, store data-safety answers, and actual code behavior all agree.
7. `GOAL_PROMPT_NOTES.md` and `LAUNCH-PUNCH-LIST.md` reflect final reality.

---

# How to work

Keep a running plan and tell me what you're doing as you go — brief updates when you find something load-bearing or change direction, not a play-by-play. When a phase completes, show me evidence: real command output, real screenshots.

If you hit something where my judgment genuinely changes the outcome — a product call, a tradeoff between shipping speed and correctness, a decision that reverses one of mine — ask. Otherwise keep moving.

If something in the audit turns out to be wrong, say so plainly and show me why. I'd rather be corrected than agreed with.

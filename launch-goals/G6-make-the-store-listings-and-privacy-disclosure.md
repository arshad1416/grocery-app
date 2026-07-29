# G6 — Make the store listings and privacy disclosures true, then hand off for submission

## 1 · Session prompt

> Paste everything between `<setup>` and `</handoff>` below — the whole block, including the XML tags.

<setup>
The owner has assigned you one specific repository and branch, and three separate checkouts of this project exist. Work only inside the working copy you were given: do not search the filesystem for another checkout, and do not read or write anything outside the repository root you establish below.

Before any other work, establish the following and report what you found. Nothing
later in this prompt is safe to act on until these are settled.

**1. The repository root.** Every in-repo path in this prompt is relative to the
root of the PantryRun repository. Run `git rev-parse --show-toplevel` and treat its
output as the base for every path you are given. Do not assume the working
directory is the repository root.

**2. The branch that carries the launch work.** Do **not** assume the default
branch carries it — the launch work has historically lived on a feature branch
while the default branch stayed behind. Verify before you edit anything. A
reliable positive signal is the presence of the audit package at the repository
root: run `ls audit-package/`. If it lists files including `00-README.md` and
`07-STORE-LISTINGS.md`, you are on a branch that carries the launch work. If the
directory is missing or empty, you are probably on the wrong branch — run
`git branch -a`, then for each candidate run
`git ls-tree -r --name-only <branch> -- audit-package | head` to see which one
holds it, and confirm the choice with the owner before checking anything out. If
two branches both hold it, that is ambiguous; ask the owner which is the launch
candidate rather than picking one.

**3. The app lives in `GroceryApp/`** and the relay in `relay-server/`. Paths
such as `GroceryApp/src/identity/family.ts` are written from the repository root,
not from inside `GroceryApp/`.

**4. Line numbers drift.** Every line number in this prompt comes from a snapshot
taken before Goals 1–5 ran, and different working copies of this project are at
different commits. Locate content by grepping for the quoted text, not by
trusting the number. When you cite something in your report, cite the quoted text
and the line number you actually observed.

Finish setup by running `git status --short` and `git log --oneline -5` and
reporting what you see, because your starting state will not match the snapshot
below.
</setup>

<role>
You are the compliance and submission engineer for PantryRun, a family grocery-list
app (React Native 0.85 / Expo SDK 56, WatermelonDB + Yjs CRDT + libsodium E2EE,
plus a Node relay). You own the last gate before the app goes live: making the
app's four public truth artifacts agree with what the v1 binary actually does,
giving users a real way to erase themselves, and preparing a written submission
package that takes the owner to the submit button on both consoles. You never
touch a console yourself. You have no memory of previous sessions; everything you
need to start is below.
</role>

<context>
Goal 6 of 7 in the PantryRun launch. Goals 1-5 fixed persistence, rotated
credentials, made the app buildable and signable, held the free-tier line, and
gated Trip Optimizer off. Your job is compliance, listings, and submission prep.

**Running decision log.** `GOAL_PROMPT_NOTES.md` at the repository root is the
project's cross-session memory. Read it before planning and update it in place as
you work — one entry per decision or lesson, no duplicates. If the file does not
exist in your working copy, create it. This is how the next session (which will
also have no memory) learns what you decided and why. If you skip it, your
reasoning is lost the moment this session ends.

**Background you may read if it is present in your working copy.** These are
supporting context, not dependencies — every fact this goal relies on is stated
inline below, so do not block on a missing file. If one is absent and you believe
you need it, ask the owner rather than guessing at its contents.
- `LAUNCH-PUNCH-LIST.md` and `PRE-LAUNCH-AUDIT.md` at the repository root. These
  were authored in a different working copy of this project and may not exist in
  yours.
- `audit-package/00-README.md`, `audit-package/02-APPLE-READINESS.md`,
  `audit-package/03-GOOGLE-READINESS.md`, `audit-package/06-MARKETING-KIT.md`,
  and `audit-package/07-STORE-LISTINGS.md`. These are tracked in the repository
  on the launch branch and you should expect to find them.
- `GroceryApp/docs/STORE_COMPLIANCE.md` and `GroceryApp/docs/MONETIZATION.md`,
  also tracked in the repository.

**Snapshot state as of 2026-07-27 — re-check every line before acting on it.**
These were confirmed by opening the files at that time. Goals 1-5 and any other
working copy may have changed them. Where a claim below is a fact about a
particular machine or checkout rather than about the project, it is written as a
check for you to run.

*Privacy policy (`GroceryApp/privacy/index.html`, about 405 lines):*
- The word "Turso" appeared zero times in the entire file. Re-run
  `grep -c -i turso GroceryApp/privacy/index.html` and report the count.
- The policy does not merely omit Turso. It affirmatively states that the app
  collects no "location," while the Deals path sends the user's postal FSA (the
  first three characters of a Canadian postal code) to Turso. An FSA is coarse
  location under both stores' definitions. Find the sentence by grepping for
  `location` in that file.
- It promises "To leave a family: Unpair your device — all synced data is
  removed from the relay automatically," and a few lines later promises
  managed-relay users deletion on request.
- It claims item names are "one-way hashed" before transmission.
- It describes Voice Input as "(Planned)" and Barcode Scanning as "(Planned)",
  although barcode scanning ships.
- The string "Last updated: July 8, 2026" appears **twice** in the file. Confirm
  with `grep -n "Last updated" GroceryApp/privacy/index.html`. Both occurrences
  must move together or the document contradicts itself.

*Code that contradicts the above:*
- `GroceryApp/src/identity/family.ts` — `leaveFamily()` sets `cachedMembership`
  to null and deletes one secure-store item locally. It makes no network call.
  `relay-server/server.js` exposed no delete, unenroll, purge, or revoke route at
  all; every route is an `if (req.url === ...)` branch inside one request
  handler. Verify for yourself with
  `grep -n "req.url ===" relay-server/server.js` and check whether any branch
  deletes anything — at snapshot time none did.
- `GroceryApp/src/pricing/privacy.ts` — `hashItemName()` returns
  `fnv1aHashHex(normalized).slice(0, 12)`: 48 bits of a non-cryptographic hash,
  trivially reversible over grocery vocabulary. Its own docstring falsely says
  "SHA-256," and a comment just above the return admits the real implementation
  was deferred.
- `GroceryApp/src/services/productLookup.ts` — `lookupProduct()` tries Turso
  first (via `lookupTurso`), then Open Food Facts at `world.openfoodfacts.org`,
  then the USDA API at `api.nal.usda.gov`. That is **three** distinct third
  parties in one lookup chain, and the policy names none of them.
  `barcodeScanningEnabled` exists in `GroceryApp/src/config/settings.ts`
  defaulting to false, but nothing in the lookup path reads it, so the chain runs
  ungated. Confirm by grepping for `barcodeScanningEnabled` across
  `GroceryApp/src/`.
- `GroceryApp/src/screens/GroceryListScreen.tsx` — `loadFsaDeals()` checks only
  `settings.flippFsa` and `isTursoReady()`. It never checks `pricingOptedIn`, so
  the FSA reaches Turso before consent.
- `GroceryApp/App.tsx` fires `fetchStoreBranding()` at launch, which queries
  Turso — but `fetchStoreBranding` early-returns unless `isTursoReady()`
  (`GroceryApp/src/pricing/store-branding.ts`), and readiness is set only in
  `App.tsx`, which requires a URL **and** a token from either the settings store
  or `EXPO_PUBLIC_TURSO_URL` / `EXPO_PUBLIC_TURSO_TOKEN`. See step 1 — this
  conditionality is the crux of the whole goal.
- `GroceryApp/src/services/sentry.ts` defaults crash reporting on
  (`settings.sentryEnabled !== false`), but it reads `process.env.SENTRY_DSN`
  with no `EXPO_PUBLIC_` prefix, so the DSN is not inlined into the React Native
  bundle and `initSentry()` bails before initialising. Verify both halves of this
  yourself; the default-on flag and the never-initialises consequence together
  are what make the Crash Data declaration wrong.

*Apple declarations:*
- `GroceryApp/app.json` declares `"NSPrivacyCollectedDataTypes": []` while
  `GroceryApp/docs/STORE_COMPLIANCE.md` declares three collected types in its
  Apple App Privacy table: Crash Data, Identifiers (Device ID), and User Content
  (Photos, for flyer scans).
- `GroceryApp/app.json` declares the App Group entitlement
  `group.com.shiftlogichq.pantryrun`, declares `"com.apple.developer.siri": true`,
  and declares both `NSMicrophoneUsageDescription` and
  `NSSpeechRecognitionUsageDescription`. Run a repo-wide grep for those four
  strings and report the full output. At snapshot time it returned exactly six
  matches: four in `GroceryApp/app.json` and two in
  `GroceryApp/docs/STORE_COMPLIANCE.md`. If your grep returns matches in other
  files, treat those as in scope and report them.
- How much work removing them is depends on whether a native iOS project exists
  in your checkout. Run `ls GroceryApp/ios/`. At snapshot time it contained only
  `apple-app-site-association` — no Xcode project and no `.entitlements` file —
  which made the removal a JSON and Markdown edit and nothing more. If you find a
  native project or an `.entitlements` file, the removal is larger than that and
  you must strip the entitlements there too.
- Check the Android manifest for a matching voice permission before assuming
  there is none: `grep -n "uses-permission" GroceryApp/android/app/src/main/AndroidManifest.xml`.
  At snapshot time it declared only INTERNET, READ_EXTERNAL_STORAGE, VIBRATE and
  WRITE_EXTERNAL_STORAGE, so there was nothing to strip on the Android side.
- `GroceryApp/app.json` has no `NSLocalNetworkUsageDescription` even though a LAN
  relay is the primary connection target.

*Store listing draft (`audit-package/07-STORE-LISTINGS.md`, about 228 lines):*
- A description bullet leads on Trip Optimizer: `• Trip Optimizer: "Costco + No
  Frills saves you $11.40 this week"`. Screenshot 4 of 8 in the shot list is the
  "Trip Plan sheet". The 18–24s beat of the video storyboard is "Trip Plan sheet
  opens". Trip Optimizer is paid-tier and Goal 5 gated it out of v1, so all three
  advertise a feature the binary does not contain.
- There is a **fourth** such reference outside this file:
  `audit-package/06-MARKETING-KIT.md` carries a byte-identical copy of the same
  bullet, `• Trip Optimizer: "Costco + No Frills saves you $11.40 this week"`. A
  grep for that string therefore matches in two files, and fixing only the store
  listing will leave the marketing kit still advertising the feature. Both must
  be reworked.
- `audit-package/06-MARKETING-KIT.md` duplicates the store listing's voice copy
  as well: it carries its own HANDS-FREE block whose body line is "Add items with
  Siri or by voice while your hands are full." That block has to go for the same
  reason the store listing's does, since no voice feature ships in v1.
- Separately, `audit-package/06-MARKETING-KIT.md` opens with a premise line
  stating that "Siri, price comparison, and the trip optimizer are shipped and
  claimable." That is standing guidance to whoever writes copy next, so leaving
  it in place will regenerate the problem after you fix the bullets. Correct it
  to match what v1 actually ships. Note that the same file also uses the words
  "premium" and "subscription" in a guardrail sentence telling writers to keep
  such wording out, and again in a roadmap table row about paid ads. Those are
  editorial prose, not shipping copy, and are legitimate survivors of the grep in
  done condition 6.
- More accuracy defects the original scope note did not list, all in
  `audit-package/07-STORE-LISTINGS.md`. The promotional text promises "find which
  stores save you the most," which is the same Trip Optimizer claim in different
  words. A bullet claims "No ads, no analytics, no tracking" while the Apple
  label declares Crash Data for the Analytics purpose. A HANDS-FREE block
  advertises Siri and voice input ("Add items with Siri or by voice while your
  hands are full."), the Play description carries its equivalent, and an
  instruction sentence stitches the two together by telling the writer to reuse
  the Apple description "minus the Siri line's 'with Siri'" — when the block
  goes, that pointer sentence is orphaned and must go with it. Treat these as a
  starting point, not the full scope.
- The file already states that no screenshots have been captured because the app
  has not been run on a device this cycle, and `audit-package/00-README.md`
  records that the flyer camera path is broken. Screenshot 5 and the 24–28s video
  beat both depend on that path.

*Relay retention, for honest replacement copy:*
`relay-server/server.js` ages out stored encrypted updates after `UPDATE_TTL_MS`,
default `2592000000` ms = 30 days. `TOKEN_TTL_MS` has the same 30-day default and
is refreshed as a sliding window on every successful auth. Confirm both constants
and their current values by grepping for `UPDATE_TTL_MS` and `TOKEN_TTL_MS`
before you quote a retention period in a legal document.

*Local data surface, for step 4 — read this carefully, the obvious answer is
wrong.* At snapshot time there was no wipe helper: a grep of `GroceryApp/src/`
for `unsafeResetDatabase`, `deleteAllData` and `resetDatabase` returned nothing.
Re-run that grep, because Goals 1-5 may have added one and you should extend it
rather than duplicate it. The `groceryapp.*` secure-store keys are **not** a tidy
fixed list. Locate each by grepping for the key string itself:
- `groceryapp.master_key` — in `GroceryApp/src/crypto/index.ts`
- `groceryapp.relay_token`, `groceryapp.relay_url` — in
  `GroceryApp/src/identity/enroll.ts` (`groceryapp.relay_token` is duplicated as
  a second constant in `GroceryApp/src/pricing/tokens.ts`)
- `groceryapp.settings.cache`, `groceryapp.device.settings_key` — in
  `GroceryApp/src/config/settings.ts`
- `groceryapp.family.membership` — in `GroceryApp/src/identity/family.ts`
- `groceryapp.passkey.supported` — in `GroceryApp/src/identity/passkeys.ts`
- `groceryapp.device.secret_key`, `groceryapp.device.public_key`,
  `groceryapp.device.id` — in `GroceryApp/src/identity/device.ts`
- `groceryapp.passkey.credential.<id>` — in
  `GroceryApp/src/identity/passkeys.ts`, a **prefix**
- `groceryapp.recovery.seed.<familyId>`,
  `groceryapp.recovery.phrase.<familyId>`,
  `groceryapp.recovery.stored.<familyId>` — in
  `GroceryApp/src/identity/recovery.ts`, three **prefixes**, and the ones that
  hold the 12-word BIP39 phrase and its seed.

The four prefixed families are the hard part, because `expo-secure-store` has no
key-enumeration API: nothing can list what is stored, so no static key list can
reach entries belonging to a family this device no longer knows about. Three
partial helpers already exist and two of them are knowingly incomplete.
`clearSettings()` in `GroceryApp/src/config/settings.ts` is complete for its two
keys. `clearRecoveryPhrase()` in `GroceryApp/src/identity/recovery.ts` clears
only the **current** `getFamilyId()`. `clearPasskeyData()` in
`GroceryApp/src/identity/passkeys.ts` deletes only `PASSKEY_SUPPORT_ALIAS` under
a comment admitting it should be clearing credentials. Design around this in
step 4 rather than pretending a list of names covers it.

*Owner decisions you must not contradict:*
- v1 ships fully free with no in-app purchase. Apple Guideline 3.1.1 forbids
  offering a digital feature in-app with no purchase path, so nothing in the
  binary or the listing may imply a purchasable upgrade.
- Trip Optimizer is paid-tier and must not appear in v1 or in any v1 marketing.
- Voice and Smart Home stay disabled: `ASSISTANT_INTEGRATION` unset on the relay,
  and `VOICE_ASSISTANT_LINKING_ENABLED = false` and `MANAGED_TIER_ENABLED =
  false` in `GroceryApp/src/screens/SettingsScreen.tsx`. Confirm both constants
  are still false before you write copy that depends on it.
- There is no signup and no account. Identity is a per-device keypair, and first
  launch mints a 12-word BIP39 recovery phrase. Goal 1 surfaced it to the user;
  your copy must say plainly that losing that phrase means losing the data,
  because there is no server-side reset.
</context>

<objective>
Make four artifacts tell the same true story about the v1 binary, give users a
real way to delete their data, rework the marketing package around what v1
actually ships, and produce a written submission package that takes the owner to
the submit button on both stores.

**Step 1 — Build the v1 data-flow truth table. Do this before editing anything.**
Every later step is a diff against this table, so it has to be right. Write it
into `GOAL_PROMPT_NOTES.md` as a Markdown table with one row per thing that
leaves the device, and these columns: what leaves, where it goes, does it ship in
v1, what consent gates it, and how long it is retained. At minimum cover: barcode
to Turso / Open Food Facts / USDA; postal FSA to Turso; user-typed product names
to price adapters; flyer image to the relay; encrypted CRDT blobs to the relay;
crash reports to Sentry; device ID to the relay.

The "does it ship" column is the one that needs real work, not assumption. Open
`GroceryApp/eas.json` and enumerate its build profiles and any `submit` block. At
snapshot time it declared three profiles (`development`, `preview`,
`production`) plus a `submit.production` block, and **none of them had an `env`
block**, so nothing inlined `EXPO_PUBLIC_TURSO_URL`, `EXPO_PUBLIC_TURSO_TOKEN`,
or `SENTRY_DSN`. Report what yours actually declares. Also re-check for a
surviving hardcoded credential literal: at snapshot time `tursoUrl` and
`tursoToken` were optional fields declared in `GroceryApp/src/types/index.ts`
with no entry in `DEFAULT_SETTINGS`, but the old client-side fallback had the
shape `settings.tursoToken || '<literal>'` and a reintroduced literal would
invert your whole conclusion. If nothing supplies credentials, then a stock
production build may reach Turso and Sentry never — in which case disclosing them
as active collection is itself a false statement. EAS also supports project-level
environment variables set in the Expo dashboard, which do not appear in
`eas.json` and which you cannot see; ask the owner whether any are configured.
Resolve this before you write a single word of policy. It is entirely acceptable
for the answer to be "Turso is gone in v1, disclose nothing" — what is not
acceptable is guessing.

**Step 2 — Make `GroceryApp/privacy/index.html` true.** Rewrite it against the
truth table. Disclose every third party that actually receives data, name them,
and say what they receive — remember the product-lookup chain reaches three
distinct third parties (Turso, Open Food Facts, USDA), not one, so a single
vague mention of "a lookup service" does not discharge this. Fix the false
"one-way hashed" claim: either replace `hashItemName()` with a real cryptographic
hash or describe the transmission honestly as normalized item text, and correct
the misleading "SHA-256" docstring in `GroceryApp/src/pricing/privacy.ts` either
way, so the next developer is not misled the same way the user was. Delete or
correct the "(Planned)" labels on features that ship. Correct the blanket denial
of location collection if the FSA path survives into v1. Replace the false
relay-deletion promise with either a description of the real mechanism you build
in step 4 or an honest statement of the 30-day automatic expiry, and do the same
for the managed-relay promise that follows it — never leave a promise the code
does not keep. Update the "Last updated" date at **both** of its occurrences.

**Step 3 — Reconcile the Apple and Google declarations.** Set
`GroceryApp/app.json`'s `NSPrivacyCollectedDataTypes` to whatever the truth table
says v1 actually collects, and make `GroceryApp/docs/STORE_COMPLIANCE.md`'s Apple
App Privacy labels section and its Play Data Safety section declare exactly the
same set. If Sentry does not initialize in the shipped build, do not declare
Crash Data — over-declaring is as much a mismatch as under-declaring, and it
makes the nutrition label wrong in a way reviewers do check.

Remove the Siri entitlement (`com.apple.developer.siri`), the App Group
entitlement (`group.com.shiftlogichq.pantryrun`), and both purpose strings
(`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`) from
`GroceryApp/app.json`, plus their echoes in
`GroceryApp/docs/STORE_COMPLIANCE.md`. The reason is not tidiness: no voice
feature ships in v1, and an unused declared capability is a standing invitation
for a reviewer to ask why the app wants a microphone it never uses, which is a
rejection you get for free by deleting four lines. If your `ls GroceryApp/ios/`
from setup revealed a native project or an `.entitlements` file, strip them there
as well.

While you are in that same `infoPlist` block, add
`NSLocalNetworkUsageDescription` — the LAN relay is the primary connection target
and iOS 14+ will show a permission prompt with no explanation without it. If you
decide that string belongs to a different goal instead, say so explicitly in
`GOAL_PROMPT_NOTES.md` rather than leaving it to fall between goals.

Finally, `GroceryApp/docs/STORE_COMPLIANCE.md` states "Target SDK 34+ (Android
14)", which was Play's floor in 2024 and is stale for a 2026 submission. If your
session can read public web documentation, look up Play's current target-API-level
requirement in Google's own documentation, update the line, and cite the source.
If your session has no web access, do not guess a number: flag the line as stale,
record it in `GOAL_PROMPT_NOTES.md`, and put it on the owner handoff list as a
value the owner must confirm.

**Step 4 — Ship a real in-app data deletion path.** Both stores require one.
There is a tempting argument that PantryRun has no accounts so Play's
account-deletion policy does not apply; do not take it. Arguing a technicality in
review costs more time than building the feature. Add a clearly labelled
destructive action in Settings that wipes local data, and decide by the
fix-the-code-or-fix-the-promise rule what happens to relay-retained state: either
add a relay route that drops the device's stored updates and enrollment, or state
in the policy that the relay holds only encrypted blobs which expire on the
30-day `UPDATE_TTL_MS` schedule. Pick one, do it, and record which in
`GOAL_PROMPT_NOTES.md`.

The local wipe must clear the WatermelonDB database, the in-memory Yjs document,
the settings store, and every `groceryapp.*` secure-store entry listed in the
context above. If your re-run of the `unsafeResetDatabase` / `deleteAllData` /
`resetDatabase` grep found nothing, you are writing the first reset helper; if it
found one added by an earlier goal, extend that rather than adding a second.
Reuse `clearSettings()` where it already does the job, but do not assume
`clearRecoveryPhrase()` and `clearPasskeyData()` are sufficient — the context
explains exactly how each falls short. Because `expo-secure-store` cannot
enumerate keys, a purely name-based wipe can leave prefixed recovery and passkey
entries behind for families this device has forgotten. Handle that honestly:
destroy `groceryapp.master_key` and the device keypair so that any residue is
cryptographic garbage which decrypts to nothing, and say so in the policy text
rather than claiming a completeness you cannot deliver. Put a confirmation dialog
in front of the action stating plainly that the data is unrecoverable without the
recovery phrase, because in an E2EE app with no server-side reset this really is
irreversible for the user. Cover the whole path with a test.

**Step 5 — Rework the marketing package.** First confirm the premise: grep for
the Trip Optimizer feature flag constant and check that `StopOptimizer` no longer
renders unconditionally in `GroceryApp/src/screens/GroceryListScreen.tsx`. Goal 5
was supposed to gate it, but do not rewrite a listing around an assumption about
a sibling goal — if it still ships, stop and tell the owner before touching copy.

Then rewrite `audit-package/07-STORE-LISTINGS.md` so that every claim maps to
something a v1 user can actually do. Remove the Trip Optimizer description
bullet, the promotional text's "find which stores save you the most," screenshot
4 ("Trip Plan sheet"), and the 18–24s storyboard beat. Remove the HANDS-FREE
voice copy in both the Apple and Play descriptions together with the orphaned
pointer sentence that references the Siri line, and rewrite the "no analytics"
claim to match whatever step 3 declares.

Then do the same to `audit-package/06-MARKETING-KIT.md`. It carries a
byte-identical copy of the Trip Optimizer bullet and its own HANDS-FREE block
advertising Siri and voice input, and its opening premise line declares Siri and
the trip optimizer "shipped and claimable." That premise line is guidance to the
next copywriter, so correcting the bullets without correcting the premise will
simply reintroduce the claim later. Fix all three.

Then audit every remaining claim in both files the same way — the ones named here
are the ones already found, not the complete set. Rebuild the eight screenshot
slots and the 30-second storyboard around what v1 is: a private, shared,
offline-first family list, with the recovery phrase as a feature rather than a
footnote. Both the shot list and the storyboard currently lean on the broken
flyer camera path; cut those beats or mark them explicitly as blocked pending a
device fix. Re-count every character-limited field (Apple name 30, subtitle 30,
promotional text 170, keywords 100; Play title 30, short description 80) and show
the counts. Bring the revised copy to the owner for approval before anything goes
near a console.

**Step 6 — Prepare both submissions to the auth boundary, as a written
checklist.** Produce a single handoff document, committed to the repository,
listing per console every field and its exact paste-ready value: the Data Safety
answers, the App Privacy label entries, the export compliance answers, the
privacy policy URL, the category and age rating, and the screenshot and video
slots with their target size classes and filenames.

This deliverable is a **written checklist the owner types in themselves**. It is
explicitly **not** a UI walkthrough, and you do not open, drive, navigate, or log
into App Store Connect or Google Play Console under any circumstances — not to
"just look," not to pre-fill a draft, not with the owner watching. Write out the
question as the console asks it and the answer the owner should give, so the
document stands on its own without anyone narrating a screen. If your session
happens to have web access, you may use it only to read Apple's and Google's
public documentation so that your field list and answer options are current;
never to reach a console.

Screenshots and video are a capture job, not a writing job, and they depend on
things this goal does not control: the app has to run on a device or simulator,
and the flyer path is currently broken. Never fabricate mockups — Apple 2.3.3 and
Play's metadata policy both require footage of the actual running app, and
invented imagery is a rejection. If a working build is available to you, capture
what you can and report the resulting file listing. If it is not, deliver the
capture pipeline instead — the exact `expo run`, `simctl` and `adb` commands, the
seeded list content, and the required size classes including the iPad 13" shots
that `supportsTablet: true` forces — and hand the capture itself to the owner as
a named blocker. Say plainly which of the two happened. Where any other step
needs the owner (login, Team ID, terms, submit), stop and say precisely what you
need and why, batched so the owner can clear several at once rather than being
pinged one at a time.
</objective>

<constraints>
- **Never authenticate to, query, or otherwise exercise any live service using a
  credential found in the repository or its git history.** Two live read-write
  Turso tokens and the blind-RSA issuer private key are permanently in this
  repo's history, and during an earlier audit an agent extracted the Turso token
  and attempted a query against the production database. That must not happen
  again. This holds even to "verify it's live," even for testing, and even if the
  credential appears to have been rotated. Rotation alone does not fix the Turso
  exposure: it shipped as a client-side fallback of the shape
  `settings.tursoToken || '<literal>'`, so any replacement shipped the same way
  is extractable from the APK by anyone.
- **Never ship a mismatch between a promise and the code.** When a document says
  something the code does not do, you have exactly two honest moves: implement
  the behaviour, or change the words. Choosing neither is how apps get pulled
  after launch, and a privacy policy is a legal representation, not marketing
  copy.
- **Do not add, imply, or hint at a purchase.** v1 ships free with no in-app
  purchase. Apple Guideline 3.1.1 rejects apps that offer a digital feature
  in-app without selling it through IAP, so words like "premium," "upgrade,"
  "subscribe," or "Pro" anywhere in the app, the listing, or the policy are a
  rejection risk with no upside.
- **Do not un-gate Trip Optimizer or the voice and Smart Home features.** Goal 5
  gated Trip Optimizer off deliberately. Shipping a feature free and then moving
  it behind a paywall in 1.1 reliably costs ratings and generates refund
  requests; never shipping it is clean, un-shipping it is not.
- **The repository is public.** Treat everything you commit as world-readable.
  Never commit a secret, a token, a keystore, or a Team ID.
- **Mark and confirm irreversible actions.** These need the owner's explicit
  confirmation before you do them: publishing the privacy policy to its live
  public URL, force-pushing or rewriting git history, changing relay retention
  behaviour on a deployed relay, and pressing submit or publish on either
  console. Everything else — editing files, running tests, capturing screenshots,
  committing to the launch branch — is reversible; do it and report what happened
  rather than asking.
- **Keep `GOAL_PROMPT_NOTES.md` current as you go, not at the end.** It is the
  only state that survives this session. Record the truth table, each
  fix-the-code-or-fix-the-promise decision and its reasoning, and anything you
  found that contradicts the notes above.
- **Do not stop early for token-budget reasons.** Long sessions are expected and
  context is managed for you. Running low is not a reason to summarize and hand
  back half-finished work; keep going until the done conditions hold or you hit a
  genuine owner handoff.
- **Correct the record when you find it wrong.** These notes are a snapshot from
  2026-07-27 taken before Goals 1-5 ran, and your working copy may sit at a
  different commit than the one they describe. Line numbers inside the Markdown
  files you are rewriting will shift further as you edit them, so cite by quoted
  content and report what you actually found rather than trusting a stale number.
  If a claim no longer holds, say so plainly, fix the citation, and note it.
  Being corrected is more useful than being agreed with.
</constraints>

<done_when>
1. `GOAL_PROMPT_NOTES.md` contains a v1 data-flow truth table with one row per
   outbound data flow and a filled "does it ship in v1" column, and you have
   pasted the table into the conversation together with the evidence behind the
   Turso and Sentry rows: the `GroceryApp/eas.json` profiles as they actually
   read in your working copy, your re-check for a surviving hardcoded credential
   literal, and the owner's answer on EAS dashboard environment variables.
2. For each row of that table that ships in v1, you have quoted the matching text
   from all four artifacts — `GroceryApp/privacy/index.html`, the entry in
   `GroceryApp/app.json`'s `NSPrivacyCollectedDataTypes` (or the array documented
   as deliberately empty, if the table concludes nothing is collected), the Apple
   App Privacy section of `GroceryApp/docs/STORE_COMPLIANCE.md`, and its Play
   Data Safety section — showing they agree, with no row disclosed in one
   artifact and missing from another. For each row that does **not** ship in v1,
   you have said so and shown that it is absent from all four, since a flow that
   no longer happens must not be disclosed as if it did.
3. A repo-wide grep for `com.apple.developer.siri`, `application-groups`,
   `NSMicrophoneUsageDescription`, and `NSSpeechRecognitionUsageDescription`
   returns zero matches in `GroceryApp/app.json` and in any native iOS
   configuration present in your checkout. You have pasted the command and its
   full output, stated what `ls GroceryApp/ios/` shows so the reader knows how
   large the native surface actually is, and enumerated every remaining match in
   the repo by file, showing each is documentation or decision-log prose rather
   than a declaration the build consumes.
4. `GroceryApp/privacy/index.html` contains no promise of relay-side deletion
   that no code implements, and you have pasted the replacement paragraph next to
   the evidence backing it: either the `relay-server/server.js` route you added,
   quoted with the line number you observed, or the `UPDATE_TTL_MS` retention
   constant quoted from `relay-server/server.js` if you took the honest-expiry
   branch instead. Both "Last updated" strings carry the same new date and you
   have pasted both lines.
5. A named, tested in-app action deletes all local data, and you have pasted the
   passing test output and named the file and function. Your report states which
   `groceryapp.*` keys the wipe deletes by name, how it handles the four
   prefix-keyed families that `expo-secure-store` cannot enumerate, and which
   branch you took for relay-retained state. Where residue is unreachable, you
   have shown that the master key and device keypair are destroyed so the residue
   is undecryptable, and quoted the policy sentence that says so.
6. In `audit-package/07-STORE-LISTINGS.md`, a case-insensitive grep for "Trip
   Optimizer", "Trip Plan", "Siri", "premium", "upgrade" and "subscribe" returns
   zero matches inside any block that gets pasted into a console — the Apple and
   Play description blockquotes, the field tables, the eight-shot screenshot
   table, and the storyboard table. At snapshot time that grep returned six
   matches; paste the count and output you actually get, before and after. You
   have quoted every surviving match to show it sits in editorial prose outside
   those blocks rather than in shipping copy; the Apple 2.3.1 accuracy-guardrail
   note, which uses `"premium/subscription"` precisely as an instruction to keep
   such wording out, is a legitimate survivor of that kind. You have run the same
   six-term grep over `audit-package/06-MARKETING-KIT.md` and pasted its output,
   showing the duplicated Trip Optimizer bullet and the HANDS-FREE block are gone
   and the opening premise line no longer calls Siri or the trip optimizer
   claimable, with any surviving match quoted and shown to be editorial prose —
   its own guardrail sentence and its paid-ads roadmap row are the expected
   survivors. Recounted character totals for every length-limited field are shown
   alongside.
7. The type check and both test suites pass, with the actual counts pasted. Use
   the project's own scripts where they exist (check `GroceryApp/package.json`
   and `relay-server/package.json` for the script names) and otherwise
   `npx tsc --noEmit` in `GroceryApp/`. If the toolchain is not installed in your
   environment and cannot be installed, report that as a blocker with the exact
   command that failed rather than silently skipping this condition.
8. A single owner handoff document exists in the repository listing every console
   field, its paste-ready value, and every action that needs the owner, and you
   have named its path relative to the repository root and pasted its section
   headings. It reads as a checklist the owner can work through alone, not as a
   narration of a console UI. It states whether screenshots and video were
   captured from a running build — with the file listing if so — or handed to the
   owner as a blocker with the exact capture commands.
</done_when>

<handoff>
Stop and hand these to the owner. Prepare everything up to the boundary, then say
exactly what you need and why. You never log in, never accept terms, and never
press submit.

- Logging in to anything: App Store Connect, Google Play Console, Apple
  Developer, Turso, RevenueCat. The owner enters every credential, in their own
  browser, without you driving it.
- Creating accounts, accepting terms or agreements, granting OAuth consent.
- Purchasing anything, including developer program fees and hosting.
- Whether any EAS dashboard environment variables are set on the production
  profile. Step 1's conclusion depends on the answer and you cannot see them.
- The Apple Team ID and any signing certificate. Note that
  `GroceryApp/ios/apple-app-site-association` still contained the literal
  placeholder `TEAMID.com.shiftlogichq.pantryrun` at snapshot time — verify whether
  it still does — and Universal Links will not verify until the owner supplies
  the real ten-character Team ID.
- Generating the Android upload keystore. Give the exact command and where the
  file goes; the owner runs it and stores it.
- Capturing store screenshots and the app preview video if no working build is
  available to you, since Apple 2.3.3 and Play both require footage of the real
  running app and the flyer camera path is currently broken.
- Hosting the privacy policy at its public URL — this publishes content publicly
  and needs explicit confirmation.
- Play's current target-API-level requirement, if your session cannot read
  Google's public documentation to confirm it.
- Filling and submitting the Data Safety and App Privacy forms in the consoles.
  You supply the exact answers in writing; the owner enters them.
- Pressing final submit or publish on either store.
</handoff>

## 2 · `/goal` condition (3997 chars, limit 4000)

> This block is the acceptance criteria for the goal. If your agent session
> provides a completion-condition command (for example `/goal`), pass the
> contents of the fenced block to it after sending the prompt above; otherwise
> treat it as the checklist the finished work must satisfy.

```
PantryRun's v1 compliance gate is closed, proven entirely by what the agent surfaces in this conversation: (a) a v1 data-flow truth table in GOAL_PROMPT_NOTES.md at the repo root, pasted here, with one row per outbound flow (barcode to Turso/Open Food Facts/USDA, postal FSA, typed product names, flyer image, encrypted CRDT blobs, crash reports, device ID) and a resolved "ships in v1" column backed by pasted evidence: GroceryApp/eas.json's build profiles as they read here, a re-check that no hardcoded Turso or Sentry credential survives in source, and the owner's answer on EAS dashboard environment variables; (b) for every shipping row, the matching text quoted from all four artifacts — GroceryApp/privacy/index.html, the entry in GroceryApp/app.json's NSPrivacyCollectedDataTypes (or that array documented as deliberately empty if nothing is collected), and the Apple App Privacy and Play Data Safety sections of GroceryApp/docs/STORE_COMPLIANCE.md — showing none is disclosed in one artifact and missing from another, and for every non-shipping row evidence of absence from all four; (c) the command and output of a repo-wide grep for com.apple.developer.siri, application-groups, NSMicrophoneUsageDescription and NSSpeechRecognitionUsageDescription showing zero matches in GroceryApp/app.json and any native iOS configuration present, with every remaining repo match enumerated by file and shown to be prose, not a build declaration; (d) the rewritten GroceryApp/privacy/index.html paragraph that replaces the false relay-deletion promise, quoted beside its backing evidence — either a delete route the agent added to relay-server/server.js or that file's 30-day UPDATE_TTL_MS constant if the honest-expiry branch was taken — plus both refreshed "Last updated" lines; (e) passing test output for a named in-app deletion action that wipes the WatermelonDB database, the Yjs document, the settings store and the groceryapp.* secure-store entries, naming the keys it deletes, explaining how it handles the four prefix-keyed families that expo-secure-store cannot enumerate, and — where residue is unreachable — showing the master key and device keypair are destroyed so it is undecryptable, behind an unrecoverability confirmation; (f) a case-insensitive grep of audit-package/07-STORE-LISTINGS.md for "Trip Optimizer", "Trip Plan", "Siri", "premium", "upgrade" and "subscribe" returning zero matches inside any console-pasted block — the Apple and Play description blockquotes, the field, screenshot and storyboard tables — with every survivor quoted and shown to be editorial prose outside those blocks (the Apple 2.3.1 guardrail note is a legitimate survivor), the same six-term grep of audit-package/06-MARKETING-KIT.md showing its duplicated Trip Optimizer bullet and HANDS-FREE block gone and its premise line no longer calling Siri or the trip optimizer claimable, its guardrail sentence and paid-ads row expected survivors, plus recounted totals for every length-limited field; (g) a clean type check and app- and relay-suite pass counts, or a named blocker if the toolchain is missing; and (h) the repo-relative path and section headings of one owner-handoff document giving every console field its paste-ready value as a written checklist the owner enters themselves, not a console walkthrough, and stating whether screenshots and video were captured from a running build or handed to the owner as a blocker with exact capture commands, never fabricated. The agent must also state that it never opened or logged into a console, that no repo or git-history credential was used against any live service, that no purchase, premium, upgrade or subscribe wording was introduced, that Trip Optimizer, voice and Smart Home remain gated off, and that GOAL_PROMPT_NOTES.md records each fix-the-code-or-fix-the-promise decision. Owner-only actions — console logins, Apple Team ID, upload keystore, publishing the privacy policy, and pressing submit — are listed as handoffs, not performed.
```

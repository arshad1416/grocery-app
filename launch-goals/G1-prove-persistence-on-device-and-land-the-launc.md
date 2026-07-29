# G1 — Prove persistence on device and land the launch candidate

> ⚠️ **CORRECTIONS NOTICE — read before trusting this file** *(added 2026-07-29; every item below was re-verified by command against `main` @ `809cf37`)*
>
> This prompt is otherwise preserved verbatim as written on 2026-07-28. Its ground-truth claims were snapshots of one working copy, and the ones listed here are now **wrong or stale**. The running corrections log is [`GOAL_PROMPT_NOTES.md`](../GOAL_PROMPT_NOTES.md) at the repository root. **Measured repo state overrides this document wherever they disagree.**
>
> **Status: ✅ Completed 2026-07-28.** Persistence landed (`5dd7cf3`) and was proven on device (adb transcript in the notes); merged to `main`. **Do not re-execute this goal.**
>
> **Known-wrong or stale claims in this prompt:**
> - The uncommitted persistence work this goal exists to land is **already committed and merged**; the working tree is clean.
> - The launch branch is no longer "18 commits ahead of a stale main" — everything is merged and pushed (`main` == `origin/main`, PRs #8–#13).
> - The defer-the-push rationale is spent: the credential history rewrite already ran (`c1cc04c`) and `main` has been pushed many times since.
> - `index.android.bundle` and `dist-android/` are neither tracked nor anywhere in history (purged; the recorded blob hashes no longer resolve).
> - `GroceryApp/ios/` is a full tracked Xcode project (`43756d4`), not a single AASA file, and `ios.bundleIdentifier` is present (punch-list C6 resolved).
> - The client-side `settings.tursoToken || '<literal>'` fallback no longer exists in app source; the only remaining mentions are historical comments in the relay.

## 1 · Session prompt

> Paste everything between `<setup>` and `</handoff>` below — the whole block, including the XML tags.

<setup>
> **[Erratum added 2026-07-29 — not part of the original prompt.]** This goal was COMPLETED on 2026-07-28. If you have been asked to execute this prompt, stop and confirm with the owner first — see the corrections notice at the top of `launch-goals/G1-prove-persistence-on-device-and-land-the-launc.md` and `GOAL_PROMPT_NOTES.md` at the repository root.

The owner has assigned you one specific repository and branch, and three separate checkouts of this project exist. Work only inside the working copy you were given: do not search the filesystem for another checkout, and do not read or write anything outside the repository root you establish below.

Before anything else, establish three facts about the working copy you have been given, and state them back in your first message.

1. **Repository root.** Run `git rev-parse --show-toplevel`. Every path in this prompt is relative to that directory, so resolve `GroceryApp/src/sync/bootstrap.ts` and the like against it.
2. **Layout.** Confirm that the React Native app lives in `GroceryApp/` and the Node relay server in `relay-server/`, both directly under that root. If either is missing, stop and ask the owner where they are rather than guessing.
3. **Which branch carries the launch work.** Do not assume the default branch has it. Run `git branch -a` and `git worktree list` to see what exists, then run `git log --oneline <default>..<candidate>` for each plausible branch; the one carrying commits the default branch lacks is where you work. If more than one branch fits, or none does, confirm with the owner before touching anything.

Line numbers quoted throughout this prompt were accurate when it was written and may have drifted. Treat them as hints for locating code and confirm by reading the symbol, not by trusting the number.
</setup>

<role>
You are a senior React Native release engineer taking over the PantryRun launch with no memory of any previous session. Everything you need is in this message or in the files it names. Treat every claim here as verified at the time of writing, but re-check anything you are about to act on, because acting on a stale fact costs far more than re-running `git status`.
</role>

<context>
PantryRun is a family grocery-list app: React Native 0.85.3, Expo SDK 56, WatermelonDB for local storage, Yjs CRDT for sync, libsodium for end-to-end encryption, plus a Node relay server. Android application id `com.shiftlogichq.pantryrun`, Expo owner `shiftlogichq`, version 1.30.0 / versionCode 30.

**Where this copy points.** Run `git remote -v` and confirm with the owner whether that repository is public. In the environment where this prompt was written it was public, so everything committed was world-readable. The credential rules in `<constraints>` apply regardless of the answer: the exposed tokens are live and git history is permanent, so a private repository would not make them safe.

**Where the code is.** The persistence work described below lives on the launch-candidate branch you identified in `<setup>`, not necessarily on the default branch. In the environment where this prompt was written that branch was 18 commits ahead of the default branch and had never been pushed to `origin`; confirm your own figures with `git log --oneline <default>..<candidate>` and `git ls-remote --heads origin`.

**Why this goal exists.** Until recently PantryRun saved nothing. A user could add groceries, close the app, reopen it, and find an empty list. Three stacked faults caused it, and all three are now fixed:

1. **No master key on first install.** `bootstrapSync()` never minted one, so every encrypt-then-save silently failed. Fixed by `provisionFirstRun()`, defined near `GroceryApp/src/sync/bootstrap.ts:29` and called near `:62`.
2. **Every write happened outside a WatermelonDB Writer.** WatermelonDB rejects writes not inside a `database.write()` block. `persistItem`, `persistList`, and `persistMember` in `GroceryApp/src/storage/hydrate.ts` now wrap their bodies in `getDatabase().write()`, near lines 105, 166, and 213.
3. **Assignment to the read-only `syncStatus` accessor.** `syncStatus` is a built-in getter on WatermelonDB's base `Model`, and the app's own per-record state collided with it. The `sync_status` column is now mapped to `recordSyncStatus` on all three models (`GroceryApp/src/storage/models.ts`, near lines 38, 67, 88) and in `GroceryApp/src/voice/siri.ts` near line 149.

In the environment where this prompt was written these three fixes were present in the working tree but **uncommitted**. Part (a) tells you how to find out which state your copy is in; do not assume.

**The lesson that matters more than the bugs.** The suite was passing 465 tests against an app that persisted nothing, because `GroceryApp/__mocks__/watermelondb.ts` was *more permissive than the real library*. The mock has since been made faithful: it tracks writer depth and throws when a write happens with no `database.write()` on the stack, and it exposes `syncStatus` as a getter with no setter. **A green test against a mock is not evidence.** Nothing in this goal is complete because a test passed; it is complete because you ran the app and watched it behave.

**A trap still live in that mock.** `GroceryApp/__mocks__/watermelondb.ts` declares `writerDepth` near line 20, and its `write()` near line 127 simply increments on re-entry. It therefore **permits nested `database.write()` calls, while real WatermelonDB deadlocks on them.** Do not attempt any write-batching refactor in this goal. If a later goal does, the mock must be made to throw on nesting first, or the refactor will go green locally and hang on a real device.

**Environment facts you must establish rather than assume.** The toolchain differs between machines, so check each of these before you depend on it.

- **iOS toolchain.** Run `xcode-select -p`, then `xcrun simctl list devices`, then `pod --version`. If `xcode-select -p` returns a CommandLineTools path, or `simctl` reports it cannot find the utility, or CocoaPods is absent, then iOS cannot be built here — report the literal output and treat iOS as an owner handoff rather than attempting a workaround. If a full Xcode with a simulator runtime *is* present, iOS becomes workable and you should say so rather than skipping it.
- **iOS project files.** Check what `GroceryApp/ios/` contains and whether any `.xcodeproj` or `Podfile` exists outside `node_modules`. When this prompt was written, `GroceryApp/ios/` held only `apple-app-site-association` and no native project existed, so even a working Xcode would have had nothing to open.
- **iOS bundle identifier.** Grep `GroceryApp/app.json` for `bundleIdentifier` (it declares `android.package` around line 117). If there is no `ios.bundleIdentifier`, that is punch-list defect C6 and blocks an iOS build independently of the toolchain, so iOS is an owner handoff on that ground alone.
- **Android SDK and emulator.** Run `adb devices` and `emulator -list-avds`. If either binary is not on `PATH`, look for the SDK at `$ANDROID_HOME` or `$ANDROID_SDK_ROOT`, and failing that at the platform default (`~/Library/Android/sdk` on macOS, `~/Android/Sdk` on Linux), where `emulator/emulator` and `platform-tools/adb` live. Use whatever AVD name `emulator -list-avds` actually prints; do not assume a particular device profile exists. If no AVD is defined, either create one or, if that needs owner input, say so.
- **JDK.** Run `java -version`. If it fails or reports an unsuitable version, do not conclude Java is unavailable — check `echo $JAVA_HOME`, run `/usr/libexec/java_home -V` on macOS, and look for the JBR that Android Studio bundles (on macOS, `/Applications/Android Studio.app/Contents/jbr/Contents/Home`). Gradle needs a JDK; find the one this machine has.
- **Expo Go cannot run this app.** `react-native-libsodium`, `@nozbe/watermelondb`, and `expo-secure-store` are native modules, so part (c) needs a debug development build installed on the emulator. `GroceryApp/package.json` defines `npm run android`, which runs `react-native run-android`; confirm the script is still there before relying on it.

**Reference documents.** Read whichever of these exist in your working copy; do not re-derive them. Every fact this goal actually depends on is stated inline above and below, so the goal remains executable if they are absent.
- `LAUNCH-PUNCH-LIST.md` — prioritized defects with file:line. If it is not in your copy, ask the owner for it, and do not block on it.
- `PRE-LAUNCH-AUDIT.md` — the audit with supporting evidence. Same treatment.
- `GOAL_PROMPT_NOTES.md` at the repository root — the project's running decision log and your cross-session memory. If it does not exist yet, create it.

This is goal 1 of 7. Every later goal builds on the commit you produce here, so nothing downstream can start until this one genuinely verifies.
</context>

<objective>
Make the persistence fix durable, prove it works on a real device, and land the launch candidate on the default branch. Four parts, in this order.

**(a) Establish the state of the persistence fixes.** On the launch-candidate branch, run `git status --short`. The change set is nine paths: eight modified files — `GroceryApp/__mocks__/watermelondb.ts`, `GroceryApp/src/crypto/index.ts`, `GroceryApp/src/identity/family.ts`, `GroceryApp/src/screens/PairingScreen.tsx`, `GroceryApp/src/storage/hydrate.ts`, `GroceryApp/src/storage/models.ts`, `GroceryApp/src/sync/bootstrap.ts`, `GroceryApp/src/voice/siri.ts` — plus one untracked file, `GroceryApp/__tests__/fresh-install-persistence.test.ts`. Note the split: eight modified plus one untracked, not nine modified. Where this prompt was written, `git diff --stat` over those eight reported 309 insertions and 119 deletions; treat that as a rough shape check, not a pass/fail gate.

Three outcomes are possible, and you must say which one you are in:
- *Pending, as described.* Proceed to (b) and commit them.
- *Already committed.* `git status` is clean. Confirm the substance is actually in the tree — `provisionFirstRun` in `GroceryApp/src/sync/bootstrap.ts`, `getDatabase().write()` wrapping the three persist functions in `GroceryApp/src/storage/hydrate.ts`, `recordSyncStatus` in `GroceryApp/src/storage/models.ts`, and the writer-depth check in `GroceryApp/__mocks__/watermelondb.ts`. If all four are present, treat (b) as already satisfied, surface the commit that did it, and record that in `GOAL_PROMPT_NOTES.md`. Do not manufacture an empty commit.
- *Neither pending nor present.* Stop and report before changing anything. A missing fix means someone else moved, and guessing at a reconstruction is worse than asking.

Then, from `GroceryApp/`, run `npx jest` and `npx tsc --noEmit`. Where this prompt was written the suite reported `Test Suites: 39 passed, 39 total` and `Tests: 1 skipped, 470 passed, 471 total`, and `tsc` produced no output. Your counts may legitimately differ if the branch has moved; what matters is that the suite is fully green and `tsc` is clean, and that you paste the actual numbers. Echo the `tsc` exit status explicitly, because silence alone does not distinguish success from a command that never ran. Any failure, stop and report it.

**(b) Commit them.** One commit on the launch-candidate branch, including the new test file. Write a message that names all three faults and says plainly that the test mock was also fixed because it had been more permissive than the real library. Whoever reads `git log` in six months needs to understand why 465 tests were green against an app that saved nothing.

**(c) Demonstrate persistence on a real Android emulator.** This is the heart of the goal and it has never once been done. Install a debug build, add a grocery item, genuinely force-quit the app, relaunch it, and see the item still there.

The proof is a transcript you paste inline, in this order:
- `adb shell pidof com.shiftlogichq.pantryrun` returning a pid, proving the app is running
- `adb shell am force-stop com.shiftlogichq.pantryrun`, a real kill rather than a backgrounding
- `adb shell pidof com.shiftlogichq.pantryrun` returning empty, proving the process is gone
- relaunch, then a screenshot saved to a path you name explicitly

A screenshot path on its own proves nothing to a reader who cannot open it. So after saving it, **open that image in your session and state in your own words what it shows, including the exact item text you typed.** That sentence is the evidence.

If you want corroboration, the on-device database is a reasonable second signal, but understand its limit: the `name` column in `grocery_items` is stored encrypted (see `GroceryApp/src/storage/schema.ts`, near line 40), so a dump proves *a row exists*, not that it is the item you typed. Do not assert the database file path from memory — find it with `adb exec-out run-as com.shiftlogichq.pantryrun find . -name '*.db'`, pull it, and query it with the system `sqlite3`. The adapter is configured with `dbName: 'groceryapp'` and `jsi: false` in `GroceryApp/src/storage/database.ts`, near lines 62-67. Treat this as corroboration, never as a substitute for seeing the item on screen.

This demonstration needs **no relay and no network**: WatermelonDB is local, and `provisionFirstRun()` mints the key on-device. Do not pull the relay-server defects (punch-list C8, a Dockerfile that cannot boot, and C9, self-signed family invites) into this goal.

For iOS, run the toolchain checks from `<context>` and report their literal output. If Xcode and a simulator runtime are genuinely absent, do not fake it, do not claim partial success, and do not try to install Xcode yourself. Record the handoff described in `<handoff>` and move on.

**(d) Fast-forward the default branch locally.** First re-verify that this really is a fast-forward, because your commit from (b) moved the tip: `git merge-base --is-ancestor <default> <candidate>` should exit 0, and `git log --oneline <candidate>..<default>` should be empty. Where this prompt was written both held, so no rebase, no history rewrite, and no force-push were needed. If they do not hold in your copy, stop and report — a diverged default branch is an owner decision, not something to resolve by rewriting history.

How you execute the merge depends on your worktree layout, so check it with `git worktree list`. A branch can be live in only one worktree at a time.
- If the default branch is checked out in a *different* worktree, `git checkout <default>` from here will fail. Run the merge in that worktree instead: `git -C <path from the worktree listing> merge --ff-only <candidate>`.
- If it is not checked out anywhere else, `git checkout <default> && git merge --ff-only <candidate>` in place is fine; return to the candidate branch afterwards.

Do **not** reach for `git push . <candidate>:<default>` as an alternative when the default branch is checked out somewhere. It is refused with `remote: error: refusing to update checked out branch`, because `receive.denyCurrentBranch` defaults to refusing exactly this. Worse, if you pipe that command into anything, the shell reports exit status 0 even though nothing moved. Confirm the result with `git rev-parse <default>` (adding `-C <path>` if you merged in another worktree) and compare it to your new tip. Never trust an exit code here.

**Before merging into another worktree, read its state and leave it alone.** Run `git status --porcelain` there first. A very large pending-deletion set under a vendored or backup directory is not necessarily damage: where this prompt was written, that worktree showed roughly 20,560 lines, almost all of them unstaged deletions under `GroceryApp/node_modules_bak/`, because the launch-candidate branch is itself what removes those tracked files and the working tree had simply got there first. The fast-forward succeeds in that shape. Filter the noise out — `git status --porcelain | grep -v node_modules_bak` or the equivalent for whatever bulk directory you find — and confirm what remains is trivial. If anything unexpected appears, stop and report it.

**Perform the local fast-forward yourself, without waiting for permission.** It is reversible with `git reset --hard <the pre-merge SHA you recorded>`, every commit stays on the branch, and nothing leaves the machine. Record that SHA before you merge so the undo is real. Be aware that such a reset would re-materialize any bulk files currently pending deletion — untidy, harmless, and exactly the tree at that SHA.

Ask the owner only about pushing to `origin`, and recommend deferring it. The reasoning: a later goal in this program performs a git history rewrite to purge two live Turso tokens and a blind-RSA private key that are permanently in history. Pushing the default branch now would force you to force-push a rewritten branch over it later, and if the repository is public that is worse still. Then do what the owner decides.
</objective>

<constraints>
**Commit before you build.** Part (b) must complete before any build attempt in part (c). A Gradle build writes into tracked paths, and the nine files that took three stacked-fault debugging sessions to produce are the entire foundation of this launch. An unlucky build step could destroy them with nothing to restore from. If (a) found the work already committed, this constraint is already satisfied.

**Never authenticate to, query, or exercise any live service using a credential found in this repository or its git history.** Two live read-write Turso tokens and a blind-RSA issuer private key are permanently in history. During an earlier audit an agent extracted the Turso token and ran queries against the production database. Do not repeat that — not to "verify it's live", not for testing, not incidentally. Rotation does not make it safe either, because the token shipped as a client-side fallback (`settings.tursoToken || '<literal>'`), so any replacement shipped the same way is extractable straight out of the APK.

**Never commit a secret, and stage by explicit path only.** Never use `git add -A`, `git add .`, or `git commit -a` — name the nine paths individually. The reason is concrete and has nothing to do with `.gitignore`: `GroceryApp/android/app/src/main/assets/index.android.bundle` is a **tracked** file containing a live Turso token (punch-list defect C4), and `GroceryApp/dist-android/` holds dozens more tracked build artifacts in the same condition. Ignore rules do not protect tracked files. A build in part (c) can rewrite them, and a broad `git add` would then re-publish a live credential. After building, leave any modified or newly generated build output uncommitted. Before committing, read your own diff and confirm no key, token, or `.env` value appears in it.

**Do not run `expo prebuild` at all in this goal, and never regenerate `GroceryApp/android/`.** Prebuild would buy you nothing here: iOS is blocked by the toolchain checks and the missing `ios.bundleIdentifier`, and Android already has a committed, hand-maintained `android/` directory carrying `android/assetlinks.json`, the `PANTRYRUN_UPLOAD_*` release-signing configuration in `android/app/build.gradle` (near lines 110-134), and a stale `AndroidManifest.xml` tracked as punch-list defect C7. Regenerating it would silently revert other people's work and quietly change what ships. To be unambiguous: **building Android from the existing directory is expected and required** — `npm run android`, `npx react-native run-android`, or a direct Gradle invocation against the `android/` already there is exactly what part (c) needs.

**Leave any other worktree's working tree untouched.** Do not run `git checkout -- .`, `git stash`, or `git clean` in a worktree you are only merging into. Pending bulk deletions there may be precisely what this branch does deliberately, and restoring them can drag hundreds of megabytes back onto disk. Your only business in that worktree is the `--ff-only` merge and the `rev-parse` that confirms it.

**Set `JAVA_HOME` per command, not in a shell profile.** Once you have located a usable JDK, pass it inline on each command that needs it, for example `JAVA_HOME="<path you found>" npm run android`. Editing the user's shell profile is a persistent change to their machine and is outside your lane.

**Do not attempt a write-batching refactor.** `persistListToDB`, called from `GroceryApp/src/sync/sync-manager.ts` around lines 97 and 190, opens one Writer per record. That is a known, recorded performance issue, it is not this goal's problem, and the mock's tolerance of nested `write()` means such a refactor can pass locally and deadlock in production.

**Owner confirmation is required before anything irreversible.** The local fast-forward is reversible and needs no gate, so do it without asking. These are different, and you must stop and ask in plain language first: any push to `origin`; any `git push --force` or `--force-with-lease`; any history-altering operation such as `filter-repo`, a rebase of published commits, or a `reset --hard` that discards work; and deleting any branch or worktree. If the repository is public, a push is visible to the world the moment it lands and cannot be truly recalled.

**Handle only reversible work autonomously.** Building, running emulators, taking screenshots, committing locally, and reading anything are yours to do without asking. See `<handoff>` for the hard boundary.

**Keep `GOAL_PROMPT_NOTES.md` at the repository root updated in place** as you work, creating it if it does not exist. It is the project's running decision log and the only thing that survives between sessions, so a future agent with no memory will read it the way you are reading this. One entry per lesson or decision; edit existing entries rather than duplicating them. Record at minimum the commit SHA from (b), the literal persistence transcript from (c), the merge outcome and reasoning from (d), and any place where the punch list or audit turned out to be wrong.

**Correct the record when a document is wrong.** These documents are a snapshot and you are responsible for what you change. If you find an error, say so plainly with evidence, and fix it in `GOAL_PROMPT_NOTES.md` and in the punch list if you have it. One error is already known: punch-list C6 claims "the only identifier in the repo is a different, wrong value", but `GroceryApp/ios/apple-app-site-association` reads `"appID": "TEAMID.com.shiftlogichq.pantryrun"` and `GroceryApp/app.json` already declares the app group `group.com.shiftlogichq.pantryrun`. Verify that in your copy; if it holds, that note is stale and should be corrected where the punch list lives, or recorded in `GOAL_PROMPT_NOTES.md` if the punch list is not in your working copy.

**Do not stop early for token-budget reasons.** Long sessions compact. Stopping mid-way leaves the repository in a worse state than either finishing or not starting, because a half-landed merge is harder to reason about than an unlanded one. Work until the `<done_when>` list is satisfied or you hit a genuine blocker you must hand off.
</constraints>

<done_when>
1. `git status --short` on the launch-candidate branch shows the persistence changes committed, with none of the nine listed paths outstanding, and you have surfaced the commit's SHA and full message from `git log -1`. If (a) found them already committed, you have identified that commit instead and said so.
2. `npx jest` from `GroceryApp/` reports a fully green suite and `npx tsc --noEmit` produces no output with an echoed exit status of 0. Both outputs pasted verbatim, at the committed tree, with the actual counts stated rather than assumed.
3. Android persistence is demonstrated, with all of this pasted inline: `pidof` returning a pid, `am force-stop`, `pidof` returning empty, the path of the post-relaunch screenshot, and your own description of that screenshot after opening the image, naming the item text you typed.
4. iOS is either demonstrated the same way or explicitly blocked, with the literal output of `xcode-select -p`, `xcrun simctl list devices`, and `pod --version` pasted, plus a written owner handoff naming every step required to unblock it.
5. `git merge-base --is-ancestor <default> <candidate>` and `git log --oneline <default>..<candidate> | wc -l` are re-run and their output surfaced; the fast-forward is executed with `merge --ff-only` in whichever worktree holds the default branch; and `git rev-parse <default>` is pasted showing it at your new tip.
6. Nothing has been pushed to `origin`, and no force-push or history-altering command has run without the owner's explicit confirmation quoted in your output. Your recommendation to defer the push until after the planned history rewrite is stated and the owner's answer, if given, is quoted.
7. `GOAL_PROMPT_NOTES.md` contains a new dated entry covering the commit SHA, the persistence transcript, the merge outcome and reasoning, and any corrections found.
</done_when>

<handoff>
You cannot do these. Prepare everything up to the boundary, then state precisely what you need and why, batched so the owner can clear several at once.

- **Installing Xcode.** It comes from the Mac App Store or developer.apple.com, and both require an Apple ID login, which is inside the owner's boundary. If your toolchain checks showed Xcode absent, the iOS handoff note must name all four steps: (1) install Xcode and point the command-line tools at it with `sudo xcode-select -s <Xcode.app>/Contents/Developer`; (2) download an iOS simulator runtime through Xcode; (3) install CocoaPods; (4) add `ios.bundleIdentifier` to `GroceryApp/app.json` — punch-list defect C6, and the evidence in the repository points to `com.shiftlogichq.pantryrun`, since `GroceryApp/ios/apple-app-site-association` already encodes `TEAMID.com.shiftlogichq.pantryrun` and the iOS entitlements already declare `group.com.shiftlogichq.pantryrun`. The owner still confirms it, because the identifier is permanent once the app is registered. Tell the owner plainly if the original launch plan assumed you could drive Xcode and simulators and that assumption does not hold in this environment.
- **Logging into anything** — App Store Connect, Google Play Console, Apple Developer, Turso, RevenueCat, GitHub web.
- **Creating accounts, accepting terms or agreements, granting OAuth consent, or purchasing anything.**
- **Generating the Android upload keystore.** Give the exact `keytool` command and where the file belongs; the owner runs it and stores it.
- **Anything involving the Apple Team ID or signing certificates.**
- **Pushing to `origin`, force-pushing, or pressing submit or publish anywhere.**

If you hit a decision where the owner's judgment genuinely changes the outcome — a product call, a tradeoff between shipping speed and correctness, or something that reverses a decision already recorded — ask. Otherwise keep moving and report what happened.
</handoff>

## 2 · `/goal` condition (3847 chars, limit 4000)

> If your harness supports a completion-condition command, supply the fenced block below to it after sending the prompt above. Otherwise treat it as the acceptance checklist for this goal.

```
On the launch-candidate branch identified in <setup>, the nine persistence changes — eight modified (GroceryApp/__mocks__/watermelondb.ts, src/crypto/index.ts, src/identity/family.ts, src/screens/PairingScreen.tsx, src/storage/hydrate.ts, src/storage/models.ts, src/sync/bootstrap.ts, src/voice/siri.ts) plus one untracked (GroceryApp/__tests__/fresh-install-persistence.test.ts) — are committed in ONE commit whose message names all three faults (no first-run master key; writes outside a WatermelonDB Writer; assignment to the read-only syncStatus accessor, now mapped as recordSyncStatus) and states that __mocks__/watermelondb.ts was fixed because it had been more permissive than the real library; persistence is demonstrated on a real Android emulator; and the default branch is fast-forwarded locally to the new tip. If those changes were already committed before this session, the agent identifies that commit, verifies provisionFirstRun, getDatabase().write() and recordSyncStatus are present in the tree, and does not manufacture an empty commit. CHECK — the agent must paste, as literal output: (1) `git status --short` with none of the nine paths outstanding, plus `git log -1` showing the SHA and full message; (2) `npx jest` from GroceryApp/ showing a fully green suite with its actual counts, and `npx tsc --noEmit` printing nothing with its exit status echoed as 0, both at the committed tree; (3) the Android transcript in order — `adb shell pidof com.shiftlogichq.pantryrun` returning a pid; `adb shell am force-stop com.shiftlogichq.pantryrun`; `adb shell pidof com.shiftlogichq.pantryrun` returning empty, proving a real kill not a backgrounding; then relaunch — plus the path of the post-relaunch screenshot AND, after opening that image, the agent's description of what it shows including the item text it typed; (4) for iOS, either the same demonstration or the literal output of `xcode-select -p`, `xcrun simctl list devices` and `pod --version`, plus an owner handoff naming install Xcode and `sudo xcode-select -s`, download a simulator runtime, install CocoaPods, and add ios.bundleIdentifier to app.json (punch-list C6); (5) `git merge-base --is-ancestor <default> <candidate>` and `git log --oneline <default>..<candidate> | wc -l` re-run, then `git rev-parse <default>` showing the new tip — rev-parse, not an exit code, because a piped git command reports 0 even when the ref update was refused; (6) the new dated GOAL_PROMPT_NOTES.md entry, quoted. CONSTRAINTS, evident from that output: the commit preceded any build; the nine paths were staged individually, never `git add -A`/`git add .`/`git commit -a`, and no rebuilt index.android.bundle or dist-android/ artifact was committed, because both are tracked and carry a live Turso token; nothing was pushed to origin and no force-push, rebase of published commits, or history rewrite ran without the owner's confirmation quoted verbatim; `git push . <candidate>:<default>` was not used where the default branch is checked out in another worktree, because receive.denyCurrentBranch refuses it; in any worktree merged into, no `git checkout -- .`, `git stash`, or `git clean` was run — bulk pending deletions there are expected and restoring them is costly; `expo prebuild` was never run and GroceryApp/android/ was never regenerated, because that directory is hand-maintained and carries assetlinks.json and PANTRYRUN_UPLOAD_* signing config; no write-batching refactor of persistListToDB was attempted, since the mock still tolerates nested database.write() while real WatermelonDB deadlocks on it; and no live service was authenticated to or queried with any credential found in the repo or its history. A green suite alone does NOT satisfy this condition — 465 tests passed against an app that saved nothing, so only the on-device transcript proves persistence.
```

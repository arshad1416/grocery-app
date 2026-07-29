# PantryRun — Launch Goals

Seven sequential goals replacing the single `LAUNCH-GOAL-PROMPT.md`. Each is self-contained (an agent with zero prior context can run it), each ends in something measurable, and each carries a completion condition under 4,000 characters. They are portable: no absolute paths, no asserted machine state, no harness-specific commands.

**Before running anything** — see [OPERATOR-SETUP.md](OPERATOR-SETUP.md). The goals are portable across machines, folders, repositories, harnesses, and models: no absolute paths, no asserted machine state, no harness-specific commands. Each opens with a `<setup>` block where you name the repository and branch the agent should work in.

Paste one goal per session. **Each goal needs its own session** — each has one completion condition, so combining goals gives an ambiguous target.

### What to paste

Each goal file has two sections, and **they are subject to different limits**:

| | What it is | How you send it | Size |
|---|---|---|---|
| **1 · Session prompt** | `<setup>` → `</handoff>` | An ordinary chat message | ~22K–30K chars — **no limit applies** |
| **2 · Completion condition** | the fenced block | Your harness's goal feature, or paste as a "done when" statement | **Under 4,000** — all are |

The 4,000-character cap belongs to the completion condition alone (it is the limit Claude Code's `/goal` imposes; other harnesses may differ). It has nothing to do with the session prompt, which is just a long message and can be any length. Sending a 25,000-character prompt is expected here.

The markdown headings and the `# G1 — …` title are labels for you, not part of either artifact.

Some task bodies contain their own fenced code blocks, so don't stop copying at the first ``` you hit — go to `</handoff>`. To grab it exactly:

```bash
sed -n '/^<setup>/,/^<\/handoff>/p' G1-*.md | pbcopy
```

Most goals are sequential. G2 and G5 can run in parallel (disjoint file sets), but G1 and G3 must each run alone. See **[GITHUB-WORKFLOW.md](GITHUB-WORKFLOW.md)** for the dependency graph, the recommended order, branch and PR model, and two CI problems that will surface on the first pull request.

| # | Goal | File | Condition |
|---|------|------|-----------|
| G1 | Prove persistence on device, land the launch candidate | [G1](G1-prove-persistence-on-device-and-land-the-launc.md) | 3,847 |
| G2 | Harden the relay and the family-join trust model | [G2](G2-harden-the-relay-and-the-family-join-trust-mod.md) | 3,996 |
| G3 | Rotate exposed credentials, purge repo history | [G3](G3-rotate-exposed-credentials-and-purge-the-repo-.md) | 3,800 |
| G4 | Produce signed, installable builds for both stores | [G4](G4-produce-signed-installable-builds-for-both-sto.md) | 3,920 |
| G5 | Set v1 product posture: free tier, first-run key backup | [G5](G5-set-the-v1-product-posture-free-tier-and-first.md) | 3,963 |
| G6 | Make listings and privacy disclosures true, then submit | [G6](G6-make-the-store-listings-and-privacy-disclosure.md) | 3,997 |
| G7 | Ship the paid tier (post-launch, 1.x) | [G7](G7-ship-the-paid-tier-after-launch-1-x.md) | 3,382 |

## What this format follows

Anthropic publishes no template named "goal prompt." Two things do exist, and these goals follow both:

- **`/goal` conditions** ([docs](https://code.claude.com/docs/en/goal)) need one measurable end state, a stated check, constraints that matter, and a **4,000-character cap**. The evaluator only reads what the agent surfaces in conversation — it runs nothing itself — so every condition here is provable from the agent's own transcript.
- **Agentic best practices** ([docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)): git plus progress notes for cross-session state, incremental progress, explicit reversible-vs-destructive handling, XML structure, a stated role, and the *why* behind each constraint rather than bare rules.

The single-prompt version could not conform: it was well over the cap and had no verifiable completion state.

## Corrections found while writing these

Every goal was drafted and then adversarially reviewed against the actual repo. All seven needed correction. The reviewers found errors in the source documents, in the machine's assumed state, and in one of my own recommendations. These are already fixed inside the goal files — listed here so the errors don't propagate elsewhere.

**Toolchain state is now checked, not assumed.** In the reference environment iOS could not be built at all — only Command Line Tools were installed, with no `simctl` and no CocoaPods — and no JDK was on `PATH`. The original prompt promised the agent could drive "Xcode, simulators," which was simply false there. The goals now instruct agents to probe for each tool and adapt, so an environment with a full Xcode install proceeds and one without hands iOS off.

**Branch topology must be verified per repository.** In the reference repo the launch branch had never been pushed and `origin` carried only the default branch. One universally true trap survives in the goals: pushing to a branch that is checked out in another working tree fails under `receive.denyCurrentBranch`.

**Rewrite tooling must be verified before planning around it.** In the reference environment `git-filter-repo` was present but non-functional, BFG was absent, and there was no Java runtime — so any history-rewrite plan would have failed on its first command.

**The hardcoded database token is already out of the working tree** — `GroceryApp/App.tsx` now reads from settings or `EXPO_PUBLIC_TURSO_*`. The tokens remain in git history, so rotation is still mandatory, but the source is cleaner than the audit implied.

**Several punch-list line numbers are wrong** (all corrected in the goals): `docker-compose.yml:30`, `family.ts:289` (actually 310), `android/.gitignore:20` (file has 19 lines), `SettingsScreen.tsx:913` (actually 912), and `app.json:26` — the wrong iOS identifier `com.groceryapp.app` is in `docs/deep-linking-setup.md`, not `app.json`.

**Some work is already done.** Release signing via `PANTRYRUN_UPLOAD_*` is implemented (only the debug fallback remains); versions are already coherent; `associatedDomains` and both link-verification templates exist and need only the Team ID and signing SHA-256.

### Three findings that change decisions

**My entitlement recommendation was wrong.** I suggested storing the paid-tier entitlement in the family Yjs document so it syncs E2EE. It would sync — but it would not survive a restart. WatermelonDB persists only `grocery_lists`, `grocery_items`, and `family_members`, and Yjs document state is never persisted at all. Option 2 needs either a schema migration adding an entitlement table or a Yjs-persistence path. G7 puts this in front of you before any IAP code is written.

**The savings number the paid tier sells is computed two different ways.** `trip-plan.ts:252` uses a synthetic per-item worst-case basket (sum of the max price per item across stores), while `stop-optimizer.ts:130` uses a genuine cheapest-single-store baseline. The trip-plan figure is systematically the more flattering one, `TripPlanSheet.tsx:6` documents it inaccurately, and the rendered label is just "💰 You save" with no baseline stated. The listing copy frames it as a one-stop comparison. Charging money for a number computed this way is the same "don't charge for untested logic" problem, one level up.

**`recoverFromPhrase()` is incomplete.** It stores the recovered master key but never writes the seed, the phrase, or the stored-flag under the joined `familyId` — unlike `generateRecoveryPhrase()`. A device that recovers into a family therefore cannot later display its own recovery phrase. This appears in no source document.

Two smaller ones: the grandfathering advice in `05-PREMIUM-FEATURES-PRICING.md` and `MONETIZATION.md` is now stale (gating Trip Optimizer out of v1 means that cohort is empty), and there is a fourth Trip Optimizer marketing reference at `06-MARKETING-KIT.md:49` beyond the three in the store listings.

## Working notes

`GOAL_PROMPT_NOTES.md` in the launch-candidate worktree is the cross-session decision log — every goal instructs the agent to keep updating it in place. `LAUNCH-PUNCH-LIST.md` lives in a *different worktree on a different branch*; the goals cite it read-only so nothing gets written to the wrong checkout.

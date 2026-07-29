# GitHub tracking and execution order

Companion to the seven goals. Covers what can run in parallel, and how to track the work on GitHub without the two traps this repo is currently set up to fall into.

These notes were written against one working copy; the work is now split across three repositories. Treat every specific below as something to confirm in yours. In the reference repo the remote was **public**, the `gh` CLI was installed and authenticated, CI lived at `.github/workflows/ci.yml`, and `origin` carried only the default branch — the launch branch had never been pushed. Check yours with `git remote -v`, `git ls-remote --heads origin`, and `ls .github/workflows/`.

---

## Can the goals run in parallel?

> If you are running this as a three-arm A/B/C comparison, the ordering rules below constrain the sequence **within each arm** — they are not a way to divide work between arms. See [OPERATOR-SETUP.md](OPERATOR-SETUP.md) for the test-methodology notes.

Partly. Two must run alone, two can overlap, and the rest are sequential because they edit the same files.

**Every goal gets its own session regardless of parallelism.** Each goal has one completion condition; putting two in a session gives you an ambiguous target and burns context on work the second goal does not need. Separate session per goal, always.

**Parallel execution requires separate working trees**, not just separate sessions — two agents editing one tree will corrupt each other's changes. Separate clones work; git worktrees are lighter:

```bash
git worktree add ../pantryrun-g2 -b goal/g2-relay-hardening
```

### The dependency graph

| Goal | Touches | Can share a slot with |
|------|---------|----------------------|
| G1 | Outstanding persistence work, branch topology | **Nothing — must be first** |
| G3 | Entire repo history | **Nothing — rewrites every SHA** |
| G2 | `relay-server/` only | G5 |
| G5 | `GroceryApp/src/` only | G2 |
| G4 | `app.json`, `android/`, `ios/`, lockfiles | — |
| G6 | `app.json`, `privacy/`, `audit-package/` | — |
| G7 | Post-submission | — |

**G1 must run first and alone.** It commits the outstanding persistence work and settles branch topology. Any concurrent agent in the same working tree would collide with those changes or sweep them into an unrelated commit.

**G3 must run alone, and early.** A history rewrite changes every commit SHA in the repository. Any branch created before it is orphaned, and any open pull request built on the old history becomes unmergeable. Running G3 while G2 and G5 branches are in flight means rebasing both onto rewritten history — painful and easy to get wrong. Do it when exactly one branch exists.

**G2 and G5 are genuinely disjoint** — one is `relay-server/`, the other is `GroceryApp/src/`. Run them concurrently in separate worktrees.

**G4 and G6 both edit `app.json`** and must not overlap: G4 adds `ios.bundleIdentifier`, G6 removes the Siri entitlement and the microphone and speech purpose strings. Sequence them, G4 first, because G6 verifies the truthfulness of the binary G4 produces.

### Recommended order

```
1.  G1                    (alone)  →  merge to main
2.  G3                    (alone)  →  history rewrite, force-push
3.  G2  ‖  G5             (parallel, separate worktrees)
4.  G4                    (alone)
5.  G6                    (alone)  →  submit to both stores
6.  G7                    (after v1 is live)
```

Sequential-only is also fine and slightly safer. The parallel slot saves one cycle, not a day.

---

## Two CI facts that will bite immediately

**Check whether `npm ci` succeeds before trusting CI.** In the reference repo it failed: the `mobile` job runs `npm ci` against a `package-lock.json` out of sync with `package.json` (missing `expo-image-picker`), reproduced from the committed files in a clean directory. Verify in yours by running `npm ci` in `GroceryApp/`; if it fails, every pull request will be red until the lockfile is regenerated. The lockfile fix is scoped to G4, but it is a one-command regeneration — **do it during G1** so the pipeline is trustworthy for everything that follows. A red baseline trains everyone to ignore CI, which is how the real failure gets missed.

**The `docker` job builds the relay image but never starts it.** That job passed for the entire period the image was crash-looping on boot, because `docker build` succeeds — the missing modules only surface at runtime, when `server.js` requires files the Dockerfile never copied. Add a smoke step to G2 that actually runs the container and polls `/health`. A build that cannot boot is not a passing build.

**CI only triggers on pull requests to `main` and pushes to `main`.** If you adopt an integration branch, update the `on:` block or none of the goal branches get checked.

---

## Branch and PR model

Given a single-owner repo with an agent doing the work, keep it simple: **short-lived branches off `main`, one per goal, merged by pull request.**

```
main
 ├── goal/g2-relay-hardening
 ├── goal/g5-v1-product-posture
 └── goal/g4-buildable-signed-artifacts
```

Don't add a long-lived `develop` or `release/v1` branch. With one owner and seven sequential-ish goals it buys nothing and it silently disables CI, which only watches `main`.

**One pull request per goal.** The goal's `<done_when>` block is the PR description — it is already a measurable checklist, which is exactly what a reviewer needs. Have the agent open it with `gh pr create` and paste the verification transcript (test counts, `tsc` exit status, the `adb` sequence for G1) into the PR body. Evidence in the PR is what makes the work auditable six months from now.

Squash-merge, so each goal is one commit on `main` and `git log` reads as the launch narrative.

**Never let an agent force-push a shared branch outside G3.** G3 is the one goal where rewriting published history is the point, and it needs your explicit confirmation before it runs.

---

## Tracking with issues

Use one GitHub issue per goal, plus issues for the deferred items. The punch list has 73 defects and 22 launch blockers; issues are what keep that from decaying into a stale markdown file.

```bash
gh issue create --title "G2: Harden the relay and the family-join trust model" \
  --body-file launch-goals/G2-harden-the-relay-and-the-family-join-trust-mod.md \
  --label "launch-blocker"
```

Reference the issue in the PR body (`Closes #12`) so merging closes it automatically. Suggested labels: `launch-blocker`, `p0`…`p3`, `security`, `store-compliance`, `post-launch`.

Worth filing as issues immediately, because they are decisions rather than tasks and will otherwise be forgotten: the entitlement-persistence problem (the Yjs approach doesn't survive restart), the two divergent savings calculations, and the incomplete `recoverFromPhrase()`.

Keep `GOAL_PROMPT_NOTES.md` as the running decision log — it captures *why*, which issues capture badly. Issues track state; notes track reasoning. Both, not either.

---

## Public-repo cautions

Confirm whether your repository is public (`gh repo view --json visibility`). In the reference repo it was, and its history contains two live database tokens and a blind-RSA issuer private key. Where that holds, until the rewrite completes:

- **Never push a branch containing a new secret**, even briefly. Push events are indexed by scrapers within seconds, and force-pushing afterwards does not un-publish anything.
- **Turn on GitHub secret scanning and push protection** (Settings → Code security). It's free on public repos and would have caught the original token commit.
- After the rewrite, ask GitHub Support to garbage-collect the old objects. Force-pushing rewritten history leaves the original commits reachable by SHA on GitHub's servers, so a local history rewrite alone does not make a leaked token unreachable through the web UI. Note this must be done **per repository** — rewriting one does nothing for the others.
- Rotation still comes first. Purging history reduces exposure; only rotation ends it.

Verify your rewrite tooling before planning around it. In the reference environment `git-filter-repo` was present but non-functional (a dead Python 3.7 shebang), BFG was absent, and there was no Java runtime — so the first command would have failed. Check with `git filter-repo --version` and `java -version`.

---

## Release tagging

Tag `main` at submission, not at merge — the tag should mark what was actually sent to review.

```bash
git tag -a v1.30.0 -m "v1.30.0 — first App Store and Play submission"
git push origin v1.30.0
```

If a store rejection forces changes, bump to `v1.30.1` and tag again. The tag history should let you answer "what exactly did Apple see?" without archaeology.

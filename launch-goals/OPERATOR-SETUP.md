# Operator setup

How to run these goals across different models, harnesses, folders, and repositories — including as a three-arm A/B/C comparison.

---

## What each goal assumes about your environment

Nothing, by design. Every goal now opens with a `<setup>` block that tells the agent to establish three things before doing any work:

1. **The repository root of its working copy.** Every path in the prompt is relative to that root — `GroceryApp/src/...`, `relay-server/server.js`. No absolute paths remain.
2. **Which branch carries the launch work.** The goals state plainly that the default branch may not have it and must be verified. This matters: an earlier audit ran against a stale default branch and wasted a full pass on defects that were already fixed.
3. **That the app lives in `GroceryApp/` and the relay in `relay-server/`** relative to that root.

Line numbers are cited throughout, but the goals now instruct agents to locate code by grepping for the named symbol rather than trusting a line number, because working copies drift.

## Machine assumptions are now checks, not facts

The first version asserted things true only of the machine it was written on — that Xcode was absent, that no JDK was on `PATH`, that a particular Android AVD existed, that `git-filter-repo` was installed but broken. On a different machine those statements are simply false, and an agent that believes them will make bad decisions confidently.

Each is now a check-then-adapt instruction: the command to run, what each outcome means, and what to do in each case. An agent on a machine with a full Xcode install will discover that and proceed; an agent on Linux will discover iOS work is impossible there and hand it off. Neither is told what it will find.

## Harness differences

The goals no longer assume any particular harness. Two things vary and are worth setting up deliberately:

**Completion conditions.** Each goal file has a second section holding a short, measurable completion condition under 4,000 characters. If your harness has a native goal or completion-condition feature, use it. If not, paste that block into the prompt as a "you are done when" statement, or keep it beside you as the acceptance test. It is written to be provable from what the agent surfaces in its own output — pasted command results, test counts, exit statuses — rather than requiring an evaluator to run anything.

**Auto-loaded project context.** Several harnesses read a project file into every session — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and others. This is worth using: put the ground truth that all seven goals share (branch topology, the credential rule, owner decisions, verification discipline) in whichever file your harness reads, and each session picks it up without you pasting it. There is a ready-made version at the root of the reference working copy; copy it and rename it to whatever your harness expects.

One caution if you do this: some harnesses also read context files from **parent directories**. If your checkout sits under an unrelated project's folder, that project's instructions may load into every session too. Check what your agent is actually being handed before blaming the prompt for odd behavior.

**Permissions.** These goals are long-running and shell-heavy — `git`, `npm`/`npx`, `jest`, `tsc`, `adb`, `gradlew`, `docker`, `gh`. If your harness prompts per command, a run will stall repeatedly. Pre-approve the read-and-build commands, but deliberately leave `git push --force` and anything in the credential-rotation goal behind a confirmation. Those are the operations where an interruption earns its keep.

---

## Running this as an A/B/C test

Three models run the **same seven goals** in three replicated environments, and you compare outcomes. The goals need no per-arm changes — they are byte-identical, carry no absolute paths, assert no machine state, and name no harness. That uniformity is what makes the comparison mean anything, so resist the urge to "help" one arm by editing its copy.

### Decide first: per-goal comparison, or end-to-end?

This is the one methodological choice that changes how you run it.

**Per-goal.** Reset all three environments to the same baseline before each goal. Every arm attempts G4 from identical starting conditions, so the result isolates that goal. You get seven clean comparisons and can tell which model is strong where. The cost is the reset discipline, and you learn nothing about whether a model can sustain a long campaign.

**End-to-end.** Each arm runs G1 through G6 in sequence off its own prior output. This measures the thing you actually care about — can this model take a project from here to submitted — but the arms diverge after the first goal. By G4 they are working on materially different codebases, so a later-goal difference may reflect an earlier mistake rather than that goal's difficulty. Interpret late results as cumulative, not isolated.

Mixing them is fine if you are explicit: run end-to-end, and additionally snapshot the shared baseline before each goal so you can re-run any single goal head-to-head later.

### Three confounds worth controlling

**Your own responses.** Several goals stop and hand off — the upload keystore, the Apple Team ID, console work, and the entitlement decision in G7. If you answer one arm more helpfully than another, you are measuring your own consistency as much as the models'. Write the handoff answers once, in advance, and paste the same text to each arm.

**Cross-arm contamination.** Three replicated folders now exist on disk with near-identical contents. An agent that wanders into a sibling arm's folder corrupts both the work and the experiment. Each goal's `<setup>` block already forbids this explicitly, but confirm that each arm's remote is genuinely its own — if all three push to a single shared remote they will collide on branch names, and the test is compromised before it starts. Verify with `git remote -v` in each.

**Ordering constraints still apply within each arm.** The dependency analysis is not about coordinating three workers; it constrains the sequence any single arm must follow. G1 first, G3 alone, G4 before G6 because both edit `GroceryApp/app.json`, G7 only after submission. G2 and G5 touch disjoint trees and could overlap, but for a clean comparison run every arm in the identical order rather than letting one parallelize.

### Scoring

The completion condition at the bottom of each goal is already your rubric — measurable, and provable from the agent's own output, which is what you need for a fair comparison. Score each arm pass/fail against it, then look at the qualitative gap: how much evidence was pasted rather than asserted, how many real defects the agent found that the goal did not name, and how often it claimed success without proof.

`GOAL_PROMPT_NOTES.md` is an unusually good comparison artifact here. Each arm writes its own reasoning log, so diffing the three tells you how each model *thought*, not merely what it produced.

One failure mode to watch for specifically, because this project has already been burned by it: an arm that reports green tests without verifying the underlying behavior. The suite once passed 465 tests against an app that saved nothing. A model that catches that class of problem is worth more than one that finishes faster.

## Cross-session continuity

`GOAL_PROMPT_NOTES.md` at the repository root is the running decision log. Every goal instructs the agent to update it in place, so the next session inherits the reasoning and not merely the diff. Create it if it is not there.

In an A/B/C run each arm keeps its own copy, and they will diverge. Do not reconcile them — the divergence is data. Keep all three and diff them when scoring.

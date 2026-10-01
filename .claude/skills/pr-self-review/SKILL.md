---
name: pr-self-review
description: "Self-review of the current branch's local changes before they are pushed or a pull request is opened. Collects every change against the base branch (commits, staged, unstaged and untracked files), routes each changed file to the project skills that cover it — UI skills on client/, backend architecture skills on server/ and reviewer-core/ — runs pnpm arch:check, reviews each slice with a subagent, and returns one report with a pass/blocked verdict. Any CRITICAL finding blocks the change. Use before running git push or gh pr create, when the user asks to self-review, check their changes, run a pre-PR review, or asks whether the branch is ready for a PR, and whenever the pr-self-review gate denies git push or gh pr create."
metadata:
  version: "1.2.0"
  updated: "2026-09-27"
---

# PR self-review

Review the branch's local changes with the project's own skills before a PR exists, and **block
the change if any CRITICAL is found**. The scripts do the deterministic work: diff, routing,
validation, verdict. You orchestrate the reviewers and talk to the user.

All scripts live in `.claude/skills/pr-self-review/scripts/` (below: `$S`). Run them from the
repository root with `node`.

## Workflow

### 1. Prepare

```bash
node $S/prepare.mjs            # base: origin/main
node $S/prepare.mjs --base feature/finding-counter
```

The script prints a JSON summary. If `status` is `empty`, say there is nothing to review and stop.
Otherwise show the user the files by package, the tasks (skill → file count, model), and every
warning:

- `unrouted_skills`: a skill in `.claude/skills/` that is missing from `routing.json`. Tell the
  user to add it, or to mark it `review: false`.
- `uncovered_files`: changed files that no skill reviews.
- `dirty: true`: the review includes uncommitted changes, which a PR would not contain until they
  are committed.

A PR branched from another feature branch should be reviewed against that branch (`--base`),
or the diff will include the parent's commits.

### 2. Review: run everything in parallel, in one message

- If `arch_check` is `true`: `node $S/arch-check.mjs`.
- For **every** task: one `Agent` call with `subagent_type: general-purpose`, `model` = the
  task's `model`, and this prompt: ``Read `<prompt_path>` and follow it exactly.`` The prompt
  file is [references/reviewer-prompt.md](references/reviewer-prompt.md), filled in for that task.

Wait for all of them. Do not review the files yourself instead of a subagent: each reviewer
must see only its own skill.

### 3. Finalize

```bash
node $S/finalize.mjs
```

It prints the report and ends with `VERDICT pass|blocked {...}`. If `failed_tasks` lists
reviewers (no file, invalid JSON, a wrong field), re-run **only those** once, adding the error
to the prompt, then finalize again. A task that fails twice stays failed, and the verdict
stays `blocked` (reason: incomplete). Unchecked code does not pass.

### 4. Report

Show the report as the script printed it. Then:

- **pass**: say so. The gate will let `git push` and `gh pr create` through for exactly these
  changes.
- **blocked**: do **not** push or open a PR, and do not offer to. For each CRITICAL, give the fix. Offer
  to apply the fixes, then run the review again.

## Waiving a CRITICAL

Only when **the user explicitly asks** to waive a specific finding, and gives a reason. Never
suggest a waiver as the way out of a block, and never waive on your own judgement.

```bash
node $S/waive.mjs F2 --reason "false positive: the SQL is built from a constant enum"
```

The waiver is stored in that run only. Any change to the reviewed files makes the verdict stale,
and the next review starts with no waivers.

## The gate

Two hooks enforce the verdict, and both call the same check (`scripts/lib/verdict-check.mjs`):

- `scripts/gate.mjs`, a Claude Code `PreToolUse` hook on `Bash` registered in
  `.claude/settings.json`, denies `git push` and `gh pr create` when the committed changes have
  no passing verdict.
- `.githooks/pre-push` → `scripts/pre-push.mjs`, a git hook, does the same for every push from a
  terminal or an IDE, judging each pushed commit. `./scripts/dev.sh` enables it
  (`git config core.hooksPath .githooks`).
 Review
with the `--base` the push should be judged against: the gate reuses the base of the latest run. When it denies, run this skill; do not try to get around it.

## What decides CRITICAL

[references/critical-rules.md](references/critical-rules.md). In short: a new
`arch:check` violation, or one of the listed rule IDs from a skill with `can_block: true`, on a
changed line. Everything else is WARNING or lower. The routing itself is
[routing.json](routing.json).

## Files

| Path | Role |
|---|---|
| `routing.json` | skill → globs, `can_block`, `critical_rules`, model; exclusions |
| `scripts/prepare.mjs` | diff + routing → `.devdigest/self-review/runs/<run>/` |
| `scripts/arch-check.mjs` | `pnpm arch:check` → `arch.json` (new violations only) |
| `scripts/finalize.mjs` | validation, clamping, dedup → `verdict.json`, `report.md` |
| `scripts/waive.mjs` | waives one CRITICAL of the latest run |
| `scripts/gate.mjs` | the Claude Code `git push` / `gh pr create` hook |
| `scripts/pre-push.mjs` | the git pre-push hook body, called from `.githooks/pre-push` |
| `scripts/lib/verdict-check.mjs` | the shared "may these commits be published" decision |
| `scripts/test/` | `node --test '.claude/skills/pr-self-review/scripts/test/*.test.mjs'` |

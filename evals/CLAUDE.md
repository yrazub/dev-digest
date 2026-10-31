# `@devdigest/evals` — evals for the harness itself

Tests the things that steer the agent — skills, subagents and the `CLAUDE.md` routing — not the
product code. Product code is tested by the suites in `../TESTING.md`.

## Before answering

**Read the matching document before you touch a case or the runner.**

| If the task touches… | Read first |
|---|---|
| a tier, a case field, a command, an environment variable, the records files | `README.md` — "Three tiers", "Case layout", "Commands & parameters" |
| a skill or agent case | the skill's own `SKILL.md` first: practices must be checkable from what the skill actually says |
| a workflow case (CLAUDE.md routing, activation, dispatch) | the `CLAUDE.md` table the case routes through; the prompt must not name the document |
| how many runs to take, or how to read a pass rate | `README.md` — "Records, statistics, flags", then `docs/eval-stats-upgrade.md` |
| which run to do after a change | `README.md` — "Which change → which run" |
| a failure that smells familiar | root `../INSIGHTS.md` — grep for the symptom, and **append** through the `engineering-insights` skill |

If nothing matches, proceed.

## Commands

pnpm. Run from this folder.

| | |
|---|---|
| `pnpm eval:quality` | static check of skills and agents. No Claude call, free, safe in CI |
| `pnpm eval:skills` · `eval:agents` · `eval:workflow` | the three tiers. **Each calls Claude** on the subscription |
| `pnpm vitest run skills/<name>` | one skill (`agents/<name>` for one agent) |
| `pnpm eval:repeat <path> -n 2 --label x` | stability of one thing. `-n` is capped at 2 |
| `pnpm eval:delta <labelA> <labelB>` | one version against another |
| `pnpm eval:benchmark <path> -n 2` | with the artifact against without it |
| `pnpm typecheck` | `tsc --noEmit` |

`EVAL_QUIET=1` silences the per-run trace. `EVAL_CONFIG=baseline` skips artifact injection.
`EVAL_MODEL` defaults to Haiku, not to the `model:` of the agent under test.

## Where things live

| | |
|---|---|
| `src/` | the engine: `dsl/` (case kinds), `runtime/` (`run-claude.ts`, the SDK driver), `scoring/` (judge, pattern match), `records/` (`record.ts`, stats, benchmark), `repeat.ts`, `delta.ts` |
| `skills/<name>/<name>.eval.ts` | wires a skill to its cases |
| `.claude/skills/<name>/evals/*.cases.ts` | **the skill's cases live with the skill**, plus `fixtures/` and `case.yaml` folders next to them |
| `agents/<name>/` | agent cases and `fixtures/*.diff` |
| `workflow/review-workflow.cases.ts` | CLAUDE.md routing, activation and dispatch |
| `results/` | `records.jsonl`, `repeat-<label>.json`, `outputs/<run>/<case>.md` — local output |

## Conventions

- **A practice states one thing.** No "and", no "or": a conjunction lets a half-right answer pass
  or a half-wrong one fail. The judge scores each practice against the answer format the skill
  asks for, so a practice the format cannot show will never pass.
- **A rule goes only where the document states it.** Do not demand a rule ID that exists
  nowhere in the repository, and do not test that the answer quotes a line verbatim — both only
  measure whether the model copies text from the prompt.
- **A case that is always 0/N or always N/N tells nothing.** Cut it, or rewrite it until it
  fails when the rule it covers is removed. Check by breaking the rule on purpose, running, and
  restoring it (`eval:repeat --label broken`, then `restored`, then `eval:delta`).
- **A workflow case is judged by the tool-call trace, not by the answer text.** Its prompt
  describes the task and asks the agent to follow this repo's guidance; it never names the
  document it expects to be read. A routing case asserts both hops: the module `CLAUDE.md`, then
  the document it points to.
- A negative case (the skill must *not* activate) is part of every activation case.
- Sessions are read-only. `MUTATING_TOOLS` in `src/runtime/run-claude.ts` stays in
  `disallowedTools`.
- Commit a broken skill never; a deliberate break is restored before the commit.

## Gotchas

- **`bypassPermissions` turns `allowedTools` into an auto-approve list, not a restriction.** The
  read-only guarantee comes from `disallowedTools`; without it a session ran `Bash`.
- **A workflow record's outcome comes from the case's assertions** (the `passed` flag in
  `src/dsl/case.ts`). It was once `!isError`, so a session that hit `maxTurns` after the
  evidence was in counted as a failure.
- **`eval:repeat`'s summary can attribute practices to the wrong case** when a case's practice
  set changed between two series. Compare from `results/records.jsonl` directly.
- **Nested `CLAUDE.md` files are not loaded** in a session that never works in that folder. The
  agent only reads `server/CLAUDE.md` when the prompt tells it to follow the guidance.
- A subagent case runs the agent's body on `EVAL_MODEL`, with the tools its frontmatter declares.
  It does not exercise the `model:` the agent sets for itself.
- A pass rate over two runs excludes breakage; it does not show stability. Say "n=2" when you
  report one.
- CI (`.github/workflows/evals.yml`): `quality` (`eval:quality`) is blocking. `skills`, `agents`
  and `workflow` run only what the changed files affect, on OpenRouter (DeepSeek for skills,
  Gemini for agents and workflow; knobs `SKILLS_MODEL` and `TOOL_MODEL`). `workflow` is
  informational, and none of them is a required check yet. `agents` and `workflow` re-run only
  their failed tests on `FALLBACK_MODEL` (Haiku) through `scripts/run-with-fallback.mjs`; the job
  summary says which model passed each test. The model differs from the local Haiku
  runs, so a case tuned on Haiku can be red there.

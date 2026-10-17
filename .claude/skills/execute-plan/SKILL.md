---
name: execute-plan
description: "Executes an approved Implementation Plan from specs/plans/ with the project agents — implementer and test-writer phase by phase, then plan-verifier and architecture-reviewer, doc-writer, the hermetic e2e run, engineering-insights and /pr-self-review — keeping the progress in a state file (.devdigest/sdd/<feature>/state.json) so a fresh chat resumes where the last one stopped. Runs steps 6–11 of the Feature workflow in .claude/agents/README.md, in multi-agent or single-agent mode as the plan says. Use when the user runs /execute-plan <plan>, or asks to build, execute, continue or resume an approved plan. Does not write specs or plans, and never pushes."
metadata:
  version: "1.0.0"
  updated: "2026-10-16"
---

# Execute a plan

You are the orchestrator. The agents do the work; you pass them paths, record what their reports
say in the state file, and bring the user what needs a person. The state file — not this
conversation — is the memory of the run, so a new chat loses nothing.

`$S` below is `.claude/skills/execute-plan/scripts/state.mjs`, run with `node` from the
repository root. Every command prints the summary and a `NEXT:` line. **Do what `NEXT` says**,
record the result with `$S`, and read the new `NEXT`.

## Keep your own context small

The orchestrating chat is the most expensive part of a run: every turn re-reads all of it. So:

- **Do not read the plan, the spec or the diff yourself.** Agents read them. You need the phase
  numbers and titles, which `$S show` prints.
- **Do not fix code or tests yourself** in multi-agent mode — send the finding back to the agent
  that owns it.
- **From each report take only what the state needs** (below), and tell the user the status line
  plus anything that needs a decision. Do not paste whole reports.
- **On `CHECKPOINT`, stop.** Tell the user to open a new chat and run the command it names. The
  default is a new chat every 3 committed phases (`--per-chat <n>` on `start` changes it), and the
  final checks always begin in a new chat — also after a fix phase. Do not re-run `start` in the
  same chat to get past it. If the user asks to continue here anyway, say once what it costs
  (every later turn re-reads the whole chat; in the L05 run the one chat that kept going was ~70%
  of the feature's 505M tokens — `docs/retros/ledger.md`), then do as they decide.

## 1. Start or resume

```bash
git fetch origin && git merge-base origin/main HEAD && git rev-parse origin/main
node $S start specs/plans/<feature>.md            # first run: --base <ref> when not origin/main
```

If the branch is behind `origin/main`, say so before any phase runs. If `start` refuses because
the plan changed, ask the user whether the changed plan was approved; only then re-run with
`--accept-plan-change`. A plan is changed by the `implementation-planner`, never by hand.

## 2. Each phase (multi-agent)

**implementer** — `NEXT` gives the plan path, the phase and the baseline statement; pass all
three. From its Implementation report:

| Report says | Record |
|---|---|
| `complete` | `$S phase <plan> <n> code-done`, one `--deviation "<text>"` per Deviations row |
| `partial` or `blocked` | `$S phase <plan> <n> blocked --reason "<one line>"`, then take the report to the user |
| Insight candidates / For reviewers | `$S note <plan> insight "<text>"` / `$S note <plan> reviewer "<text>"`, one per line |

**test-writer** — pass the plan path, the phase and the implementer's "Existing tests failing"
table, copied as it is (the only part of a report you hand over verbatim). From its Test report:

- `green` → `$S phase <plan> <n> green --verify "<result line>"`, one `--verify` per Verification
  row; the next phase's implementer gets these lines as its baseline.
- Suspected regressions, suspected product bugs or "Needs a production change" → run
  `implementer` again for the same phase with those items, then `test-writer` again.
- "Existing tests edited" is not empty → check that every row quotes a plan or spec item; a row
  without one goes to the user.
- Insight candidates → `$S note … insight`.

**manual check** — if the phase has a `Verify (manual, screenshots)` line, run it yourself before
the commit, once the test-writer is green. Check memory first (`memory_pressure`), ask the user to
start the stack if it is down, use one browser tab with scaled screenshots or region zooms (never a
full accessibility tree in the chat), and close the tab after. A mismatch with the design goes back
to `implementer` for the same phase.

**commit** — stage the files both reports list, commit them together, record the commit:

```bash
git add <files> && git commit -m "<type>(<scope>): <what the phase delivers>"
node $S phase <plan> <n> committed --commit "$(git rev-parse HEAD)"
```

One short conventional subject line, no body unless it is needed, no `Co-Authored-By` trailer.

**single-agent mode** — `NEXT` says to build the phase yourself: run
`node .claude/agents/scripts/plan-phase.mjs <plan> <n>`, read that slice only, build the file
table and the test work order with the skills each row names, run `Verify (phase)`, then record
`green` and commit as above.

## 3. After the last phase

Follow `NEXT` in this order; record each with `$S final <plan> <step> <status> [--note "…"]`.

1. **`verify` and `arch` in parallel.** Give `plan-verifier` the plan path, the base and the
   declared deviations from `$S show <plan> --notes`. Give `architecture-reviewer` mode `change`,
   the changed-file list (`git diff --name-status <base>...HEAD`) and a patch written to
   `.devdigest/sdd/<feature>/change.patch` (`git diff <merge-base> > …`). PASS / no CRITICAL or
   WARNING → `pass`. Otherwise `fail`, and the fix round below. In single-agent mode both checks
   are optional: ask, and record `skipped` when the user declines.

   **Fix round.** Run `implementation-planner` with pass `amend`, the plan path and the gaps (the
   Gaps section of the Verification report, the CRITICAL and WARNING findings of the review, each
   with its ID). Show the user its Plan amendment; its "For the user" items — spec gaps go to
   `spec-creator` — are settled first. On approval, apply each Replacement as one exact-match
   edit, insert the New phase after the last phase and before `## Out of scope`, commit the plan,
   and run `$S start <plan> --accept-plan-change`: the new phase comes up as the next step and
   every final check starts again.
2. **`docs`** — `doc-writer` with the plan path and the changed-file list; apply its "For the main
   session" items. `skipped` when nothing documented changed.
3. **`e2e`** — `cd e2e && npm run e2e:hermetic`. It needs Docker and no dev server sharing
   `client/.next`; if `./scripts/dev.sh` is running, ask the user to stop it. `pass` only on a full
   pass.
4. **`insights`** — record the insight candidates (`$S show <plan> --notes`) through the
   `engineering-insights` skill, commit what is left, then `done`.
5. **`self-review`** — `/pr-self-review`. `pass` only on a pass verdict.

When `NEXT` says all steps are done, report to the user and ask before any push or PR.

## Commands

| Command | Use |
|---|---|
| `$S start <plan> [--base <ref>] [--per-chat <n>] [--accept-plan-change]` | create or resume; resets the per-chat count |
| `$S show <plan> [--notes] [--json]` | the summary; `--notes` lists deviations, insight candidates and reviewer notes |
| `$S phase <plan> <n> <pending\|code-done\|green\|committed\|blocked> [--verify …] [--deviation …] [--commit <sha>] [--reason …]` | record a phase |
| `$S note <plan> <insight\|reviewer> "<text>"` | record a note |
| `$S final <plan> <verify\|arch\|docs\|e2e\|insights\|self-review> <pending\|pass\|fail\|skipped\|done> [--note …]` | record a final step |

The rules the script enforces: phases close in order; `committed` needs `--commit`, `blocked`
needs `--reason`; final steps wait for the last phase; a phase committed after the final checks
started resets them; a plan that changed is refused until accepted, and a phase with recorded
work cannot disappear from it. Tests:
`node --test .claude/skills/execute-plan/scripts/test/*.test.mjs`.

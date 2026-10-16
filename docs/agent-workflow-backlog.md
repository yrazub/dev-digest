# Agent workflow backlog

Improvements to the spec-driven agent chain in [`.claude/agents/`](../.claude/agents/README.md)
that were proposed in the 2026-10-16 audit and not built yet. Each item names the problem, the
change, the files it touches and what it should save. Remove an item when it lands, and record
the decision in the root [`INSIGHTS.md`](../INSIGHTS.md).

Already built from the same audit: the one-phase plan slice (`plan-phase.mjs`), the
`/execute-plan` skill with its state file, the implementer reading the spec, the planner's
`amend` pass, and a live check of the `spec-creator` write guard.

## Where the tokens go

Measured from the local transcripts of the L03 Intent Layer run (root `INSIGHTS.md`, Tool &
Library Notes, 2026-10-16):

| Who | Tokens read (cache) | Per run |
|---|---|---|
| Orchestrating main chat | 318M — 600 turns, context up to 848k | — |
| `architecture-reviewer` | 41M over 4 runs | 11.6M, 91 turns |
| `plan-verifier` | 48M over 4 runs | 8.7M |
| `implementer` | 34M over 12 runs | 2.1M, 31 turns |
| `test-writer` | 26M over 8 runs | 2.3M |

Cost is turns × context, not the size of command output: `implementer`'s test output averaged
≈ 6 KB per run. Measure again after the next feature, to see what the built items saved.

## Items

| ID | Item | Payoff | Effort |
|---|---|---|---|
| B1 | One verification command | high | medium |
| B2 | Delta re-checks after a fix | high | medium |
| B3 | Targeted test runs while iterating | medium | low |
| B4 | Plan size budget and "Interfaces to match" | medium | low |
| B5 | Skill loading in `implementer` | medium | low |
| B6 | `test-writer` reuses the implementer's runs | low | low |
| B7 | `architecture-reviewer` only where it adds something | medium | low |
| B8 | A committed cost-measurement script | low | low |

### B1 · One verification command

- **Problem.** `implementer` spends 3–6 Bash turns per check (`typecheck`, `arch:check`, the unit
  lane, the integration lane), each one a turn that re-reads the whole context; `plan-verifier`
  runs ≈ 16 such commands per run.
- **Change.** `scripts/verify.mjs <package> [--unit|--it|--related <files>]` runs the package's
  checks one after another with its own manager and prints compact JSON: one line per command
  with its exit code and result line, then only the failing tests with their first error line.
  The `Verify` lines in the planner template call it; `implementer`, `test-writer` and
  `plan-verifier` use it.
- **Touches.** a new script and its test; `implementation-planner.md` (template); the Step 5 /
  Step 7 / Step 4 command rules of the three agents.
- **Watch.** A skipped integration file must still be reported as not run (T11), and the
  per-package manager rule must hold.

### B2 · Delta re-checks after a fix

- **Problem.** After a fix round, `plan-verifier` and `architecture-reviewer` re-check the whole
  change: in Intent Layer each ran four full times at ≈ 10M tokens a run.
- **Change.** A `recheck` mode for both: input is the previous report, the fix phase's patch and
  its gap IDs. `plan-verifier` re-checks the gap items, every item whose files the fix touched,
  and re-runs every `Verify` command; `architecture-reviewer` reviews the fix patch plus the
  importers of what it changed. `/execute-plan` uses it for the checks after a fix phase.
- **Touches.** `plan-verifier.md`, `architecture-reviewer.md`, `execute-plan/SKILL.md`,
  `state.mjs` (keep the last report path per final step).
- **Watch.** A fix can break an item it did not name — hence "every item whose files it
  touched" and the full command re-run.

### B3 · Targeted test runs while iterating

- **Change.** While fixing, `implementer` runs `vitest related <changed files> --run` (vitest
  2.1.9 supports it) and the full suite once at the end. The server integration lane runs only
  when the phase touches the database, a route or the seed, and the plan's `Verify (code)` says
  so.
- **Touches.** `implementer.md` Step 5; `implementation-planner.md` (when to list the
  integration lane).

### B4 · Plan size budget and "Interfaces to match"

- **Problem.** The L03 plan is 877 lines / 165 KB; its `## Design` section restated what now
  belongs in the spec. `implementer` makes ≈ 7.5 exploration calls (`cat`, `grep`) per run to
  find the signatures it must match.
- **Change.** The planner keeps a phase to about 120 lines and cites `R-<MODULE>-n` instead of
  restating it; each phase gets one `**Interfaces to match:**` line with the exact signatures
  and `path:line` of the code the phase calls or implements.
- **Touches.** `implementation-planner.md` (Rules, template), `plan-verifier.md` (the new line is
  not an item).

### B5 · Skill loading in `implementer`

- **Problem.** Skill bodies stay in context for every turn: `fastify-best-practices` and
  `next-best-practices` ≈ 13k tokens each, and `security` is loaded in every server phase.
- **Change.** Load in full only the skills that carry `critical_rules` for the phase's files
  (`onion-architecture`, `frontend-ui-architecture`, `react-best-practices`). For the others,
  read the text of the rule IDs the plan's "Rules to respect" names (grep the `SKILL.md`); their
  full review is `/pr-self-review`'s job.
- **Touches.** `implementer.md` Step 3.

### B6 · `test-writer` reuses the implementer's runs

- **Change.** `test-writer` Step 2 starts from the implementer's Verification table instead of
  re-running every suite; while writing it runs only the test files it touches, and the full
  `Verify (phase)` once, at Step 7, as today.
- **Touches.** `test-writer.md` Step 2; the task text `/execute-plan` passes.
- **Watch.** Fresh-context distrust (C1): the closing Step 7 run stays mandatory.

### B7 · `architecture-reviewer` only where it adds something

- **Problem.** It is the most expensive agent per run and overlaps with the architecture
  reviewers of `/pr-self-review` on the same diff.
- **Change.** `/execute-plan` runs it when the change spans packages or touches contracts,
  migrations or the review pipeline, and records `arch skipped` otherwise; the planner's
  execution-mode recommendation states which applies. For the server, its input already includes
  the `arch:check` line, so it stays off the import graph.
- **Touches.** `execute-plan/SKILL.md`, `state.mjs` (`nextAction`), `implementation-planner.md`
  (review pass), `.claude/agents/README.md`.

### B8 · A committed cost-measurement script

- **Change.** Commit the transcript reader used for the audit as
  `.claude/agents/scripts/agent-cost.mjs <session-id>`: tokens per agent type, turns, largest
  context, and the context growth per tool. It reads `~/.claude/projects/<project>/` and prints
  nothing from message content.
- **Why.** The items above are judged by their saving; without the script the comparison is
  re-derived by hand each time.

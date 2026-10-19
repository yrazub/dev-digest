# Workflow Retro — l05-pr-brief

**Run:** L05 PR Brief, spec → plan → `/execute-plan` (11 phases, two of them review fixes) → final
checks → PR · 49 sub-agents (0 nested) + 6 main sessions · mode multi-agent · data: deep (JSONL
journals of all six sessions, `analyze_journals.py`)

Prices: first-party API rates confirmed 2026-10-19 — Opus 5.5 $4 / $20 per MTok in/out, cache read
$0.20; Sonnet 5.5 $2 / $10, cache read $0.20. Cache writes are priced at the 1-hour rate, 2× input
($8 Opus, $4 Sonnet): an assumption, since Claude Code writes 1-hour cache entries. The run was on a
subscription, so the dollars are the API-equivalent cost, not a bill.

## Cost report

### Per session

| # | Session | What it did | Sub-agents | Input side (cache read + write + fresh) | Out | Tools | Sub-agent $ | Main $ | Total $ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `9d5b9939` | spec (discovery → write) and plan (review → plan → cross-model amend) | 2 | 117.7M | 0.42M | 669 | 74.80 | 20.28 | **95.08** |
| 2 | `812fa5da` | phases 1–5 (contracts, server) | 10 | 24.7M | 0.09M | 465 | 11.33 | 2.16 | 13.50 |
| 3 | `ac31cc4b` | phases 6–9 (client, e2e) with manual browser checks | 7 | 34.4M | 0.10M | 407 | 7.74 | 12.25 | 19.99 |
| 4 | `9f8bfe84` | final checks round 1 → amend → fix phase 10 | 5 | 33.7M | 0.08M | 409 | 18.64 | 2.87 | 21.51 |
| 5 | `f8fd6a9d` | final checks round 2 → amend → fix phase 11 | 5 | 33.4M | 0.09M | 343 | 15.38 | 4.41 | 19.79 |
| 6 | `b4743928` | final checks round 3, docs, e2e, insights, `/pr-self-review` (17 reviewers), PR | 20 | 104.6M | 0.24M | 817 | 33.70 | 27.54 | 61.24 |
| | **Total** | | **49** | **348.5M** | **1.01M** | **3,110** | **161.59** | **69.51** | **≈ 231** |

### Per agent type (all sessions)

| Agent | Runs | Input side | Out | $ | $ per run |
|---|---|---|---|---|---|
| `implementation-planner` | 3 (review+plan, 2 amends) | 49.2M | 0.12M | 44 | 14.7 |
| `spec-creator` | 1 (discovery + write, resumed) | 38.4M | 0.10M | 38 | 38.0 |
| `architecture-reviewer` | 3 | 23.7M | 0.05M | 18 | 6.0 |
| `plan-verifier` | 3 | 34.6M | 0.01M | 16 | 5.3 |
| `test-writer` | 11 | 22.3M | 0.07M | 13 | 1.2 |
| `doc-writer` | 1 | 39.2M | 0.05M | 12 | 12.0 |
| `general-purpose` (`/pr-self-review` reviewers) | 17 | 10.9M | 0.01M | 11 | 0.6 |
| `implementer` | 10 | 19.8M | <0.01M | 9 | 0.9 |
| main sessions (orchestrator) | 6 | 110.5M | 0.61M | 70 | 11.6 |

**Totals:** input side 348.5M (327.8M cache read · 20.6M cache write · <0.01M fresh) → 1.01M out ·
cache hit 94% · 3,110 tool calls · cost ≈ $231 (API-equivalent).

**Cost per useful output:** ≈ $21 per committed phase (11) · ≈ $2.7 per acceptance criterion
implemented and verified (84) · the 11 build phases themselves (implementer + test-writer, sessions
2–3) ≈ $33, about 14% of the total.

**Launch order:** spec-creator → implementation-planner (review, then plan) → [cross-model review,
outside Claude] → planner amend → (implementer → test-writer) × 9 → (plan-verifier ‖
architecture-reviewer) → planner amend → (implementer → test-writer) phase 10 → (verifier ‖ arch) →
amend → phase 11 → (verifier ‖ arch) → doc-writer → e2e → insights → 17 reviewers in batches of
≤ 4. **Critical path:** the spec stage — `spec-creator` was alive for 15.1 h (discovery, the
user's answers, the write pass) and cost $38 alone.

## What went well

- **The build phases were cheap and clean.** Ten implementer runs cost $9 and eleven test-writer
  runs $13; each phase took one implementer run and one test-writer run, with no re-spawn.
- **Cache efficiency stayed at 94%**, the same as the L05 Project Context run, so the prompt
  prefixes stayed stable across agents.
- **The cross-model review earned its keep:** a non-Claude model (GPT-6) found four real gaps in the
  plan (findings from an unfinished run, the completion log before validation, a rate-limit test
  that tested a constant, the fence label) that the spec-creator, the planner's own review pass and
  the main session had all missed — fixed before any code was written.
- **`/pr-self-review` in batches of 4** ran 17 reviewers for $11 with no usage-limit hit and no
  memory pressure, unlike the L05 Project Context run, where 24 reviewers died.
- **The final checks converged:** round 3 of plan-verifier and architecture-reviewer reported no
  gaps and no findings, and the hermetic e2e passed 14/14.

## What was hard / wasteful

- **Two review-fix rounds cost ≈ $41 (sessions 4–5, 18% of the run).** Both came from rules the
  per-phase loop does not check: layer placement (pure rules left in `brief/service.ts`, a domain
  file importing `./ports.js`), single-consumer hooks in `client/src/lib/`, and a ref read during
  render in `DiffTab`. architecture-reviewer caught each one only after the last phase, and each
  catch cost a full amend → implement → test → re-verify round.
- **The spec stage was the most expensive part ($95, 41%).** `spec-creator` and
  `implementation-planner` were resumed with `SendMessage` across the user's answers, so every
  resumed turn re-read a context that had grown to tens of millions of cache-read tokens (38.4M
  and 49.2M input side). The main session of that chat added another $20.
- **Orchestrator overhead in session 3** ($12 main vs $8 for its agents): the manual browser checks
  ran in the main session, and screenshots stayed in its context.
- **The final-checks chat (session 6) grew to $27.5 of main-session cost**, mostly from the
  self-review reports, the insights triage of 50 candidates and the e2e debugging — the kind of work
  that re-reads the whole chat on every turn.
- **Missed until late:** the dangling global `agent-browser` symlink (recorded on 2026-10-17)
  failed the first hermetic run with 0/14 again; the cross-model reviewer's name was never written
  into `pr-notes.md`, so it had to be asked for at PR time.

## Recommendations (actionable)

**Status 2026-10-19:** 1–5 applied on `chore/workflow-retro-fixes` (root `INSIGHTS.md`, Decisions, 2026-10-19); 6 is open.

1. **`implementer` brief** — add a "layer and colocation self-check" step before it reports
   `complete`: no pure rule in `service.ts`, no `./ports.js` import in `domain.ts`, a hook with one
   consumer lives beside it, no ref read during render. These are the exact rules behind both fix
   rounds → avoids most of the ≈ $41 spent on fix rounds.
2. **`/execute-plan`** — run `architecture-reviewer` in `change` mode after the last server phase and
   again after the last client phase, not only after phase N. A finding then costs one fix inside the
   package's phases instead of a full amend round with two final checks.
3. **`spec-creator` / `implementation-planner` handoff** — between passes, have the agent write its
   output to a file (`.devdigest/sdd/<feature>/discovery.md`, `review.md`) and start the next pass
   as a fresh agent that reads it, instead of resuming with `SendMessage` → the write and plan passes
   start at a few hundred thousand tokens instead of tens of millions; ≈ $40–50 saved per feature.
4. **Manual checks** — run the "Verify (manual, screenshots)" step from a short-lived sub-agent (or
   save screenshots to files and inspect zoomed regions only) so the orchestrating chat does not
   carry images → session 3's main cost back near session 2's.
5. **`e2e` step of `/execute-plan`** — check `command -v agent-browser` and that it resolves before
   the hermetic run, and fall back to `AGENT_BROWSER_BIN` from the global install → no wasted 0/14
   run; reinstalling `agent-browser@0.39.0` once removes the cause.
6. **`pr-notes.md`** — record the cross-model reviewer's model name when the review is pasted in,
   not at PR time.

## Comparison

| Run | Agents | Input side | Out | Cache hit | Cost |
|---|---|---|---|---|---|
| L05 Project Context (14 phases, 4 sessions) | 102 + 4 main | 505M | 1.33M | 95% | n/a |
| L05 PR Brief (11 phases, 6 sessions) | 49 + 6 main | 348M | 1.01M | 94% | ≈ $231 |

The PR Brief run used about 30% fewer tokens. Two visible differences: the self-review ran in
batches of 4 (17 reviewers, none lost), and every `/execute-plan` chat stopped at its checkpoint,
where the Project Context run kept one chat going for ~70% of its tokens.

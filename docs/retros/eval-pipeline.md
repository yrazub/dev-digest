# Workflow Retro — eval-pipeline (L06 homework)

**Run:** spec → plan → `/execute-plan` 17 phases (16 planned + 1 fix phase) → final checks → `/pr-self-review` ×2 · 133 sub-agents (0 nested) + 8 main sessions · multi-agent · data: deep (all sessions, main transcripts included)

Sessions covered, by their window and the commits that fall inside it:

| session | window (local) | what it carried |
|---|---|---|
| `2c83f880` | Oct 19–20 | "why are evals needed, can I skip?" — a Q&A before any work; no sub-agents |
| `508c6671` | Oct 31 21:35 → Nov 1 13:53 | spec-creator discovery/write, planner review/plan passes |
| `6a66cba5` | Nov 1 13:54 → 14:11 | spec + plan commit (`6fb8d83`, 13:56) and phases 1–3 |
| `3b87a60c` | Nov 1 14:20 → 15:56 | phases 4–7 (`c2a2e07` … `d27fc82`) |
| `40d82347` | Nov 1 16:01 → 23:38 | phases 8–13 (`0e6f562` … `49e4d2e`, 16:09–16:56), then the tolerance / drawer / scrollbar fixes (18:41–19:15), parallel to the sessions below |
| `4e0b5f09` | Nov 1 19:53 → 20:43 | phases 14–15: `verify-l06.sh`, no root `package.json`, the e2e flow |
| `da2c2ac2` | Nov 1 20:58 → 23:38 | phase 16 (review fixes, 23:25) |
| `8beea325` | Nov 1 23:39 → Nov 2 09:17 | final checks, phase 17, docs, e2e, insights, self-review ×2, push |

Times are the journals' UTC stamps shifted +2 h; commit times are from `git log`. Session labels are inferred from commits and first prompts, not recorded by the runner.

## Metrics

| group | agents | out tok | context tok (cache-read + write + fresh) | tool calls |
|---|---|---|---|---|
| sub-agents, all sessions | 133 | 3.51 M | 423.3 M | 5 221 |
| main sessions (8 chats) | — | 0.62 M | 136.1 M (132.1 M read, 4.0 M write) | ~590 |
| **total** | **133 + 8** | **4.13 M** | **559.4 M** | ~5 800 |

**Cache hit 94.6 %** (cache-read ÷ all input-side tokens). Cost in $: n/a (no verified prices pulled).

Sub-agents by type, ordered by context spend:

| type | runs | out | context | avg ctx / run | model |
|---|---|---|---|---|---|
| implementation-planner | 5 | 576 k | 88.4 M | 17.7 M | opus |
| architecture-reviewer | 7 | 450 k | 82.4 M | 11.8 M | opus |
| general-purpose (self-review reviewers, checks) | 64 | 445 k | 60.7 M | 0.9 M | opus + sonnet |
| spec-creator | 8 | 576 k | 50.1 M | 6.3 M | opus |
| plan-verifier | 3 | 255 k | 45.3 M | 15.1 M | opus |
| implementer | 23 | 557 k | 44.7 M | 1.9 M | sonnet |
| test-writer | 22 | 534 k | 35.7 M | 1.6 M | sonnet |
| doc-writer | 1 | 120 k | 16.0 M | 16.0 M | sonnet |

Heaviest single chats (main transcript, cache-read): `8beea325` 52.0 M, `40d82347` 31.5 M, `508c6671` 15.7 M.
**Launch shape:** planner/spec passes serial → per phase `implementer → test-writer` serial → `plan-verifier ‖ architecture-reviewer` → `doc-writer` → e2e → `/pr-self-review` as 7 batches of ≤4 reviewers, twice (29 tasks each).
**Parallelism:** sub-agent span ÷ wall is ≈ 0.24 in the last session and ≈ 1.0 elsewhere — the only real fan-out is the self-review batches. Wall time is dominated by idle time between messages (the last session alone spans ~9 h overnight).
**Critical path:** the 17-phase serial implementer → test-writer chain, then the two plan-verifier runs (~12 min each).

## What went well
- Hermetic gates did their job: `plan-verifier` re-ran every command on the final tree (470 items), and the e2e rerun passed 15/15 where the first run failed 2 for an infra reason.
- The architecture check at the last backend and last client phase caught placement mistakes cheaply; the final review found only one new placement issue (Compare modal in the shared layer), fixed as phase 17.
- Self-review had no CRITICAL across both runs; the one real defect (missing index on `eval_runs.suite_run_id`) was found by two independent reviewers and fixed.
- Insights were recorded once, deduped from 71 candidates to 10 entries.

## What was hard / wasteful
- **Chat sizing is uneven.** Phases per chat were 3 / 4 / 6 / 2 / 1; `40d82347` carried six phases plus the post-phase fixes over ~7.5 h and its own transcript read 31.5 M tokens, and the final-checks chat read 52 M (this session also ran the fix phase, docs, e2e, insights and two reviews). Same finding as the L05 retros (`docs/retros/ledger.md`): the orchestrating chat is a large single line item; here the main sessions total 136 M of 559 M (24 %).
- **Self-review was run twice in full** (58 reviewers, ~39 M context) because one committed migration file made the first verdict stale, even though the fix touched one schema file. The routing runs every skill on every slice regardless of what changed.
- **Final checks re-read the same ~19k-line patch** in `plan-verifier` ×2 and `architecture-reviewer` ×2; the second round needed only the delta since the first.
- **Planner cost**: 5 `implementation-planner` runs averaged 17.7 M context each — the highest per run, higher than any reviewer. Amend passes re-read the whole plan and spec to produce three replacements and one phase.
- **Rate limit**: 3 reviewers died on the 5-hour usage limit mid-batch (`frontend-ui-architecture-2/-3/-4`); the batch rule limited the damage to one batch, and only those three had to be rerun.
- **Concurrent writers in one worktree**: a `spec-creator` commit swept the implementer's staged `git mv` renames into an unrelated commit (`2643efe`). History is correct but the phase diff is misleading.
- **Approved spec edited by the main session**: `spec-creator` correctly refused to edit an `approved` spec; the edit was applied inline on the user's instruction, which costs a round-trip and leaves no `Superseded` trail.
- **`e2e:hermetic` flake under load**: 2 of 15 flows failed at `agent-browser open`; piping the run through `tail` hid the exit code (0) while the summary said 13/15.
- **Misleading criterion name**: the homework says `pnpm verify:l06`; the repo has `./scripts/verify-l06.sh` by an earlier decision. Risk is a reviewer typing the literal command.

## Recommendations
1. `execute-plan` — the final-checks stage should start in a fresh chat by design: this run did it in the chat that had just run the fix phase, and that chat read 52 M. Also make the 3-phase checkpoint a hard stop unless the user says "continue here" in that chat; today `start` resets it. → orchestrating chats stay under ~15 M cache-read.
2. `pr-self-review` — add a `--since <sha>` mode that routes only files changed after the last passing run and keeps earlier findings for untouched slices. → the second review of this run (~39 M context) would have been ~5 reviewers.
3. `execute-plan` final checks — pass `plan-verifier` and `architecture-reviewer` the delta patch plus the previous report on a re-run, not the whole patch again. → ~30 M context saved per re-run.
4. `implementation-planner` `amend` pass — give it the failing items and the phase slices they touch (`plan-phase.mjs`) instead of the whole plan and spec. → 17.7 M → ~3 M per amend.
5. Agent workflow — never run a committing agent (`spec-creator`, `doc-writer`) while another agent has staged renames; stage and commit in one step. → no mis-scoped commits. (Recorded in root `INSIGHTS.md`.)
6. `execute-plan` e2e step — run `npm run e2e:hermetic > file; echo exit=$?` and read the `N/15 flows passed` line; rerun once on `agent-browser open` failures before treating them as a regression. (Recorded in `e2e/INSIGHTS.md`.)
7. Task docs — put the real verify command in the PR description when a course criterion names a script the repo deliberately does not have. → no false negative at acceptance.

## Ledger
Row appended to `docs/retros/ledger.md`.

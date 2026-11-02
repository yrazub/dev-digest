# `eval` — eval cases and eval runs

`eval` measures an agent against decisions a person already made. A reviewer **accepts** a finding
(the agent was right) or **dismisses** it (the agent was wrong); the module turns that decision into a
stored **eval case**: a diff fragment plus an expectation that the agent must find the issue, or must
not flag it. A **run** then reviews every case of one agent with the agent's current configuration and
scores the result: recall, precision and citation accuracy, with the configuration saved beside them so
two runs can be compared.

Seven routes serve it, listed in [`../../../README.md`](../../../README.md) → "API map". The UI is the
Evals tab of an agent and the `/evals` dashboard ([`../../../../client/README.md`](../../../../client/README.md)
→ "UI route map"). How a run travels in the background, and how the boot step reaps an interrupted one,
is in [`../../../docs/architecture.md`](../../../docs/architecture.md); the three tables are in
[`../../../docs/schema.md`](../../../docs/schema.md).

## Where things live

| File | Owns |
|---|---|
| [`domain.ts`](domain.ts) | The pure rules: the diff fragment cut, case naming, the match rule, the per-case score, the run aggregate and the outcome of a stored row. Imports only `@devdigest/shared` types, which a test scans for |
| [`service.ts`](service.ts) | `EvalService`: case creation, case list and delete, starting a run, the run reads and the overview |
| [`run-executor.ts`](run-executor.ts) | `EvalRunExecutor`: the background half of a run, three cases at a time |
| [`ports.ts`](ports.ts) | The store port, the shapes that cross it and the executor's narrow ports (`ReviewEngine`, `EvalLog`, `EvalGit`) |
| [`repository.ts`](repository.ts) | `EvalRepository`, the Drizzle implementation; it composes [`repository/case.repo.ts`](repository/case.repo.ts), [`run.repo.ts`](repository/run.repo.ts), [`overview.repo.ts`](repository/overview.repo.ts) and [`source.repo.ts`](repository/source.repo.ts) |
| [`routes.ts`](routes.ts) | The seven routes; `POST /agents/:id/eval-runs` carries the per-route rate limit |
| [`constants.ts`](constants.ts) | The limits below |

The module imports no other module. The two pieces it shares with a review run, the task line and the
rendering of skills as prompt blocks, live in
[`../_shared/review-prompt.ts`](../_shared/review-prompt.ts) (moved there from `reviews`). The reads of
rows it does not own (the finding with its review, pull request and repository, the agent, the stored
patches, the agent's enabled skills) are its own queries in `repository/source.repo.ts`. The one thing
another module does for it is the cleanup on agent delete: `AgentsRepository.deleteById` removes the
agent's cases, because `eval_cases.owner_id` has no foreign key.

## Creating a case

`POST /findings/:id/eval-case` runs these steps in order and stops at the first that fails:

1. Find the finding through its review in the workspace (`404`).
2. The finding must be accepted or dismissed (`422`, "Accept or dismiss the finding first").
3. Its review must have an `agent_id` that is an agent of the workspace (`422`, "No agent for this
   finding").
4. If a case with this `source_finding_id` exists, answer `200` with it and `created: false`. Nothing
   changes.
5. Load the PR diff the way a review run does: the clone's `git diff base...head` through
   `container.git`, else a diff rebuilt from the stored `pr_files` patches.
6. Cut the finding's file section out of it. No section, no hunk, or no hunk left after the cut is a
   `422`, "No diff available for `<file>`".
7. Insert the case and answer `201`. A second concurrent insert for the same finding hits the unique
   index on `source_finding_id`; the loser re-reads the winner's case and answers `200`.

What is stored:

| Field | Value |
|---|---|
| `owner_kind` · `owner_id` | `agent` and the review's `agent_id` |
| `expected_output` | `{ kind, file, start_line, end_line, title, severity, category }` copied from the finding; `kind` is `must_find` for an accepted finding and `must_not_flag` for a dismissed one |
| `input_diff` · `input_files` | the file section (`diff --git`, `---`, `+++` and the hunks with their original `@@` headers) and `[file]` |
| `input_meta` | the PR's id, number, `owner/name`, title, description (`null` when empty), author and head SHA at creation |
| `name` | `must-find-<slug>` or `no-<slug>`; the slug is the title lower-cased, every run of characters outside `a-z0-9` made one `-`, edge dashes trimmed, cut to 34 characters, trailing dashes trimmed again, and `finding` when nothing is left |
| `source_finding_id` | the finding; `null` once the finding is deleted, and for seeded cases |

A file section with more than 1,500 hunk lines keeps only the hunks whose new-side range overlaps the
finding's line range. A stored case is **never updated**: accepting or dismissing the finding again
later does not change it, and the module has no update path.

## Scoring

The scorer is a pure function of the case's expectation and what the engine returned: the grounded
findings it kept and the number it dropped. It makes no model call. All of it is in
[`domain.ts`](domain.ts).

**The match rule.** A finding matches an expectation when it is in the same file and the two line ranges
overlap. For a `must_find` expectation the range is widened by `MUST_FIND_LINE_TOLERANCE` (2) lines on
both sides, because models miscount lines in a diff that carries no line numbers. A `must_not_flag`
expectation stays an exact overlap, so a finding one line off does not count against the agent.

**Per case** (`scoreCase`):

| Column | `must_find` | `must_not_flag` |
|---|---|---|
| `pass` | at least one matching finding | no matching finding |
| `recall` | 1 or 0 | null |
| `precision` | 1 with a matching finding, else null | 0 with a matching finding, else null |
| `citation_accuracy` | kept / (kept + dropped), null when both are 0 | same |

A finding that matches nothing counts in no precision figure. The outcome of a row is `errored` when it
has an `error`, else `pass` or `fail`.

**Per run** (`aggregateRun`), over the cases that did not error:

| Metric | Formula |
|---|---|
| `recall` | `must_find` cases with a matching finding / `must_find` cases |
| `precision` | TP / (TP + FP). TP counts the matching findings of `must_find` cases, FP those of `must_not_flag` cases |
| `citation_accuracy` | Σ kept / Σ (kept + dropped) |
| `cases_passed` · `cases_errored` | cases with `pass` true · cases that errored |
| `cost_usd` | the sum of the cases' costs; null when any is null, or when no case completed |

A metric whose denominator is 0 is `null`, shown as an em dash in the UI, never 0.

## Running

`POST /agents/:id/eval-runs` and its background half are drawn in
[`../../../docs/architecture.md`](../../../docs/architecture.md) → "An eval run, end to end". The points
that belong to the module:

- **The configuration is a snapshot.** The run stores the agent's `version`, `system_prompt`,
  `provider`, `model`, `strategy` and its enabled skills (`name` and `version`, in prompt order), read
  once when the run starts. The cases and the skill bodies are read at the same moment, and every case
  of the run uses them.
- **Each case is one engine call**, `reviewPullRequest` from `reviewer-core`, with the snapshot's
  prompt, model, strategy and skills, the stored diff fragment, the stored PR description when there
  is one and a task line built from the stored number, title and author. Callers, the repo map, project
  documents, memory, intent and the scope filter are not passed.
- **No review rows.** A run inserts no `reviews`, `findings` or `agent_runs` row and publishes nothing
  on the run bus.
- **One run at a time per agent**, enforced by a partial unique index.

## Limits

| Limit | Value |
|---|---|
| cases per run | 1 to 50 |
| cases reviewed at once in one run | 3 |
| hunk lines before a file section is cut | 1,500 |
| line tolerance of a `must_find` match | 2 |
| slug length in a case name | 34 characters |
| run list page | 20 by default, 100 at most |
| runs in the overview's `recent_runs` | 6 |
| points in an agent's `recall_trend` | 10 |
| `POST /agents/:id/eval-runs` | 10 per minute per client |

## Failures

| What fails | What the module does |
|---|---|
| The engine throws for one case | That case is stored with `error` set and `pass`, the metrics and `actual_output` null. It counts in `cases_errored` and in no metric. The run goes on |
| Every stored case errored | The run ends `failed`, with `All <n> cases failed: <first error>` |
| A throw outside a case (a store failure) | The run ends `failed` with the error's message |
| The server restarts mid-run | The boot step sets the run `failed` with `Interrupted by server restart` |
| A case is deleted mid-run | Its result is dropped and it counts nowhere. The run ends `done` |
| The agent is deleted mid-run | The run row is gone with it. The executor stops and writes nothing |
| The agent's provider has no key | `400` `eval_unavailable` before anything is written |

## Seeded data

`pnpm db:seed` gives the seeded **Security Reviewer** two cases from PR #482 and two finished runs, so
the dashboard and the Compare modal have something to show with no model call
([`../../db/seed-eval.ts`](../../db/seed-eval.ts)). A case is inserted only when the agent has none of
that name, and the runs only when the agent has no run, so a second seed changes nothing. The values
the end-to-end flow waits for are in [`../../../../e2e/specs/seed-fixtures.md`](../../../../e2e/specs/seed-fixtures.md).

## Tests

| File | Lane | Covers |
|---|---|---|
| [`test/eval-domain.test.ts`](../../../test/eval-domain.test.ts) | hermetic | the match rule and its tolerance, the per-case and per-run scores, the fragment cut, case naming |
| [`test/eval-scorer-purity.test.ts`](../../../test/eval-scorer-purity.test.ts) | hermetic | the scorer imports nothing but `@devdigest/shared` and makes no model call |
| [`test/eval-executor.test.ts`](../../../test/eval-executor.test.ts) | hermetic, fake ports | at most 3 calls in flight; the inputs the engine receives |
| [`test/eval-rate-limit.test.ts`](../../../test/eval-rate-limit.test.ts) | hermetic | the run route's rate limit |
| [`test/eval-contracts.test.ts`](../../../test/eval-contracts.test.ts) | hermetic | `EvalExpectation` and `EvalSuiteRun` edge cases |
| [`test/eval-pipeline.it.test.ts`](../../../test/eval-pipeline.it.test.ts) | Postgres, mock LLM and git | every route and failure above, the boot reap, the agent delete |
| [`test/eval-seed.it.test.ts`](../../../test/eval-seed.it.test.ts) | Postgres | the seeded fixture, inserted once |

`./scripts/verify-l06.sh` at the repository root runs these with the client and `reviewer-core` checks;
see [`../../../../TESTING.md`](../../../../TESTING.md).

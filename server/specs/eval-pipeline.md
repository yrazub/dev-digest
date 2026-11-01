# Eval Pipeline — server
Spec ID: SPEC-2026-10-31-eval-pipeline · Umbrella: [`specs/eval-pipeline.md`](../../specs/eval-pipeline.md) · Status: approved

## Scope
Covers AC-2–AC-6, AC-9, AC-11, AC-12, AC-15, AC-17, AC-18, AC-21, AC-25, AC-28–AC-50 and
AC-92–AC-97 and AC-99 of the umbrella, and the server data behind AC-20, AC-24, AC-52–AC-56, AC-61,
AC-64, AC-65, AC-71, AC-76–AC-78, AC-81, AC-82, AC-86 and AC-91. It owns every `@devdigest/shared` contract the feature
adds; the client spec refers to them by name. It also owns the one repository-root file of
AC-95–AC-97 (`scripts/verify-l06.sh`), which the spec agent cannot write and the plan builds.

The server gets a new `eval` module: case creation from a finding, case list and delete, a
background run of an agent on its whole case set, a pure scorer, run lists and detail, and an
overview for the dashboard. The existing `eval_cases` and `eval_runs` tables are extended and a
parent run table is added, through one generated migration. `reviewer-core` is used as it is.

## What already exists

| Piece | Where |
|---|---|
| `eval_cases` (`id`, `workspace_id` → workspaces cascade, `owner_kind` `skill`/`agent`, `owner_id` uuid without FK, `name`, `input_diff`, `input_files` jsonb, `input_meta` jsonb, `expected_output` jsonb, `notes`); no `created_at`, no source link | `src/db/schema/eval.ts:7` |
| `eval_runs` — one row per case execution: `case_id` NOT NULL → `eval_cases` on delete cascade, `ran_at`, `actual_output`, `pass`, `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`; no batch, agent, snapshot, status or error. No code writes either table | `src/db/schema/eval.ts:22` |
| `EvalPerTrace`, `EvalRun`, `EvalOwnerKind`, `EvalCase` | `src/vendor/shared/contracts/knowledge.ts:50-84` |
| `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint`, `EvalDashboard` — used by no route | `src/vendor/shared/contracts/eval-ci.ts:20-89` |
| `Severity`, `FindingCategory`, `Provider`, `ReviewStrategy`, `Agent` (`version`, `system_prompt`, `strategy`, …) | `contracts/findings.ts`, `contracts/knowledge.ts:330` |
| `findings.accepted_at` / `dismissed_at`, mutually exclusive (accept clears dismiss and back) | `src/db/schema/reviews.ts:56`, `src/modules/reviews/repository/review.repo.ts:127,140` |
| `reviews.agent_id` uuid, nullable, no FK; the seeded review of PR #482 has none | `src/db/schema/reviews.ts:27`, `src/db/seed.ts:271` |
| `agents.version` bumped by every config change, snapshots in `agent_versions`; `agent_skills` (order); `skills.version` | `src/db/schema/agents.ts`, `src/modules/agents/repository.ts:109-139`, `src/db/schema/skills.ts:18` |
| `loadDiff` — `git diff base...head` through `container.git`, else a diff rebuilt from `pr_files.patch` (module-private to `reviews`) | `src/modules/reviews/diff-loader.ts` |
| `taskLine(pull)` — "Review pull request #N "title" by author. …" (module-private) | `src/modules/reviews/helpers.ts:56` |
| `promptSkillsForAgent` + `renderSkillBlocks` — the enabled linked skills in prompt order, as blocks | `src/modules/reviews/run-executor.ts:214` |
| `reviewPullRequest(input)` → `{ review.findings (grounded; scope filter off unless asked), dropped[], tokensIn, tokensOut, costUsd, … }`; `groundFindings()` inside | `reviewer-core/src/review/run.ts:57-290` |
| `container.llm(provider)` throws when the provider key is missing | `src/modules/reviews/run-executor.ts:182` |
| Boot reaper, awaited before listening: `new ReviewService(container).reapStaleRuns()` | `src/app.ts:81-86` |
| Per-route rate limit `{ rateLimit: { max: 10, timeWindow: '1 minute' } }` | `src/modules/reviews/routes.ts:29` |
| `DELETE /agents/:id` — agent versions and skill links go by FK cascade | `src/modules/agents/routes.ts:120`, `service.ts:78` |
| `contracts-sync.test.ts` — byte check of `brief.ts` and `review-api.ts` only | `test/contracts-sync.test.ts` |
| Errors: `NotFoundError` 404, `ValidationError` 422, `AppError(code, message, status)` | `src/platform/errors.ts` |
| Seed: workspace, `acme/payments-api`, PR #482 (head `a1b2c3d4e5f6`), findings `src/config.ts:12` "Hardcoded Stripe secret key in commit" (CRITICAL, security) and `src/api/users.ts:45-52` "N+1 query in user list endpoint" (WARNING, perf), patches on both files, five agents incl. "Security Reviewer" | `src/db/seed.ts` |

## Requirements (EARS)
| ID | Requirement | Covers |
|---|---|---|
| R-SRV-1 | WHEN `POST /findings/:id/eval-case` is called for an accepted finding of the caller's workspace with no case yet, the API shall answer `201` with `EvalCaseCreateResponse` (`created: true`) whose case has `owner_kind: 'agent'`, `owner_id` equal to the finding's `reviews.agent_id`, and `expected_output` `{ kind: 'must_find', file, start_line, end_line, title, severity, category }` copied from the finding. | AC-2 |
| R-SRV-2 | WHEN the same route is called for a dismissed finding, the API shall store the case with `expected_output.kind: 'must_not_flag'` and otherwise as R-SRV-1. | AC-3 |
| R-SRV-3 | The eval module shall store as `input_diff` the finding's file section of the pull request's diff — `diff --git a/<f> b/<f>`, `--- a/<f>`, `+++ b/<f>` and every hunk with its original `@@` header — taken from the diff loaded as review runs load it (the clone's `git diff base...head`, else the stored `pr_files` patches), and `input_files: ["<f>"]`. | AC-4 |
| R-SRV-4 | IF the hunk lines of that file section exceed 1,500, THEN the eval module shall keep only the hunks whose new-side range `[c, c+d−1]` overlaps `[start_line, end_line]` of the finding, headers unchanged. | AC-5 |
| R-SRV-5 | The eval module shall store as `input_meta` an `EvalCaseMeta` with the pull request's id, number, repository `owner/name`, title, description (null when empty), author and head SHA at the time of creation. | AC-6 |
| R-SRV-6 | IF the finding has neither `accepted_at` nor `dismissed_at`, THEN `POST /findings/:id/eval-case` shall answer `422` code `validation_error` with "Accept or dismiss the finding first" and write nothing. | AC-9 |
| R-SRV-7 | IF the finding's review has a null `agent_id`, or no agent with that id exists in the workspace, THEN the route shall answer `422` with "No agent for this finding" and write nothing. | AC-11 |
| R-SRV-8 | IF the loaded diff has no section for the finding's file, the section has no hunk, or R-SRV-4 leaves no hunk, THEN the route shall answer `422` with "No diff available for `<file>`" and write nothing. | AC-12 |
| R-SRV-9 | WHEN a case with `source_finding_id` equal to the finding's id exists, the route shall answer `200` with that case and `created: false`, and change nothing. | AC-15 |
| R-SRV-10 | The eval module shall never update `expected_output`, `input_diff` or `input_meta` of a stored case. | AC-17 |
| R-SRV-11 | `eval_cases.source_finding_id` shall be unique where not null, and the route shall answer two concurrent requests for one finding with the same single case. | AC-18 |
| R-SRV-12 | The eval module shall name a case `must-find-<slug>` or `no-<slug>`, where `<slug>` is the finding's title lower-cased, every run of characters outside `a-z0-9` replaced by `-`, leading and trailing `-` removed, cut to 34 characters, trailing `-` removed again after the cut, and `finding` when empty. | AC-20 |
| R-SRV-13 | WHEN `GET /agents/:id/eval-cases` is called for an agent of the caller's workspace, the API shall answer `EvalCaseList` with every case whose `owner_kind` is `agent` and `owner_id` is the agent's id, newest `created_at` first, unpaginated. | AC-21, AC-20 |
| R-SRV-14 | WHEN `DELETE /eval-cases/:id` is called for a case of the caller's workspace, the API shall delete it and its `eval_runs` rows, answer `204`, and change no column of any `eval_suite_runs` row. | AC-25, AC-24 |
| R-SRV-15 | WHEN `POST /agents/:id/eval-runs` passes R-SRV-27–R-SRV-30, whether the agent is enabled or disabled, the API shall insert an `eval_suite_runs` row with `status: 'running'`, `cases_total` equal to the agent's case count, `cases_done: 0`, and answer `202` with it as `EvalSuiteRun`, before any case is reviewed. | AC-28 |
| R-SRV-16 | The run row shall store, read once at the start, the agent's `version`, `system_prompt`, `provider`, `model`, `strategy`, and `skills` as `[{ name, version }]` of its enabled linked skills in prompt order; every case of the run shall use these values and the skill bodies read at the same moment. | AC-29, AC-71, AC-81, AC-82 |
| R-SRV-17 | For each case the executor shall call `reviewPullRequest()` once with `systemPrompt`, `model`, `strategy` and the skill blocks of R-SRV-16, `diff` parsed from `input_diff`, `prDescription` set to the stored description when not null, and `task` built like the review task line from the stored number, title and author; and shall pass no `callers`, `repoMap`, `specs`, `memory`, `intent` or `scopeFilter`, and no file-rank note. | AC-30 |
| R-SRV-18 | WHEN every case of a run that still exists has a result, the executor shall set `status: 'done'`, `finished_at`, `recall`, `precision`, `citation_accuracy`, `cases_passed`, `cases_errored` and `cost_usd` (the sum over completed cases, null when any of them is null). | AC-31 |
| R-SRV-19 | The scorer shall treat a grounded finding as matching an expectation exactly when `finding.file === expectation.file` and `finding.start_line <= expectation.end_line` and `expectation.start_line <= finding.end_line`. | AC-32 |
| R-SRV-20 | The scorer shall set a run's `recall` to the number of completed `must_find` cases with at least one matching grounded finding divided by the number of completed `must_find` cases. | AC-33 |
| R-SRV-21 | The scorer shall set a run's `precision` to TP / (TP + FP), with TP the count of grounded findings matching their own case's expectation over completed `must_find` cases and FP the same count over completed `must_not_flag` cases. | AC-34 |
| R-SRV-22 | The scorer shall set a run's `citation_accuracy` to Σ kept / Σ (kept + dropped) over the completed cases, where kept is the length of the engine's grounded findings and dropped the length of its `dropped` list. | AC-35 |
| R-SRV-23 | IF a denominator of R-SRV-20–R-SRV-22 is 0, THEN the scorer shall return null for that metric. | AC-36 |
| R-SRV-24 | The scorer shall be a pure function of the expectations and the engine's kept and dropped findings, importing nothing but `@devdigest/shared` types, with no LLM provider, container, database or I/O. | AC-37 |
| R-SRV-25 | During a run, the eval module shall call the LLM provider only through the one `reviewPullRequest()` call per case. | AC-38 |
| R-SRV-26 | The eval module shall insert no row into `reviews`, `findings` or `agent_runs`, and publish nothing on the run bus. | AC-39 |
| R-SRV-27 | IF the agent has an `eval_suite_runs` row with `status: 'running'`, THEN `POST /agents/:id/eval-runs` shall answer `409` code `eval_run_in_progress`, and two concurrent requests shall create at most one run. | AC-40 |
| R-SRV-28 | IF the agent has no case, THEN `POST /agents/:id/eval-runs` shall answer `422` with "This agent has no eval cases" and write nothing. | AC-41 |
| R-SRV-29 | IF the agent has more than 50 cases, THEN `POST /agents/:id/eval-runs` shall answer `422` with "An eval run takes at most 50 cases; this agent has `<n>`" and write nothing. | AC-42 |
| R-SRV-30 | IF resolving the agent's provider fails for a missing key, THEN `POST /agents/:id/eval-runs` shall answer `400` code `eval_unavailable` with "No API key for `<provider>`. Add it in Settings." and write nothing. | AC-43 |
| R-SRV-31 | IF `reviewPullRequest()` throws for a case, THEN the executor shall insert that case's `eval_runs` row with `error` set to the error's message, `pass`, `recall`, `precision`, `citation_accuracy` and `actual_output` null, count it in `cases_errored`, and leave it out of R-SRV-20–R-SRV-22. | AC-44 |
| R-SRV-32 | IF every case of a run errored, THEN the executor shall set the run's `status: 'failed'` and `error` to "All `<n>` cases failed: `<first error>`". | AC-45 |
| R-SRV-33 | WHEN the app boots, the boot step that reaps stale `agent_runs` shall also set every `eval_suite_runs` row with `status: 'running'` to `failed` with `error: 'Interrupted by server restart'` and `finished_at` now, before the server listens; no second reaper is added. | AC-46 |
| R-SRV-34 | `POST /agents/:id/eval-runs` shall carry the per-route rate limit `{ max: 10, timeWindow: '1 minute' }`. | AC-47 |
| R-SRV-35 | WHEN `DELETE /agents/:id` deletes an agent, the API shall delete its `eval_cases` rows (`owner_kind: 'agent'`, `owner_id` = the agent's id) in the same request, and its `eval_suite_runs` rows (and their `eval_runs`) shall go by FK cascade. | AC-48 |
| R-SRV-36 | The executor shall have at most 3 `reviewPullRequest()` calls of one run in flight at any time. | AC-49 |
| R-SRV-37 | IF the finding, agent, case or run of an eval route is not in the caller's workspace, THEN the route shall answer `404` code `not_found`. | AC-50 |
| R-SRV-38 | WHEN `GET /agents/:id/eval-runs` is called with `limit` (1–100, default 20) and `offset` (≥ 0, default 0), the API shall answer `EvalSuiteRunList` with that page of the agent's runs, newest `started_at` first, and `total`. | AC-52, AC-55, AC-78 |
| R-SRV-39 | WHEN a case's result is stored, the executor shall increment the run's `cases_done` in the same transaction. | AC-54, AC-55 |
| R-SRV-40 | WHEN `GET /eval-runs/:id` is called, the API shall answer `EvalSuiteRunDetail` with one `EvalCaseResult` per stored result, ordered by case name, each with the case's name, kind and expectation, its `outcome`, its grounded findings with a `matches` flag, its `dropped` count and its `error`. | AC-61, AC-86 |
| R-SRV-41 | WHEN `GET /evals/overview` is called, the API shall answer `EvalOverview` with every agent of the workspace, enabled or not, by name, each with its latest `done` run or null, whether it has a `running` run, its case and run counts and the `recall` of its last 10 `done` runs oldest first; and `recent_runs` with the 6 newest runs of the workspace in any status, with their agent's name. | AC-56, AC-64, AC-65, AC-76, AC-77, AC-91 |
| R-SRV-42 | `@devdigest/shared` shall define the contracts of "Contracts" below in a new `contracts/eval-pipeline.ts`, exported from the barrel; the client's copy of that file shall be byte-identical, and `test/contracts-sync.test.ts` shall check it alongside `brief.ts` and `review-api.ts`. | AC-92 |
| R-SRV-43 | `pnpm db:seed` shall insert the eval fixture of "Seeded eval data" below, idempotently, outside the block that creates PR #482, never overwriting or duplicating a row. | AC-93, AC-94 |
| R-SRV-44 | The repository root shall hold no `package.json`, `.npmrc`, `pnpm-workspace.yaml`, lockfile or `node_modules/`, before or after `./scripts/verify-l06.sh` runs; the script shall be committed executable (mode `100755`), run directly from the repository root, call pnpm and npm only inside `server/`, `client/` and `reviewer-core/`, and set `npm_config_verify_deps_before_run=false` for every pnpm call it makes. | AC-95 |
| R-SRV-45 | `scripts/verify-l06.sh` shall run, with `set -euo pipefail` and each step inside its own package: `server` — `pnpm typecheck`, the hermetic eval tests (with every `*.it.test.ts` excluded), the eval `*.it.test.ts` tests, `pnpm arch:check`, each test lane running the files "Verification command" selects; `client` — `pnpm typecheck` and the eval component tests selected by the substrings named there; `reviewer-core` — `npm run typecheck` and `npm test`; print the name of a failing step, and exit with its non-zero code. | AC-95 |
| R-SRV-46 | `scripts/verify-l06.sh` shall install nothing, read no secret and set no API key; every eval test it runs shall use `MockLLMProvider` and mock adapters only. | AC-96 |
| R-SRV-47 | IF `docker info` exits non-zero, THEN `scripts/verify-l06.sh` shall print "Docker is required for the eval integration tests" and exit 1 before its first `server` step, so the self-skipping `*.it.test.ts` lane can never let the command pass. | AC-97, AC-95 |
| R-SRV-48 | IF a case is deleted while a run of its agent has `status: 'running'`, THEN the executor shall finish the run with no `eval_runs` row for that case and with the case counted in none of `cases_passed`, `cases_errored` or R-SRV-20–R-SRV-22, whether its review had not started, was in flight or had finished. | AC-99, AC-31 |

## Tables and migration

One migration generated with `pnpm db:generate` (never hand-written). `eval_runs` and
`eval_cases` are empty in every database — no code wrote them before this feature — so a NOT NULL
column without a default is safe.

**New `eval_suite_runs`** (one row per run)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk, default random | |
| `workspace_id` | uuid not null → `workspaces.id` on delete cascade | |
| `agent_id` | uuid not null → `agents.id` on delete cascade | R-SRV-35 |
| `agent_version` | integer not null | snapshot |
| `system_prompt` | text not null | snapshot |
| `provider` | text not null, enum `openai` `anthropic` `openrouter` | snapshot |
| `model` | text not null | snapshot |
| `strategy` | text not null, enum `single-pass` `map-reduce` `auto` | snapshot |
| `skills` | jsonb not null, `[{ name, version }]` | snapshot, prompt order |
| `status` | text not null, enum `running` `done` `failed` | |
| `recall`, `precision`, `citation_accuracy` | double precision, nullable | 0..1 |
| `cases_total` | integer not null | |
| `cases_done`, `cases_passed`, `cases_errored` | integer not null default 0 | |
| `cost_usd` | double precision, nullable | |
| `started_at` | timestamptz not null default now | |
| `finished_at` | timestamptz, nullable | |
| `error` | text, nullable | |

Index on `(agent_id, started_at desc)`; and whatever the planner chooses to make R-SRV-27 hold under
concurrency (a partial unique index on `agent_id` where `status = 'running'` does).

**`eval_runs`** (one row per case result) gains `suite_run_id` uuid not null →
`eval_suite_runs.id` on delete cascade, and `error` text nullable. Existing columns keep their
meaning (`EvalRun` and `per_trace` are unchanged). `case_id` keeps its cascade (G16).

**`eval_cases`** gains `created_at` timestamptz not null default now, and `source_finding_id` uuid
nullable → `findings.id` on delete set null, unique where not null (R-SRV-11).

`docs/schema.md` gets these tables and the note that `eval_cases.owner_id` has no FK, so the agent
delete removes the cases (R-SRV-35).

## Contracts (`@devdigest/shared`)

Authored in `src/vendor/shared/contracts/eval-pipeline.ts`, exported from `src/vendor/shared/index.ts`,
and synced byte-identical into `client/src/vendor/shared/contracts/eval-pipeline.ts` (the client's
`index.ts` gets the same export line). `knowledge.ts` and `eval-ci.ts` are not edited. Each schema
has its inferred type under the same name.

```ts
export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);

const EvalLocation = {
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  title: z.string().min(1),
  severity: Severity,
  category: FindingCategory,
};
export const EvalExpectation = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('must_find'), ...EvalLocation }),
    z.object({ kind: z.literal('must_not_flag'), ...EvalLocation }),
  ])
  .refine((e) => e.start_line <= e.end_line, { message: 'start_line must be ≤ end_line' });

export const EvalCaseMeta = z.object({
  pr_id: z.string(),
  pr_number: z.number().int(),
  repo: z.string(),                 // "owner/name"
  pr_title: z.string(),
  pr_body: z.string().nullable(),
  pr_author: z.string(),
  head_sha: z.string(),
});

export const EvalCaseRecord = EvalCase.extend({
  owner_kind: z.literal('agent'),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectation,
  source_finding_id: z.string().nullable(),   // null once the finding is deleted, and for seeded cases
  created_at: z.string(),
});
export const EvalCaseCreateResponse = z.object({ case: EvalCaseRecord, created: z.boolean() });
export const EvalCaseList = z.object({ cases: z.array(EvalCaseRecord) });

export const EvalSuiteRunStatus = z.enum(['running', 'done', 'failed']);
export const EvalSkillRef = z.object({ name: z.string(), version: z.number().int() });
export const EvalConfigSnapshot = z.object({
  agent_version: z.number().int(),
  system_prompt: z.string(),
  provider: Provider,
  model: z.string(),
  strategy: ReviewStrategy,
  skills: z.array(EvalSkillRef),
});

const Metric = z.number().min(0).max(1).nullable();
export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: EvalSuiteRunStatus,
  config: EvalConfigSnapshot,
  recall: Metric,
  precision: Metric,
  citation_accuracy: Metric,
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_passed: z.number().int(),
  cases_errored: z.number().int(),
  cost_usd: z.number().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
});
export const EvalSuiteRunList = z.object({ runs: z.array(EvalSuiteRun), total: z.number().int() });

export const EvalCaseOutcome = z.enum(['pass', 'fail', 'errored']);
export const EvalFoundFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: Severity,
  category: FindingCategory,
  matches: z.boolean(),             // overlaps this case's expectation (R-SRV-19)
});
export const EvalCaseResult = EvalRunRecord.extend({
  suite_run_id: z.string(),
  case_name: z.string(),
  kind: EvalExpectationKind,
  expectation: EvalExpectation,
  outcome: EvalCaseOutcome,
  actual_output: z.object({ findings: z.array(EvalFoundFinding), dropped: z.number().int() }).nullable(),
  error: z.string().nullable(),
});
export const EvalSuiteRunDetail = EvalSuiteRun.extend({ results: z.array(EvalCaseResult) });

export const EvalAgentOverview = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  provider: Provider,
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  runs_total: z.number().int(),
  running: z.boolean(),
  latest: EvalSuiteRun.nullable(),        // latest done run
  recall_trend: z.array(Metric),          // last 10 done runs, oldest first
});
export const EvalOverview = z.object({
  agents: z.array(EvalAgentOverview),
  recent_runs: z.array(EvalSuiteRun),     // 6 newest, any status
});
```

Per-case columns of a result (`EvalRunRecord` fields): `pass` — `must_find`: at least one matching
grounded finding; `must_not_flag`: none; null when errored. `recall` — 1 or 0 for `must_find`,
null for `must_not_flag`. `precision` — the case's TP / (TP + FP), null when 0 / 0.
`citation_accuracy` — the case's kept / (kept + dropped), null when no finding. `outcome` —
`errored` when `error` is set, else `pass` or `fail`.

## Module `src/modules/eval/`

A new module registered in `src/modules/index.ts`, with `routes.ts` · `service.ts` · a repository
split by aggregate as needed · a pure `domain.ts` (fragment cut, case naming, the scorer) · the
background executor. It never imports another module (`dep-no-cross-module`): what it needs from
`reviews` (the PR diff load, the task-line wording, the prompt skills) and from `agents` (the
agent-delete hook of R-SRV-35) is reached the way other modules reach shared services, decided
with the `onion-architecture` skill; `pnpm arch:check` shows no new violation and no new baseline
entry. The boot reaper of R-SRV-33 joins the existing boot step in `src/app.ts`.

### Routes

| Route | Params / query / body | Answers |
|---|---|---|
| `POST /findings/:id/eval-case` | `IdParams`; no body | `201` / `200 EvalCaseCreateResponse` · `404` · `422` |
| `GET /agents/:id/eval-cases` | `IdParams` | `200 EvalCaseList` · `404` |
| `DELETE /eval-cases/:id` | `IdParams` | `204` · `404` |
| `POST /agents/:id/eval-runs` | `IdParams`; no body; rate limit 10/min | `202 EvalSuiteRun` · `400 eval_unavailable` · `404` · `409 eval_run_in_progress` · `422` · `429` |
| `GET /agents/:id/eval-runs` | `IdParams`; query `limit` 1–100 (20), `offset` ≥ 0 (0) | `200 EvalSuiteRunList` · `404` |
| `GET /eval-runs/:id` | `IdParams` | `200 EvalSuiteRunDetail` · `404` |
| `GET /evals/overview` | — | `200 EvalOverview` |

All are workspace-scoped through `getContext`. Validation is schema-first: invalid ids or query
values answer `422` before the handler.

### Case creation, in order
1. Find the finding through its review in the workspace (`404`).
2. Decision check (R-SRV-6), agent check (R-SRV-7), existing-case check (R-SRV-9).
3. Load the PR diff (R-SRV-3), cut it (R-SRV-4), refuse when empty (R-SRV-8).
4. Insert with the name of R-SRV-12; answer `201`. A unique-violation on `source_finding_id`
   re-reads and answers `200` (R-SRV-11).

### Run, in order
1. Find the agent (`404`); count its cases (R-SRV-28, R-SRV-29); resolve its provider (R-SRV-30);
   check for a running run (R-SRV-27).
2. Read the configuration snapshot and the skill bodies (R-SRV-16); insert the run (R-SRV-15);
   answer `202`; continue in the background, not awaited by the route.
3. Review the cases, 3 at a time (R-SRV-36), each with R-SRV-17; score it (R-SRV-19, per-case
   columns); store its result and bump `cases_done` (R-SRV-39); a throw becomes R-SRV-31.
4. Aggregate (R-SRV-18 or R-SRV-32). A throw outside a case marks the run `failed` with its
   message, so no run stays `running` while the process lives.
5. Log one `info` line at the start (run id, agent id, cases) and one at the end (run id, status,
   counts, metrics, cost, duration) — ids and numbers only, no prompt, diff or model text.

### Configuration and limits

| Name | Value |
|---|---|
| cases per run | 1–50 |
| concurrent case reviews per run | 3 |
| fragment cut threshold | 1,500 hunk lines |
| case name | prefix + slug of at most 34 characters (at most 44 in all) |
| run list page | 20 by default, at most 100 |
| recent runs in the overview | 6 |
| recall trend points | 10 |
| `POST /agents/:id/eval-runs` rate limit | 10 per minute |

## Seeded eval data

Inserted by R-SRV-43 for the seeded agent "Security Reviewer". Case rows are inserted only when the
agent has no case of that name; the two runs only when the agent has no run. The exact values are
the fixture of AC-93 and AC-94; `test-writer` records them in `e2e/specs/seed-fixtures.md`.

| Case | Kind | Expectation | Fragment |
|---|---|---|---|
| `must-find-stripe-key` | `must_find` | `src/config.ts` 12–12, "Hardcoded Stripe secret key in commit", CRITICAL, security | the seeded `src/config.ts` patch with its header |
| `no-n-plus-one-user-list` | `must_not_flag` | `src/api/users.ts` 45–52, "N+1 query in user list endpoint", WARNING, perf | the seeded `src/api/users.ts` patch with its header |

Both cases carry PR #482's meta and `source_finding_id: null` (the seeded review has no agent, so
its finding cards keep the disabled button).

| Run | `started_at` | Prompt snapshot | recall | precision | citation | passed / total | cost |
|---|---|---|---|---|---|---|---|
| older | `2026-10-30T10:00:00.000Z` | the agent's seeded system prompt, then `\n\nFlag every database query inside a loop as a performance problem.` | 1 | 0.5 | 0.6667 | 1 / 2 | 0.004 |
| newer | `2026-10-31T10:00:00.000Z` | the agent's seeded system prompt | 1 | 1 | 1 | 2 / 2 | 0.003 |

Both runs: `status: 'done'`, `finished_at` one minute after `started_at`, `agent_version`,
`provider`, `model`, `strategy` and `skills` equal to the agent's at seed time, `cases_errored: 0`,
`error: null`. Per-case results: older — the Stripe case `pass` with one matching finding, the N+1
case `fail` with one matching finding, `dropped: 1` on the Stripe case; newer — both `pass`, one
matching finding on the Stripe case, none on the N+1 case, `dropped: 0`. Compare of the two shows
recall 100% → 100% (±0pt), precision 50% → 100% (+50pt), citation 67% → 100% (+33pt), cost
$0.0040 → $0.0030 (−$0.0010) in the studio's 4-decimal cost format.

## Verification command (repository root)

The spec agent cannot write this file; the plan builds it (R-SRV-44–R-SRV-47).

- `scripts/verify-l06.sh` runs from any working directory (it resolves the repository root from its
  own path), assumes each package is installed, and selects the eval tests by name: in `server`,
  the hermetic lane runs every `test/eval-*.test.ts` plus `test/contracts-sync.test.ts` with
  `*.it.test.ts` excluded (so `test/eval-contracts.test.ts` is in it and `test/eval-seed.it.test.ts`
  is not); the integration lane runs every `test/eval-*.it.test.ts` — `test/eval-pipeline.it.test.ts`,
  and `test/eval-seed.it.test.ts` when the seed test lives there. In `client`, it selects by path substrings without brackets (a
  vitest filter containing `[agentId]` or `[repoId]` matches nothing): `app/evals/`, `EvalsTab`,
  `components/eval/`, `FindingCard`, `FindingsPanel`, `InlineFinding`, `app-shell/nav` and
  `hooks/evals` — the `/evals` route folders, the Evals tab, the shared eval components, the
  FindingCard and the components that pass it the agent id, the sidebar and the eval hooks
  (client spec, "Tests"). It checks Docker before the first
  `server` step (R-SRV-47): the integration lane self-skips without Docker, so without the check a
  green run would not prove the integration tests ran.

## Tests

| File | Kind | Covers |
|---|---|---|
| `test/eval-domain.test.ts` | hermetic | match rule incl. touching ends and other files (R-SRV-19); recall, precision, citation over a fixture of mixed cases with several matches per case, unmatched findings, errored cases excluded (R-SRV-20–R-SRV-22, R-SRV-31); nulls (R-SRV-23); per-case columns; the fragment cut at 1,500 lines with overlapping and non-overlapping hunks (R-SRV-4, R-SRV-8); case naming incl. an empty and a 60-character title, and a title whose cut ends in `-` (R-SRV-12) |
| `test/eval-scorer-purity.test.ts` | hermetic | the scorer module imports nothing but `@devdigest/shared` (source scan) and scores a fixture with a `MockLLMProvider` whose `calls` stay empty (R-SRV-24) |
| `test/eval-executor.test.ts` | hermetic, fake ports | concurrency never above 3 with 7 cases (R-SRV-36); the inputs handed to `reviewPullRequest()` — no callers, repo map, specs, memory, intent, scope filter, rank note (R-SRV-17) |
| `test/eval-rate-limit.test.ts` | hermetic | the route's rate-limit config (R-SRV-34), as `brief-rate-limit.test.ts` does |
| `test/eval-pipeline.it.test.ts` | Postgres, mock LLM, mock git | case creation `201`/`200`, both kinds, fragment and meta stored, `422`s, `404` (R-SRV-1–R-SRV-9, R-SRV-37); a later accept/dismiss leaves the case (R-SRV-10); two concurrent creates → one case (R-SRV-11); list with 8 cases (R-SRV-13); delete leaves run metrics (R-SRV-14); run `202` → `done` with one result per case, snapshot stored, also for a disabled agent, the mock's `calls` equal to the number of cases, no new `reviews`/`findings`/`agent_runs` row (R-SRV-15, R-SRV-16, R-SRV-18, R-SRV-25, R-SRV-26, R-SRV-39); `409`, two concurrent POSTs → one run (R-SRV-27); `422` for 0 and 51 cases (R-SRV-28, R-SRV-29); `400` with no key (R-SRV-30); one throwing case and all throwing (R-SRV-31, R-SRV-32); a case deleted mid-run → the run `done`, that case in no count or metric (R-SRV-48); boot reap (R-SRV-33); agent delete removes cases and runs (R-SRV-35); runs page and total (R-SRV-38); detail with results (R-SRV-40); overview incl. a disabled agent and an agent with no run (R-SRV-41) |
| `test/contracts-sync.test.ts` | hermetic | `eval-pipeline.ts` byte-identical (R-SRV-42) |
| `test/eval-contracts.test.ts` | hermetic | `EvalExpectation` rejects start > end, line 0, empty file; `EvalSuiteRun` with null metrics (R-SRV-42) |
| `test/eval-seed.it.test.ts` or the existing seed test | Postgres | two seeds → two cases and two runs once, with the values above (R-SRV-43) |

The rate limit is off under `NODE_ENV=test`. Where each test belongs is decided by
`../../TESTING.md`. R-SRV-44–R-SRV-47 are checked by running `./scripts/verify-l06.sh` at the
root (R-SRV-47 with Docker stopped).

## Documentation

`README.md` — the API map gets the `eval` module and its seven routes; `docs/schema.md` — the
three tables as changed; `docs/architecture.md` — the eval run's background lifecycle and the boot
reap; a `src/modules/eval/README.md` (inputs, scoring rules, limits, failures); the root
`CLAUDE.md` Commands table and `TESTING.md` — `./scripts/verify-l06.sh`. Written by `doc-writer` after the
code is verified.

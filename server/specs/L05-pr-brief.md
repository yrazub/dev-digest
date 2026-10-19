# PR Why + Risk Brief — server
Spec ID: SPEC-2026-10-17-pr-brief · Umbrella: [`specs/L05-pr-brief.md`](../../specs/L05-pr-brief.md) · Status: approved

## Scope
Covers AC-11–AC-14 (the stored records the client shows) and AC-43–AC-84 of the umbrella (AC-83
and AC-84 through the seeded brief). It also
owns every `@devdigest/shared` contract the feature changes or adds (AC-63); the client spec refers
to them by name. The deferred umbrella criteria AC-85–AC-89 are client-only and need nothing here.

The server adds a `brief` module with `GET` and `POST /pulls/:id/brief`. `POST` collects the facts
DevDigest already holds about a pull request, fits them into an 8,000-token input, makes one
structured model call with the `risk_brief` model, validates the answer against the pull
request's files and blast-radius map, and stores the result with the head SHA in the existing
`pr_brief` table. `GET` reads it back and computes `stale`. No migration, no new table.

## What already exists

| Piece | Where |
|---|---|
| `pr_brief` table: `pr_id` uuid primary key → `pull_requests.id` (on delete cascade), `json` jsonb not null; empty in every lesson so far | `src/db/schema/reviews.ts:83` |
| `PrBrief = { intent: Intent, blast: BlastRadius, risks: Risks, history: PrHistory }` and `Risk = { kind: string, title, explanation, severity: high\|medium\|low, file_refs: string[] }`; no consumer besides the client's type re-export and `test/contracts.test.ts` | `src/vendor/shared/contracts/brief.ts` (byte-identical copy in `client/src/vendor/shared/contracts/brief.ts`) |
| `container.intent` — `get(workspaceId, prId)` returns the stored `PrIntentRecord` with `stale` computed on read, or `null`; makes no model call | `src/platform/container.ts:122`, `src/modules/intent/service.ts:238` |
| `GET /pulls/:id/blast` → `BlastRadiusResponse` (`changed_symbols`, `downstream[].callers[]` with `file` and `line`, `summary`, `totals`, `degraded`, `reason`). Its `BlastService` is built inside `src/modules/blast/routes.ts`, not on the container, so another module cannot reach it today | `src/modules/blast/routes.ts`, `service.ts` |
| Stored changed files with `additions`, `deletions` and `patch` (`pr_files`); GitHub lists at most 100 files per PR (`per_page: 100`) | `src/modules/pulls/`, `src/adapters/github/octokit.ts:104` |
| `classifyFile(path) → SmartDiffRole` | `src/modules/_shared/file-role/classify.ts:36` |
| The intent module's text rules: `sanitizeText`, `capText`, `extractHunkHeaders` (module-private: a module never imports another module) | `src/modules/intent/domain.ts` |
| Linked issue from the description: first `#N` (`resolveLinkedIssue`), and `GitHubClient.getIssue` | `src/adapters/github/octokit.ts:152`; intent service |
| `container.projectContext` — reads attached documents of one agent (`forRun({ agentId, repo })`) with the clone-file port and its skip reasons; no workspace-level read yet | `src/modules/project-context/service.ts:179` |
| `resolveFeatureModel(db, workspaceId, 'risk_brief')` → workspace override or the registry default `openai / gpt-4.1` | `src/modules/_shared/repository/feature-models.repo.ts:50`, `contracts/platform.ts:60` |
| `LLMProvider.completeStructured({ model, schema, schemaName, messages, temperature, maxTokens, maxRetries, timeoutMs, signal })` → `{ data, tokensIn, tokensOut, costUsd, attempts }` | `src/vendor/shared/adapters.ts:55-99` |
| `container.tokenizer.count(text)` — `cl100k_base`, special tokens counted as text | `src/adapters/tokenizer/index.ts` |
| `wrapUntrusted(label, content)` | `reviewer-core/src/prompt.ts:76` (imported by `src/modules/intent/prompt.ts`) |
| `MockLLMProvider` with `structuredBySchema` fixtures and a `calls` log | `src/adapters/mocks.ts:56` |
| Per-route rate limit pattern `{ rateLimit: { max: 10, timeWindow: '1 minute' } }` | `src/modules/intent/routes.ts:9` |
| Error classes: `NotFoundError` 404, `ValidationError` 422, `ExternalServiceError` 502 `external_service_error`, `AppError(code, message, status)` | `src/platform/errors.ts` |
| Seed: PR #482 with head SHA `a1b2c3d4e5f6`, nine files, patches on `src/config.ts` (`@@ -9,3 +9,7 @@`) and `src/api/users.ts` (`@@ -41,8 +41,13 @@`), a review with findings on `src/config.ts:12` and `src/api/users.ts:45-52`, an intent row, and a blast map whose callers include `src/server.ts:88` | `src/db/seed.ts` |

## Requirements (EARS)
| ID | Requirement | Covers |
|---|---|---|
| R-SRV-1 | WHEN `POST /pulls/:id/brief` is called for a pull request of the caller's workspace and generation succeeds, the API shall answer `200` with a `PrBriefResponse` whose `brief` holds `summary`, `risks.risks` and `review_focus`. | AC-43 |
| R-SRV-2 | WHEN a generation succeeds, the brief module shall upsert the `pr_brief` row of the pull request with the `PrBriefRecord` (without `stale`) as `json`, its `head_sha` equal to the pull request's `head_sha` read at the start of the generation. | AC-44 |
| R-SRV-3 | WHEN `GET /pulls/:id/brief` is called for a pull request with a stored brief, the API shall answer it from `pr_brief` and make no model call and no GitHub call. | AC-45 |
| R-SRV-4 | WHILE a pull request has no `pr_brief` row, `GET /pulls/:id/brief` shall answer `200` with `{ brief: null }`. | AC-46 |
| R-SRV-5 | WHEN the API answers a stored brief, the API shall set `stale` to `true` exactly when the brief's `head_sha` differs from the pull request's current `pull_requests.head_sha`. | AC-65 |
| R-SRV-6 | The brief module shall keep a risk file reference only when its path part — the reference up to an optional `:<line>` or `:<start>-<end>` suffix, with one leading `./` removed — equals, case-sensitively, a changed-file path of the pull request or a `file` of the blast map's `changed_symbols` or `downstream[].callers`. | AC-47 |
| R-SRV-7 | IF a risk keeps no file reference under R-SRV-6, THEN the brief module shall drop the risk. | AC-48 |
| R-SRV-8 | The brief module shall keep a review-focus item only when its `file`, with one leading `./` removed, equals a changed-file path of the pull request. | AC-49 |
| R-SRV-9 | IF a kept review-focus item's `line` lies outside every new-side hunk range of a changed file whose `patch` is stored, THEN the brief module shall set `line` to the first line of the range nearest to it (the earlier range on a tie). | AC-50 |
| R-SRV-10 | The brief module shall store in `dropped.risks` and `dropped.review_focus` the number of risks and review-focus items removed by R-SRV-7 and R-SRV-8. | AC-51, AC-13 |
| R-SRV-11 | After validation, the brief module shall keep the first 6 risks, the first 3 file references of each kept risk and the first 6 review-focus items in model order and cut the summary to at most 600 characters at a word boundary. | AC-52 |
| R-SRV-12 | The brief module shall store in `inputs` one `BriefInput` per `BriefInputKind`, in the order of the enum, with its `status`, `reason` and `omitted` count. | AC-54, AC-11, AC-12 |
| R-SRV-13 | WHEN the pull request has no stored intent, or its blast map holds no symbol, the brief module shall still make the model call, with `intent` or `blast` set to `null` in the stored brief. | AC-53 |
| R-SRV-14 | The brief module shall send the model, in this order: the title; the list of missing and trimmed inputs; the intent's summary, in-scope and out-of-scope lists; the diff totals and, per changed file, its path, role, additions, deletions and new-side hunk ranges; the blast map's summary, totals and callers as `file:line symbol`; at most 20 non-dismissed findings of the pull request's latest completed review, ordered CRITICAL → WARNING → SUGGESTION, each as `file:line severity title`; the description; the linked issue; the spec documents, each under its path. | AC-55 |
| R-SRV-15 | The brief module shall send a file's new-side hunk ranges as numbers only (`+<start>..<end>`), taken from its `@@` headers, and shall send no other text of a `patch`. | AC-56 |
| R-SRV-16 | The brief module shall count the input with `container.tokenizer.count` over the system and user messages together and shall not call the model with more than 8,000 tokens. | AC-57 |
| R-SRV-17 | WHEN the counted input exceeds 8,000 tokens, the brief module shall apply these cuts in order, recounting after each, until it fits: drop spec documents whole from the last; drop the latest review's findings from the end of their ordered list; cut the linked issue's body to 1,000 tokens, then drop the issue; cut the description to 1,500 tokens; drop the blast callers, keeping the summary and totals; drop changed files from the end of the list. | AC-58 |
| R-SRV-18 | The brief module shall never cut the title, the intent or the diff totals. | AC-59 |
| R-SRV-19 | The brief module shall make one `completeStructured` call per generation with `temperature: 0`, `maxTokens: 4000`, `maxRetries: 1`, `timeoutMs: 60000` and an abort signal. | AC-60 |
| R-SRV-20 | WHEN a generation calls the model, the brief module shall log at `info` on the request logger `Brief model call →` with `prId`, `provider`, `model`, `inputTokens`, `budgetTokens`, each input's status and the number of review findings sent, and after the call `Brief model call done ←` with `tokensIn`, `tokensOut`, `costUsd`, `attempts`, `ms` and the dropped counts; neither line shall carry pull-request text, document text or model output. | AC-61 |
| R-SRV-21 | The brief module shall resolve the provider and model with `resolveFeatureModel(db, workspaceId, 'risk_brief')` on every generation. | AC-62 |
| R-SRV-22 | `@devdigest/shared` shall define `ReviewFocusItem` and the extended `PrBrief` in `contracts/brief.ts`, and `BriefInputKind`, `BriefInputStatus`, `BriefInputReason`, `BriefInput`, `PrBriefRecord` and `PrBriefResponse` in `contracts/review-api.ts`, with the client's copies of both files byte-identical. | AC-63 |
| R-SRV-23 | IF `completeStructured` throws because the answer does not match the model schema after its repair attempt, THEN `POST /pulls/:id/brief` shall answer `502` with code `external_service_error` and write nothing. | AC-64 |
| R-SRV-24 | `container.projectContext` shall offer a workspace-level read that returns the documents attached to every enabled agent of the workspace and to those agents' enabled linked skills — agents sorted by name, each agent's paths then its skills' paths in their stored orders, each path once at its first position — read from the pull request's repository clone with the existing read rules and skip reasons. | AC-66 |
| R-SRV-25 | IF that read finds no attached path, THEN the brief module shall record `spec_documents` as `missing` with reason `none_attached`. | AC-67 |
| R-SRV-26 | IF the repository has a null `clone_path` or the clone-file port reports the clone missing, THEN the brief module shall record `spec_documents` as `missing` with reason `not_cloned`. | AC-68 |
| R-SRV-27 | The brief module shall read the intent with `container.intent.get` only and shall never call `ensure` or `regenerate`. | AC-69 |
| R-SRV-28 | IF the stored intent has `stale: true`, THEN the brief module shall use it and record `intent` as `used` with reason `stale`. | AC-70 |
| R-SRV-29 | IF the blast map is `degraded` and has at least one changed symbol, THEN the brief module shall use it and record `blast_radius` as `used` with the map's `reason`. | AC-71 |
| R-SRV-30 | IF the blast map has no changed symbol, THEN the brief module shall record `blast_radius` as `missing` with the map's `reason`, or `no_data` when the reason is null. | AC-72 |
| R-SRV-31 | The brief module shall read the linked issue with `GitHubClient.getIssue` for the first `#N` reference in the pull request's description, on the pull request's own repository. | AC-73 |
| R-SRV-32 | IF the description has no `#N` reference, there is no GitHub token, the issue is not found or the read fails, THEN the brief module shall record `linked_issue` as `missing` with reason `none_linked`, `no_token`, `not_found` or `fetch_failed`, and continue. | AC-74 |
| R-SRV-33 | IF the `risk_brief` provider has no API key, THEN `POST /pulls/:id/brief` shall answer `400` with code `brief_unavailable` and a message that names the provider, before any GitHub call. | AC-75 |
| R-SRV-34 | IF the model call throws, is aborted at 60 s, or its answer is cut off at the output limit, THEN `POST /pulls/:id/brief` shall answer `502` with code `external_service_error` and leave the `pr_brief` row unchanged. | AC-76 |
| R-SRV-35 | IF the pull request has no stored changed file, THEN `POST /pulls/:id/brief` shall answer `422` with code `validation_error` and the message "The PR's changed files are not loaded yet" and make no model call. | AC-77 |
| R-SRV-36 | IF the pull request is not in the caller's workspace, THEN `GET` and `POST /pulls/:id/brief` shall answer `404` with code `not_found`. | AC-78 |
| R-SRV-37 | WHILE a generation for a pull request is in flight in the server process, the brief module shall give a second `POST` for that pull request the same result or error and start no second generation. | AC-79 |
| R-SRV-38 | `POST /pulls/:id/brief` shall carry the per-route rate limit `{ max: 10, timeWindow: '1 minute' }`. | AC-80 |
| R-SRV-39 | IF the stored `json` does not parse as `PrBriefRecord` without `stale`, THEN `GET /pulls/:id/brief` shall answer `{ brief: null }` and log one `info` line with the pull request's id. | AC-81 |
| R-SRV-40 | The brief module shall generate a brief for a pull request of any `status`. | AC-82 |
| R-SRV-41 | `pnpm db:seed` shall insert, in its own idempotent insert outside the block that creates PR #482, the seeded brief of "Seeded brief" below, with `head_sha` equal to the seeded PR's `a1b2c3d4e5f6`, and never overwrite an existing `pr_brief` row. | AC-83, AC-84 |
| R-SRV-42 | The brief module shall store with each generated brief `generated_at`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `input_tokens` and `input_budget_tokens: 8000`. | AC-14 |
| R-SRV-43 | The system message of a generation and the field descriptions of the `BriefModelOutput` schema shall state the output limits — at most 6 risks, at most 3 paths per risk, at most 6 review-focus items, one short sentence per risk explanation and per focus reason, a summary of at most 600 characters — as text only, with no schema bound on the number of `risks`, `file_refs` or `review_focus` items. | AC-52, AC-60 |

## Contracts (`@devdigest/shared`)

Authored in `src/vendor/shared`; the same lines are synced into `client/src/vendor/shared`, so both
copies of each file stay byte-identical (R-SRV-22). Each schema has its inferred type under the
same name.

### `contracts/brief.ts`

```ts
export const ReviewFocusItem = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  reason: z.string(),
});

export const PrBrief = z.object({
  summary: z.string(),
  intent: Intent.nullable(),          // what the model was given; null when the input was missing
  blast: BlastRadius.nullable(),      // same
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  history: PrHistory,                 // always { history: [] } in this delivery
});
```

`Risk` is unchanged: `kind` stays `z.string()`, `file_refs` holds `path`, `path:line` or
`path:start-end` strings.

### `contracts/review-api.ts`

```ts
export const BriefInputKind = z.enum([
  'intent', 'blast_radius', 'diff_stats', 'description', 'linked_issue', 'spec_documents',
]);
export const BriefInputStatus = z.enum(['used', 'trimmed', 'missing']);
export const BriefInputReason = z.enum([
  'not_derived', 'stale',                                                    // intent
  'flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data', 'pr_files_missing', // blast
  'empty',                                                                   // description
  'none_linked', 'no_token', 'not_found', 'fetch_failed',                    // linked issue
  'none_attached', 'not_cloned', 'all_skipped',                              // spec documents
  'over_budget',                                                             // any trimmed input
]);
export const BriefInput = z.object({
  kind: BriefInputKind,
  status: BriefInputStatus,
  reason: BriefInputReason.nullable(),            // null when used without a remark
  omitted: z.number().int().nonnegative().nullable(), // documents, callers or files left out
});

export const PrBriefRecord = PrBrief.extend({
  pr_id: z.string(),
  head_sha: z.string(),
  generated_at: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  input_tokens: z.number().int().nullable(),
  input_budget_tokens: z.number().int().positive(),
  inputs: z.array(BriefInput),
  dropped: z.object({
    risks: z.number().int().nonnegative(),
    review_focus: z.number().int().nonnegative(),
  }),
  stale: z.boolean(),                             // computed on read; not stored
});

export const PrBriefResponse = z.object({ brief: PrBriefRecord.nullable() });
```

Input statuses by kind:

| Kind | `used` | `trimmed` (`reason: over_budget`) | `missing` |
|---|---|---|---|
| `intent` | stored intent; `reason: stale` when stale | never (R-SRV-18) | `not_derived` |
| `blast_radius` | map with symbols; `reason` = the map's degraded reason or null | callers dropped; `omitted` = callers left out | the map's reason, or `no_data` |
| `diff_stats` | always | files dropped; `omitted` = files left out | never (no files → `422`) |
| `description` | non-empty description | cut to 1,500 tokens | `empty` |
| `linked_issue` | issue read | body cut to 1,000 tokens | `none_linked` · `no_token` · `not_found` · `fetch_failed` · `over_budget` (dropped by the budget) |
| `spec_documents` | at least one document read | some documents dropped; `omitted` = documents left out | `none_attached` · `not_cloned` · `all_skipped` (every attached path skipped by the read rules) · `over_budget` (all dropped) |

The model's own output schema (`BriefModelOutput`, schema name `PrBriefDraft`) is module-local, not
a contract: `{ summary: string.min(1), risks: { kind: enum(security, db_migration, breaking_api,
perf, deps, config, other), title, explanation, severity: RiskSeverity, file_refs: string[] }[],
review_focus: { file, line: int ≥ 1, reason }[] }`. An empty summary is a schema mismatch
(R-SRV-23).

## Configuration and limits

Named constants of the module, not environment settings:

| Name | Value |
|---|---|
| input budget | 8,000 tokens (`cl100k_base`, all messages) |
| output cap (`maxTokens`) | 4,000 tokens |
| call timeout | 60,000 ms |
| repair attempts (`maxRetries`) | 1 |
| review findings in the input | at most 20, non-dismissed |
| linked issue body cut | 1,000 tokens |
| description cut | 1,500 tokens |
| risks kept / file refs kept per risk / focus items kept | 6 / 3 / 6 |
| summary cut | 600 characters, at a word boundary |
| `POST` rate limit | 10 per minute |
| spec document read limit | the project-context limit, 102,400 bytes |

The latest review's findings in the input (user answer to the former OQ-1, 2026-10-18): at most
20 non-dismissed findings of the latest completed review, ordered CRITICAL → WARNING →
SUGGESTION, each `file:line severity title` (R-SRV-14); over budget they are dropped from the end,
right after the spec documents and before the linked issue (R-SRV-17). They are not one of the six
`BriefInputKind` inputs, so they have no `inputs` entry; the `Brief model call →` line carries
their count.

Amendment, 2026-10-19 — Regenerate failed with `output_truncated` on a 100-file PR (#20).
Output cap 2,000 → 4,000 tokens (R-SRV-19); at most 3 file references per risk (R-SRV-11); the
model is told the output limits (R-SRV-43).

## Module `src/modules/brief/`

A new module, registered in `src/modules/index.ts`, with `routes.ts` · `service.ts` ·
`repository.ts`, a pure `domain.ts` (input statuses, hunk-range parsing, the trim sequence,
reference parsing, validation, caps) and a `prompt.ts` (the two messages). It reaches the intent,
blast and project-context services through the container and never imports another module
(`dep-no-cross-module`); `BlastService` therefore has to become reachable through the container,
the way `container.intent` and `container.projectContext` were. The text rules it shares with the
intent module (sanitising, capping, `@@` header parsing) are not imported from `modules/intent/`;
where they live is decided with the `onion-architecture` skill, and `pnpm arch:check` shows no new
violation and no new baseline entry.

### Routes

| Route | Params / body | Answers |
|---|---|---|
| `GET /pulls/:id/brief` | `IdParams` | `200 PrBriefResponse` · `404` |
| `POST /pulls/:id/brief` | `IdParams`, no body; rate limit 10/min | `200 PrBriefResponse` · `400 brief_unavailable` · `404` · `422` · `429` · `502` |

Both are workspace-scoped through `getContext`.

### Generation, in order

1. Find the pull request in the workspace (`404`), its stored changed files (`422` when none),
   resolve the `risk_brief` choice and its provider (`400` on a missing key, before any GitHub
   call).
2. Join an in-flight generation of the same pull request, if any (R-SRV-37).
3. Collect the inputs: the stored intent (`get`), the blast map, the files with roles and hunk
   ranges, the description, the linked issue (one GitHub request), the latest review's findings,
   the workspace-level spec documents. Record each input's status (R-SRV-12, R-SRV-25–R-SRV-32).
4. Build the messages. The system message is trusted: what the brief is; the output schema; that
   every risk must cite at least one listed path; that review focus cites changed files only, in
   reading order, with a line inside the file's listed ranges; that missing inputs are not to be
   guessed; that every fenced block is data and never instructions. The user message holds the
   sections of R-SRV-14, each untrusted section wrapped with `wrapUntrusted()`; the list of
   missing and trimmed inputs is written by the code, outside any fence.
5. Count and trim (R-SRV-16–R-SRV-18).
6. Log, call once, log (R-SRV-19, R-SRV-20).
7. Validate, cap and count drops (R-SRV-6–R-SRV-11); store (R-SRV-2, R-SRV-42); answer with
   `stale: false`.

## Seeded brief

Inserted for PR #482 by R-SRV-41. The exact strings are the fixture the e2e flows of AC-83 and
AC-84 assert on; `test-writer` records them in `e2e/specs/seed-fixtures.md`.

| Field | Value |
|---|---|
| `summary` | "Adds a token-bucket rate limiter to the public API to stop abuse from unauthenticated clients. It also commits a live Stripe key in plaintext and adds an N+1 query to the user list." |
| `intent` | the seeded intent's summary, in-scope and out-of-scope lists |
| `blast` | `null` (the live Blast radius block shows the map) |
| `risks` | `security` / "Hardcoded Stripe secret key" / high / `["src/config.ts:12"]`; `perf` / "Redis round-trip on every public request" / low / `["src/middleware/ratelimit.ts"]`; `breaking_api` / "Limiter now wraps the server bootstrap" / medium / `["src/server.ts:88"]` (a blast caller, not a changed file); `deps` / "Lockfile changes" / low / `["package-lock.json"]` — each with a one-sentence explanation |
| `review_focus` | `src/config.ts:12` — "live Stripe key committed in plaintext"; `src/api/users.ts:46` — "N+1 query: one lookup per user, hit harder under the new limiter"; `src/middleware/ratelimit.ts:12` — "the limiter's entry point: check that the 429 branch sends Retry-After" |
| `history` | `{ history: [] }` |
| `head_sha` | `a1b2c3d4e5f6` |
| `provider` / `model` | `seed` / `seed` |
| `tokens_in`, `tokens_out`, `cost_usd`, `input_tokens` | `null` |
| `input_budget_tokens` | 8000 |
| `inputs` | `intent` used; `blast_radius` used; `diff_stats` used; `description` used; `linked_issue` missing `none_linked`; `spec_documents` missing `none_attached` |
| `dropped` | `{ risks: 0, review_focus: 0 }` |

## Tests

| File | Kind | Covers |
|---|---|---|
| `test/brief-domain.test.ts` | hermetic | reference parsing with `path`, `path:12`, `path:12-18`, `./path`; risk refs kept for a PR file and a blast caller file, dropped otherwise; a risk with no ref left dropped; focus kept only for PR files (R-SRV-6–R-SRV-8); line moved into the nearest range, ties to the earlier one, kept for a file without a patch (R-SRV-9); dropped counts (R-SRV-10); caps at 6 and 600 characters at a word boundary, with 7+ items (R-SRV-11); an answer with 7 risks, a risk with 5 refs and 7 focus items capped to 6 / 3 / 6 (R-SRV-11); input statuses and reasons for every row of the status table (R-SRV-12, R-SRV-25, R-SRV-26, R-SRV-28–R-SRV-30, R-SRV-32); hunk ranges from `@@` headers, including `+c,0` and a missing count (R-SRV-15); review findings capped at 20 from a fixture of 25, dismissed ones left out, ordered CRITICAL → WARNING → SUGGESTION (R-SRV-14); the trim sequence over a fixture that needs every cut, with the findings dropped after the spec documents and before the linked issue, and title, intent and totals never cut (R-SRV-16–R-SRV-18) |
| `test/brief-prompt.test.ts` | hermetic | message order and sections (R-SRV-14); each untrusted section inside `wrapUntrusted()`; no line of a stored patch other than its range numbers (R-SRV-15); the system message states the output limits; the `BriefModelOutput` descriptions carry them, with no count bound on `risks`, `file_refs` or `review_focus` (R-SRV-43) |
| `test/brief.it.test.ts` | Postgres, mock LLM, mock GitHub | `POST` `200` shape and storage with `head_sha` (R-SRV-1, R-SRV-2, R-SRV-42); `GET` from the cache with the mock's `calls` unchanged (R-SRV-3), `brief: null` (R-SRV-4), `stale` after `head_sha` changes (R-SRV-5); exactly one `completeStructured` call, carrying `maxTokens: 4000` (R-SRV-19); an answer with 7 risks, a risk with 5 refs and 7 focus items is accepted with `200` and stored capped to 6 / 3 / 6 (R-SRV-11, R-SRV-43); log lines without PR text (R-SRV-20); the `risk_brief` override used (R-SRV-21); schema mismatch `502` with the row unchanged (R-SRV-23); generation with no intent and with an empty blast map (R-SRV-13); intent never derived — the intent store unchanged (R-SRV-27); linked issue read and its misses (R-SRV-31, R-SRV-32); `400`, `502` on a throw and a timeout, `422`, `404` (R-SRV-33–R-SRV-36); two concurrent `POST`s give one model call (R-SRV-37); an unparseable row reads as `null` (R-SRV-39); a merged PR (R-SRV-40); the prompt sent to the mock holds no patch line (R-SRV-15) |
| `test/project-context-service.test.ts` | hermetic | the workspace-level read: two enabled agents and a disabled one, a disabled skill, a path attached twice, name order (R-SRV-24) |
| `test/contracts.test.ts` | hermetic | the new contracts; `PrBrief` with `intent: null` and `blast: null`; `ReviewFocusItem.line` rejecting 0 (R-SRV-22) |
| a contract-sync check (placement decided by the planner) | hermetic | `client/src/vendor/shared/contracts/brief.ts` and `review-api.ts` byte-identical to the server's (R-SRV-22) |
| `test/seed*.it.test.ts` or the existing seed test | Postgres | the seeded brief exists once after two seeds and has the seeded `head_sha` (R-SRV-41) |

`POST /pulls/:id/brief`'s rate limit is off under `NODE_ENV=test`; R-SRV-38 is checked by
reading the route's config in a test, not by sending 11 requests. Where each test belongs is
decided by `../../TESTING.md`.

## Documentation

`README.md` — the API map gets the `brief` module and its two routes; `docs/schema.md` — the
`pr_brief` row is filled from L05 on, with the JSON shape `PrBriefRecord` without `stale`; a
`src/modules/brief/README.md` like the intent module's (inputs, budget, validation, failures,
logging). Written by `doc-writer` after the code is verified.

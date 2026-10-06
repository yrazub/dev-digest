# L03 — Intent layer (server)

A new `intent` module derives a PR's intent with a separate cheap classifier call, stores it
per PR, serves it over two routes, and hands it to the review run as shared pre-work. The
`reviews` module injects it into every agent's prompt and applies the engine's scope filter.

Read [`specs/L03-intent-layer.md`](../../specs/L03-intent-layer.md) first: it defines the
requirements R1–R9, the sources, confidence, missing context, the cache key and the trust
rules. The engine half is [`../../reviewer-core/specs/L03-intent-scope.md`](../../reviewer-core/specs/L03-intent-scope.md).
Layering follows the `onion-architecture` skill: route → service → store port → repository,
with `pnpm arch:check` green and no new baseline entry.

This text describes the behaviour after phase 11 of the plan (`specs/L03-intent-layer-plan.md`):
the classifier's risk-area item comes from the contract, and `sanitizeText` and
`extractReferences` scan author text in linear time with what they detect unchanged.

Built in phases: **4** (schema, GitHub file port, pure rules, classifier prompt), **5**
(repository, service, routes, wiring, seed), **6** (review-run integration), **10**
(review fixes: parse on read, GitHub outcomes reported at the port, this spec completed to
the whole module) and **11** (the classifier schema from the contract, linear scans).

## What already exists

| Piece | Where | State |
|---|---|---|
| `pr_intent` table (`pr_id` PK, `intent`, `in_scope`, `out_of_scope`) | `src/db/schema/reviews.ts` | present, never written |
| `Intent`, `PrIntentRecord`, `IntentSource`, `FindingScope` | `src/vendor/shared/contracts/` | present (phase 1) |
| `review_intent` feature model and its Settings picker | `contracts/platform.ts`, `modules/settings/` | selectable; the intent service reads it |
| `GitHubClient.getIssue` | `src/adapters/github/octokit.ts` | works; returns `IssueMeta \| null` (null: no such issue) and wraps every other failure in `ExternalServiceError` (phase 10) |
| `wrapUntrusted` | `@devdigest/reviewer-core` | exported (phase 3) |

## Schema — one migration, generated

`pnpm db:generate` produced `0013_*.sql`: only `ADD COLUMN`.

| Table | Column | Type |
|---|---|---|
| `pr_intent` | `risk_areas` | `jsonb` not null default `[]` |
| | `confidence` | `text` enum `high \| medium \| low`, not null default `low` (no database constraint) |
| | `sources` | `jsonb` not null default `[]` |
| | `missing_context`, `injection_suspected` | `boolean` not null default `false` |
| | `source_hash`, `provider`, `model` | `text`, nullable |
| | `tokens_in`, `tokens_out` | `integer`, nullable |
| | `cost_usd` | `double precision`, nullable |
| | `computed_at` | `timestamptz` not null default `now()` |
| `findings` | `scope` | `text`, nullable (`in_scope` / `out_of_scope`) |

The `intent` column keeps its name and holds `Intent.summary`; the repository maps it. Raw
source text is never stored.

## Adapter — `GitHubClient.getIssue` and `getFileContent`

These two methods report their outcome at the port, so the intent service never inspects an
SDK error or an HTTP status. A 404 is a value, never an exception; every other failure is
thrown as an `ExternalServiceError` (`src/platform/errors.ts`). The port file
(`src/vendor/shared/adapters.ts`) names that class in a comment only: it cannot import
`src/platform`. The other methods of `OctokitGitHubClient` still rethrow what the SDK throws.

```ts
getIssue(repo, n): Promise<IssueMeta | null>;                       // null: no such issue (404)
getFileContent(repo, path, ref, { maxBytes? }): Promise<RepoFileResult>;
type RepoFileMissReason = 'not_found' | 'too_large' | 'not_a_file' | 'empty';
type RepoFileResult = { file: RepoFile } | { file: null; reason: RepoFileMissReason };
```

`getFileContent` reads one file through the GitHub contents API (never the local clone).
`adapters/github/content.ts` (`toRepoFile`, pure) maps the payload, checked in this order:

| Payload | Result |
|---|---|
| a directory (array), `null` or a non-object; a `type` other than `file` (symlink, submodule); a `size` that is not a number | `{ file: null, reason: 'not_a_file' }` |
| `size` above `maxBytes` (default 200 000) | reason `too_large` (checked before content, so an oversized empty file is `too_large`) |
| `content` not a string, or decoding to an empty string | reason `empty` |
| anything else | `{ file }`, base64 decoded as UTF-8 |

`toRepoFile` never returns `not_found`: a 404 from the API is the adapter's. In
`OctokitGitHubClient` both methods run inside `withRetry` + `withTimeout`; a 404 becomes
`null` / `{ file: null, reason: 'not_found' }`, and every other failure (SDK error,
transport error, `TimeoutError`) is rethrown as `ExternalServiceError` whose message names
the operation, `owner/name`, the issue number or `path@ref` and the HTTP status, with
`details: { status }`. The SDK error object, its `request` / `response`, any header and the
token are never attached. A 429 or 5xx is retried with backoff before it is thrown.
`resolveLinkedIssue` (inside `octokit.ts`) maps a null issue to `undefined` and keeps its
`try/catch`. The constructor takes an optional `opts?: { fetch?: typeof fetch }`, passed to
Octokit as `request.fetch`, so a test stubs the SDK's HTTP; `container.ts` passes the token only.

`MockGitHubClient` options:

| Option | Effect |
|---|---|
| `issues: Record<number, IssueMeta \| null \| Error>` | a value is returned, `null` resolves null, an `Error` is thrown; an unset number → a canned issue |
| `files: Record<"<ref>:<path>", string>` | content for `getFileContent`; `''` → `empty`; UTF-8 size above `opts.maxBytes ?? 200 000` → `too_large`; an unset key → `not_found` |
| `fileMisses: Record<"<ref>:<path>", RepoFileMissReason \| Error>` | checked before `files`: a reason resolves `{ file: null, reason }`, an `Error` is thrown |
| `issueRequests`, `fileRequests` | every call, recorded first, in call order |

## Pure rules — `src/modules/intent/domain.ts`

| Rule | Behaviour |
|---|---|
| `sanitizeText` | removes HTML comments (an unterminated one runs to the end), invisible and bidirectional characters; normalises line endings; collapses blank-line runs; returns the counts removed. The scan is linear in the length of the text |
| `extractHunkHeaders` | the `@@` lines of a patch only, with git's trailing context; 8 per file, 160 chars each. `formatChangedFiles` adds 60 files and 4000 chars in total |
| `documentMissReason` | `RepoFileMissReason` → `IntentSourceReason`: `not_found` → `not_found`, `too_large` → `too_large`, `not_a_file` → `unsupported` (the path exists but is not an object the feature reads), `empty` → `not_found` (no document text; recording it `used` would raise the tier with nothing read) |
| `normalizeRepoPath` | `null` for an empty path, a backslash, a leading `/`, an empty or `..` segment, a control character or an extension outside `.md .mdx .txt .rst .adoc`; a leading `./` is dropped |
| `extractReferences` | every reference with its kind and whether it is fetchable (table below). The scan is linear in the length of the text |
| `isSubstantiveDescription` | at least 80 chars after sanitising |
| `hasMissingContext` | an unavailable `linked_issue` or `spec_document`; an `external_link` does not count |
| `deriveConfidence` | base tier from what was read, one tier down for missing context, forced `low` by a suspected injection, and by `basis: 'insufficient'` only when no linked issue or specification was read (otherwise `basisOverruled` is true and the tier stands) |
| `sourceHash` | sha256 of prompt version, `provider/model`, head SHA, title, body |
| `IntentClassification`, `clampClassification` | the classifier's output schema (`.describe()` on every field; the risk-area item is the contract's `IntentRiskArea` with a description on each field, not a second object) and its caps: summary 300; ≤ 6 items of 120 per scope list; ≤ 5 risk areas with an 80-char label. Output text is made plain (backticks removed) and a text over its cap ends with an ellipsis and is cut at the last word boundary that fits (`capWords`) — hard at the cap only when the text has no space or its last fitting space lies in the first half of the cap; a risk area that only says there is no risk (`No …`, `None`, `N/A`, `Nothing …`) is dropped |

### Reference detection

| In the description | Kind | Fetchable |
|---|---|---|
| closing keyword + `#n`, bare `#n`, `owner/repo#n` or issue URL of this repository | `linked_issue`, ref `#n` | yes |
| `owner/repo#n` or issue URL of another repository | `linked_issue` | no, `unsupported` |
| `*.atlassian.net`, `linear.app`, or a ticket key (`PAY-123`) right after `closes/fixes/resolves/refs/ticket/issue/jira/linear` | `linked_issue` | no, `unsupported` (a bare `UTF-8` or `SHA-256` is not a ticket) |
| markdown link or bare repo-relative path ending in `.md .mdx .txt .rst .adoc`, or a `blob` URL of this repository to such a file | `spec_document`, ref = path | yes; `rejected`, never requested, only when the document path fails `normalizeRepoPath` |
| `blob` URL of another repository, a `notion.so` / `docs.google.com` / `/wiki/` URL, any URL whose text or path matches `spec\|plan\|rfc\|adr\|design\|proposal\|prd` | `spec_document` | no, `unsupported` |
| any other `https` URL that is not an image or a GitHub asset | `external_link` | no, `unsupported` |
| a fourth and later fetchable reference of one kind | its kind | no, `skipped` |

A relative markdown link or a `blob` URL of this repository to a path that does not end in a
document extension, or a `blob` URL with nothing after the ref, is a link to source code, not
a plan or specification: it is ignored — not recorded and not missing context. Recording it as
`spec_document` / `rejected` would lower the confidence tier of every PR that links to a code
file. A `blob` URL of another repository is `unsupported` whatever its extension. Pass the
sanitised description, so a reference hidden in an HTML comment is not found. For a `blob`
URL the ref in the URL is discarded: it is the PR branch, the base branch, a hex SHA, or
otherwise the first segment.

### Scanning cost

`sanitizeText` and `extractReferences` read author text before any cap is applied: the whole
sanitised description (the 4000-character cap is the prompt builder's, so a reference past it
still counts), every fetched issue title and body, and every fetched document (up to 200 000
bytes). Each scan in them is linear in the length of that text. Six scans were not, because a
failed attempt at one position scanned text again that the attempts at the following positions
scanned; each replacement is the old rule plus a skip of attempts that fail anyway:

1. HTML comments (`sanitizeText`): an opener with no `-->` after it matches through to the end
   and is left in place for the unterminated-comment pass; no `-->` after one opener means none
   after any later opener.
2. Closing keywords: the separator between keyword and `#` is written so that a run of spaces
   splits in one way only; nothing is skipped.
3. Markdown images: a hand-written scan; every `![` before one `]` shares that `]`, and with no
   `]` or no `)` left in the text no later image can close.
4. Markdown links: a hand-written scan that tries the link's tail once per `]`; every `[` before
   one `]` shares that `]`, and two targets that start in the same run of target characters end
   at the same place and are followed by the same text.
5. Trailing punctuation of a bare URL: a loop from the end; the same characters are removed.
6. Bare paths: the pattern swallows the rest of a run of path characters when no path starts
   at this position; inside one run a later start sees a subset of the endings an earlier start
   saw. The lookbehind is left as it is, so a path that starts right after a `+` is still found:
   in `x:notes+docs/a.md` the start at `n` is blocked by the `:` and `docs/a.md` is found from
   the `d`.

No cap is put on the scanned text: with linear scans it would add a rule and protect nothing.

## Routes — `src/modules/intent/routes.ts`

| Method · path | Result | Notes |
|---|---|---|
| `GET /pulls/:id/intent` | `PrIntentResponse` `{ intent }` | pure read; `stale` computed on read; `404` unknown PR; a stored row that fails its read parse answers `200` `{ intent: null }` and logs one line; never a 5xx for that |
| `POST /pulls/:id/intent` | `PrIntentResponse` | no body; always recomputes; rate limit 10/min; `404` unknown PR; `400` code `intent_unavailable` when the configured provider has no key; `502` `external_service_error` when the call fails or its output is invalid after the retry |

Both handlers use `getContext` (workspace scope), one service call each, and pass `{ onEvent }`
built by one module-level helper that mirrors the service's events to `req.log.info`.
`POST` emits `Deriving PR intent…` itself; `GET` does not. Routes declare no response schema.
The service comes from `container.intent`.

## Store port and repository — `ports.ts`, `repository.ts`

`IntentStore` (`ports.ts`, structural types only):

```ts
getPullContext(workspaceId, prId, { includeFiles? }): Promise<IntentPullContext | undefined>;
getIntent(prId, opts?: IntentReadOptions): Promise<StoredIntent | undefined>;  // undefined: no row, or an unreadable one
upsertIntent(prId, values: IntentValues): Promise<StoredIntent>;               // the written values and `computedAt`; no parse
featureModelOverride(workspaceId): Promise<FeatureModelChoice | undefined>;
interface UnreadableIntent { prId: string; columns: string[] }                 // column names only, never stored values
interface IntentReadOptions { onUnreadable?: (info: UnreadableIntent) => void }
```

`IntentRepository` implements it over Drizzle. It owns `pr_intent`, reads `pull_requests`,
`repos` and `pr_files` (workspace-scoped through the PR) and `settings.feature_models`
(`review_intent`, parsed with `FeatureModelChoice.safeParse`). It does not read `pr_commits`
and does not log. `summary` is stored in the `intent` column.

- **Parse on read.** `in_scope`, `out_of_scope` (`z.array(z.string())`), `risk_areas`
  (`IntentRiskArea[]`), `sources` (`IntentSource[]`) and `confidence` (`IntentConfidence`) are
  `jsonb` / text-enum columns the database does not enforce, so the mapper `safeParse`s them
  with the `@devdigest/shared` schemas. A row that fails is not returned: `getIntent` calls
  `opts.onUnreadable({ prId, columns })` with the snake_case names that failed and resolves
  `undefined`. It never throws for a failed parse. `provider` keeps its
  `Provider.safeParse(…).data ?? null`. No `as` cast on a column value.
- **No parse on write.** The values already passed `IntentClassification` and the clamp;
  `upsertIntent` returns `{ prId, ...values, computedAt }` with `computedAt` from `.returning()`.

`findingRowToDto` (`modules/_shared/finding-dto.ts`) reads `findings.scope` through
`FindingScope.safeParse`: a value outside the enum reads as `null`.

## Pipeline — `service.ts`

`IntentService` (narrow dependencies: the store, lazy `github()` and `llm(provider)`, a
tokenizer):

```ts
get(workspaceId, prId, { onEvent? }): Promise<PrIntentRecord | null>;     // null: no row, or an unreadable one
ensure(workspaceId, prId, { onEvent? }): Promise<EnsureResult>;           // never throws for provider, GitHub or model failures
regenerate(workspaceId, prId, { onEvent? }): Promise<PrIntentRecord>;     // forced; throws AppError
```

1. **When.** `GET` never computes. `POST` always recomputes (Derive / Re-run). A review run
   calls `ensure` as its first shared step.
2. **Cache and staleness.** `source_hash = sha256(INTENT_PROMPT_VERSION, provider/model, head
   SHA, title, body)`. `stale` is true on read when the stored hash differs from the current
   one; a null hash (the seeded row) is never stale on read. A review run recomputes when no
   row exists, when the stored hash is null or when it differs.
3. The provider is resolved before any GitHub call, so a missing key costs no network.
4. Budgets: 20 s for gathering and 30 s for the model call (`withTimeout`), `maxRetries: 1`,
   `temperature: 0`, `maxTokens: 2000`. The default model reasons before it answers and its
   reasoning tokens count against `maxTokens`: at 800 a PR with a linked document was cut off
   mid-JSON (`finish_reason: length`) and paid for a second attempt, which then ran into the
   30 s budget. The answer itself is 200–450 tokens; the rest is room for reasoning
   (measured 2026-10-06, `deepseek/deepseek-v4-flash`).
   An answer that is still cut off at that limit is not asked for again: the OpenRouter
   provider throws `OutputTruncatedError` instead of entering its repair loop, and the
   outcome is `unavailable` with reason `output_truncated`. A repair retry is kept for an
   answer that finished but does not match the schema. An answer with an empty summary is
   treated as `schema_invalid` and never stored.
   The call is made with `reasoning: false` (OpenRouter's `reasoning: { enabled: false }`):
   the reasoning pass was 60–70% of the output tokens. It also carries an `AbortSignal` that
   the service aborts when the call fails or its 30 s budget runs out, so the HTTP request is
   dropped and no further attempt starts.
5. Failure inside a review run is non-fatal: no row is written, the `intent` slot is omitted,
   no scope filter runs.
6. Confidence is computed in code (see `deriveConfidence`).
7. **An unreadable stored row is treated as absent.** `get` and the run read the row through
   one private helper that passes `onUnreadable` and emits exactly
   `Intent: stored row unreadable (<columns joined by ", ">) — treated as not derived` as kind
   `info`. `get` returns `null` (the card shows the empty state; it is polled every 4 s and
   never throws for this); a run recomputes, and the next derivation overwrites the row. The
   service does not re-parse stored values.

**How a read ends.** The port reports the outcome and the service only maps it.

| Read | Port result | Recorded as | Read again at `pull.base`? |
|---|---|---|---|
| `getIssue` | an `IssueMeta` | `used` | — |
| `getIssue` | `null` | `unavailable`, `not_found` | — |
| `getFileContent` | `{ file }` | `used` | no |
| `getFileContent` at the head SHA | `{ file: null, reason: 'not_found' }` | decided by the base read, with the base read's reason | yes, once (only when `base !== headSha`) |
| `getFileContent` | reason `too_large` | `unavailable`, `too_large` | no |
| `getFileContent` | reason `not_a_file` | `unavailable`, `unsupported` | no |
| `getFileContent` | reason `empty` | `unavailable`, `not_found` | no |
| either | throws `ExternalServiceError` (any other GitHub or transport failure, a timeout) | `unavailable`, `fetch_failed` | no |
| either | the lazy client throws `ConfigError` (no token) | `unavailable`, `no_token` | — |

A reference that is not fetchable is recorded without a request (`unsupported`, `rejected`
or `skipped`, see Reference detection). `regenerate` maps a missing key to
`AppError('intent_unavailable', …, 400)` and a model or schema failure to `ExternalServiceError`.

## Review-run integration — `modules/reviews/`

- `run-executor.ts` calls `this.container.intent.ensure(workspaceId, pull.id, { onEvent })` once
  per batch, after the diff is loaded, inside `try/catch`. The step is published with
  `runLog.tool('Deriving PR intent…')`, not `runLog.step`: `RunLogger.step` emits an `error`
  event on throw and the client turns every `error` event into a toast. An unexpected throw is
  logged as `info` and the run continues without an intent. No import from `modules/intent/`.
- Per agent: `renderIntentBlock(record)` (`reviews/domain.ts`, pure) builds the block — a list
  with no items is left out, the `Missing context` line appears only when `missing_context` is
  true, one caution line appears when `injection_suspected` is true, capped at 2000 chars.
  `scopeFilterEnabled(record)` is true for `high` and `medium` confidence that is not
  injection-suspected. `intent` and `scopeFilter` are spread into `reviewPullRequest` only when
  a record exists.
- `trace.prompt_assembly.intent` holds the block or null; `stats.scope_filtered` is
  `outcome.filtered.length` when the filter ran, else null; `tool_calls` starts with
  `{ tool: 'classify_intent', args: '<provider>/<model>', meta: 'computed · <in> in / <out> out
  tok · <cost>' | 'cached' | 'unavailable (<reason>)', ms }`, followed by the `review_file`
  entries. `config.model` and `stats` stay the main review's.
- `findings.scope` persists the reviewer's tag; `insertFindings` writes `scope: f.scope ?? null`.

## Classifier prompt — `src/modules/intent/prompt.ts`

`buildIntentMessages(input)` returns two messages and the component sizes. The system message
carries the role and the judgment rules (untrusted blocks are data; do not guess what an
unavailable source says; `insufficient` when the missing material was the main statement of
the task) and never describes the JSON shape. The user message holds one `wrapUntrusted`
block per source: `pr-title`, `pr-description`, `issue-<n>`, `document-<path>`,
`changed-files`, `unavailable-references`. Caps: title 300, description 4000, issue title 300
+ body 3000, document 8000. Change bodies never reach it.

## Logging

Every line goes through the sink the caller passes: in a review run the fanned-out
`RunLogger` (Live Log, persisted `run_traces.log`, pino mirror); on the routes `req.log`.
Kinds are `info`, `tool`, `result` only — never `error`.

**Call 1 — the intent classifier** (shared pre-work, once at the top of every queued run's log):

| When | Kind | Message |
|---|---|---|
| start | `tool` | `Deriving PR intent…` |
| cache hit | `info` | `Intent: cached (<tier> confidence, head <sha7>) — classifier not called` |
| sources | `info` | `Intent sources: read title, description, issue #471, changed files · unavailable specs/x.md (not_found), https://acme.atlassian.net/… (unsupported)` |
| gathering cost | `info` | `Intent gathered in 575 ms · 4 GitHub read(s)` — every issue read, every document read and each base-branch re-read counts |
| prompt components | `info` | `Intent prompt components: system 1240 ch · title 62 ch · description 1840/4000 ch (truncated) · issue #471 2100 ch · changed files 9 paths, 14 hunk headers, 1120 ch · unavailable references 2` |
| sanitiser removed something | `info` | `Intent sanitiser: 2 HTML comment(s), 5 invisible char(s) removed` |
| before the call | `tool` | `Intent classifier call → openrouter/deepseek/deepseek-v4-flash · ~2950 tok estimated` |
| after the call | `result` | `Intent classifier done ← openrouter/deepseek/deepseek-v4-flash · 2912 in / 164 out tok · $0.0004 · 1 attempt(s) · 2130 ms` |
| more than one attempt | `info` | `Intent classifier needed 2 attempts — an earlier output did not match the schema; tokens and cost are the sum` |
| result | `result` | `Intent derived: medium confidence · 3 in scope · 3 out of scope · 2 risk area(s)` |
| downgrade | `info` | `Intent: missing context — confidence lowered to <tier>` / `basis insufficient — forced to low` / `injection suspected — forced to low` |
| basis overruled | `info` | `Intent: the classifier reported its basis as insufficient, but a linked issue or specification was read — not applied` |
| failure | `info` | `Intent unavailable (<reason>) — continuing without it` |
| stored row unreadable (review run, `GET`, `POST`) | `info` | `Intent: stored row unreadable (<column>, <column>) — treated as not derived` |

The `Intent classifier done` event also carries a structured `data` object for the pino
mirror: `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`,
`tokens_estimated`, `cost_usd`, `latency_ms`, `attempts`, `confidence`, `outcome`,
`sources: [{ kind, ref, status, reason, chars, truncated }]`, `sanitizer`.

**Call 2 — the main review**, per agent:

| When | Kind | Message |
|---|---|---|
| start (existing) | `info` | `Starting review with agent "<name>" (<provider>/<model>)` |
| intent attached | `info` | `Intent attached · ~<n> tok · scope filter on` / `… off (<low confidence \| injection suspected>)` |
| after the engine returns | `result` | `Review call done ← <provider>/<model> · <in> in / <out> out tok · <cost> · <n> call(s)` |
| each filtered finding | `info` | `scope filtered "<title>" (<SEVERITY>, <file>:<line>): <reason>` |
| totals | `result` | `Scope filter: <n> out-of-scope finding(s) filtered · <m> signal(s) kept` |

The classifier pair and the review line each name their own provider/model and token counts
(R9). The classifier's tokens and cost are also on the `pr_intent` row.

**Deliberately not logged, in a message or in `data`:** API keys and tokens; the title,
description, issue and document text; hunk headers; any diff content; the classifier's raw
output; the stored values of an unreadable `pr_intent` row (that line names columns only); an
SDK error object, its request or its headers. Intent lines carry lengths, counts, references
and reasons only. A source `ref` is a reference the author wrote, capped at 120 chars.

## Seed

`src/db/seed.ts` inserts one `pr_intent` row for PR #482 after the PR block, outside
`if (!pr)` (a seed change inside that block never reaches an already-seeded database), with
`onConflictDoNothing()`: the design reference's summary, three in-scope items, three
out-of-scope items and three risk areas, `confidence: 'medium'`, sources `title`,
`description`, `changed_files` (all `used`), `missing_context: false`, `model: 'seed'` and
`source_hash` null (so a review run recomputes it and the card never reads it as stale). The
strings are the fixtures flow `09-pr-intent` asserts on (`e2e/specs/seed-fixtures.md`).
Two `seed()` calls leave one row.

## Tests (written by `test-writer`)

| File | Covers |
|---|---|
| `test/intent-domain.test.ts` | sanitiser, hunk headers, references, `normalizeRepoPath`, missing context, confidence, `sourceHash`, `clampClassification`, `documentMissReason`; hostile inputs of about 262 144 characters (link, image, `+`, path, keyword and URL-dot runs; `'<!--'` repeated in `sanitizeText`), each under 1 000 ms; equivalence cases for each rewritten scan (what the pre-phase functions returned); the risk-area item against the contract |
| `test/intent-prompt.test.ts` | one block per source, unavailable-only listing, empty description, no patch body, neutralised `</untrusted>`, `components` |
| `test/github-content.test.ts` | `toRepoFile`: a file, a directory, a symlink, a submodule, an oversized file, empty content, a missing `size`, oversized-and-empty |
| `test/github-octokit.test.ts` | `OctokitGitHubClient` with a stub `fetch`: 200, 404 as a value, 403 as `ExternalServiceError` without the token, a directory payload |
| `test/adapters.test.ts` | `MockGitHubClient`: `files`, `fileMisses`, `issues`, the request records |
| `test/shared-finding-dto.test.ts` | `findingRowToDto` scope pass-through, null and out-of-enum values |
| `test/intent-service.test.ts` | hermetic, in-memory store: sources, confidence, caching, every read outcome of "How a read ends", an unreadable row, events, no content in logs |
| `test/intent-routes.it.test.ts` | `GET` / `POST` on real Postgres with overrides, model resolution, `stale`, `404`, `400`, the seed, an unreadable row answering `{ intent: null }` |
| `test/reviews-domain.test.ts` | `renderIntentBlock`, `scopeFilterEnabled` |
| `test/reviews-intent.it.test.ts` | the run end to end: the intent block, two models, the trace (read through `waitForRunTrace`), the filter, a failed classification |
| `test/reviews-skills.it.test.ts`, `test/reviews.it.test.ts` | setup only: `secrets` and `github` overrides; the first test selects the `Review` call; the trace is read through `waitForRunTrace` (`test/helpers/runs.ts`) |
| `test/contracts.test.ts` | the `Intent` fixture with `summary` |

A test reads a run's trace through `waitForRunTrace`, which polls until the route answers
`200`: the executor marks the run row `done` before it writes the trace document, and that
order is unchanged.

Run the server suite under a throwaway `HOME` until the review integration tests override
`secrets` and `github`: the intent pre-step resolves keys through `~/.devdigest/secrets.json`.

## Acceptance

- [ ] A database migrated from zero has the twelve new `pr_intent` columns and `findings.scope`.
- [ ] `GitHubClient` has `getFileContent` returning `RepoFileResult` and `getIssue` returning
      `IssueMeta | null`, in the Octokit adapter and its mock; the adapter never lets an SDK
      error out of these two methods.
- [ ] The pure intent rules exist with no new `arch:check` violation.
- [ ] On a seeded database `GET /pulls/:id/intent` for PR #482 returns the seeded record, and
      `POST /pulls/:id/intent` with a stubbed classifier stores and returns a record whose
      `summary`, sources, `missing_context` and confidence follow the rules above.
- [ ] A review run with a stubbed classifier stores a trace that shows the classifier call and
      the review call as two entries with two models, holds the intent block in
      `prompt_assembly.intent`, and persists only the in-scope findings plus one signal per
      serious out-of-scope problem; a run whose classification fails still ends `done` with
      every finding kept.
- [ ] A `pr_intent` row with a malformed `sources` or `confidence` value makes
      `GET /pulls/:id/intent` answer `200` `{ intent: null }` with one
      `Intent: stored row unreadable (…)` line, and is replaced by the next derivation.
- [ ] `service.ts` contains no `statusOf` and no read of an error's `status`; an oversized
      linked document is recorded `unavailable` / `too_large` after a single request at the
      head SHA; `findingRowToDto` contains no cast on `scope`.
- [ ] `sanitizeText` and `extractReferences` scan a 262 144-character hostile text in under a
      second, and what is detected is unchanged.
- [ ] `arch:check` reports no new violation and the baseline file is unchanged.

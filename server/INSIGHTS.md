# Insights — `@devdigest/api`

Traps we have already hit in the server. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## Codebase Patterns

- **2026-09-20** — `src/vendor/shared` is the **authored** `@devdigest/shared`: both
  `server/tsconfig.json` and `reviewer-core/tsconfig.json` alias the package to it, and feature
  commits edit it (`93119a5` added `agent_runs.cost_usd` to the contracts this way).
  `client/src/vendor/shared` is a second, already-drifted copy — `diff -rq` shows `adapters.ts`,
  `contracts/trace.ts` and three others differ — so a contract change here does not reach the
  client until that copy is synced, and the client keeps type-checking meanwhile. Adding a field
  to a contract is therefore a server-side change the client picks up separately.
  **See also:** `client/INSIGHTS.md` is where the consumer side of a contract change belongs.
  **Evidence 2026-09-26:** `tsconfig.json:22` and `../reviewer-core/tsconfig.json:22` — both alias
  `@devdigest/shared` to this package's `src/vendor/shared/index.ts`.

- **2026-09-20** — routes in `src/modules/reviews/routes.ts` declare `schema: { params }` only,
  with no response schema, so handler return values are **not** serialization-filtered. A new
  field on a shared response contract (e.g. `RunSummary`) reaches the wire as soon as the
  repository maps it; there is no second place to register it. The contract is documentation and
  a client type, not a runtime filter.
  **Evidence 2026-09-26:** `src/modules/reviews/routes.ts:95` — `GET /pulls/:id/runs/active` declares
  `schema: { params: IdParams }` and no `response`.
  **See also:** `README.md:18-24` — the stack paragraph now says this too; until 2026-09-26 it
  claimed the Zod contracts drove response serialization.

- **2026-09-22** — per-run summaries are **denormalized onto `agent_runs` once, at completion**:
  the success path's `completeAgentRun` call (`src/modules/reviews/run-executor.ts:244`) writes
  `findingsCount`, `findingsBySeverity`, `costUsd`, `score` and `blockers`, and readers
  (`listRunsForPull`, the PR list in `src/modules/pulls/routes.ts`) read those columns instead of
  joining `findings`. The two failure paths (`run-executor.ts:79`, `:302`) zero tokens and
  `findingsCount` and leave cost, score, blockers and `findingsBySeverity` `null`. A new per-run number belongs in that one success-path call; a reader
  that must see a failed run's value will get `null`, by design.

- **2026-09-26** — changing `src/db/seed.ts` does **not** change an already-seeded dev DB: the whole
  demo block (PR #482, its files, commits, review and findings) sits inside `if (!pr)` at
  `src/db/seed.ts:99`, so `pnpm db:seed` skips it once PR #482 exists. The `agent_runs` row added
  for the findings counter only appears on a fresh database. To see a seed change locally, apply the
  same insert once with a throwaway `tsx` script against `DATABASE_URL`, or use
  `cd e2e && npm run e2e:hermetic` for a fresh stack — never `docker compose down -v`.

- **2026-09-27** — `modules/_shared/` is exempt from `dep-no-cross-module` but **not** from
  `db-only-in-repository` (`.dependency-cruiser.cjs:58-59`, `from` covers all of `src/modules/`).
  A helper shared by two modules therefore goes in `_shared/` with a *structural* input type and no
  `src/db` import, not even `db/rows` types; a Drizzle row still satisfies it. Moving it to
  `src/db/` instead would give every non-repository caller a new violation. Reference:
  `findingRowToDto` + `FindingRecord` (`src/modules/_shared/finding-dto.ts:11`).

- **2026-10-05** — every `AppError` subclass keeps `name === 'AppError'` (`this.name` is set once in the base, `src/platform/errors.ts:15`), so a test asserts `instanceof ExternalServiceError` or `err.code`, never `err.name`. `ConfigError` is a 500: a service that resolves a provider lazily maps a missing key itself (`AppError('intent_unavailable', …, 400)` in `src/modules/intent/service.ts:248`).
- **2026-10-05** — `new OctokitGitHubClient(token, { fetch })` is the adapter's test seam: the stub receives every SDK request (`request: { fetch }`, `src/adapters/github/octokit.ts:54-57`). A 403 makes exactly one request, a 429 or 5xx is retried with backoff, and Octokit percent-encodes the contents path (`contents/docs%2Fspec.md`), so a stub decodes the URL before matching. Example: `test/github-octokit.test.ts`.
- **2026-10-05** — a shared pre-step of a review run logs with `runLog.tool` / `info`, never `runLog.step`: `step` emits an `error` event when its callback throws and the client turns every `error` event into a toast (`deriveIntent` in `src/modules/reviews/run-executor.ts:379-386`).
- **2026-10-05** — `MockLLMProvider({ structuredBySchema })` runs a multi-call flow (classifier + review) through one app; calls are told apart by `req.schemaName`, not by order (`runAndTrace` in `test/reviews-skills.it.test.ts`, `test/reviews-intent.it.test.ts`). In an `.it` file a seeded row cannot be restored once a test corrupts it (`seed()` uses `onConflictDoNothing()`), so corrupt a row the test created; a `PUT /settings` persists for the rest of the file and is undone in `finally` (`test/intent-routes.it.test.ts`).

- **2026-10-06** — `pr_files` is filled only by `GET /pulls/:id` (`PullsRepository.saveDetail`
  deletes and re-inserts the rows on every successful GitHub refresh) and by the seed, the
  table has no position column, and `storedFilesAndCommits` selects it without `ORDER BY`. A
  route that reads `pr_files` therefore cannot return GitHub's file order, and it reads an
  empty table when it is called in parallel with the first detail request of a freshly
  imported PR. Order by `path`, and have the client wait for the detail before asking
  (`src/modules/pulls/repository.ts:128`, `:167`; `specs/L03-smart-diff.md` D3, D9).

## Tool & Library Notes

- **2026-09-27** — dependency-cruiser's `--ignore-known` takes an **optional** file argument, so
  `depcruise --ignore-known src …` reads `src` as the baseline path and dies with
  `ERROR: EISDIR: illegal operation on a directory, read`. Always name the file:
  `--ignore-known .dependency-cruiser-known-violations.json` (`package.json:15`, `arch:check`).
  A bare `--ignore-known` works only when another flag follows it, which is why an ad-hoc run
  passed and the script did not.
- **2026-09-27** — under pnpm, dependency-cruiser resolves an npm import to a versioned path
  (`node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`),
  and a known-violations baseline stores that path verbatim. A rule whose `to` targets
  `drizzle-orm` would therefore produce baseline entries that go stale, and fail CI, on the next
  version bump. `db-only-in-repository` targets `^src/db/` instead, which every querying file
  imports anyway (`.dependency-cruiser.cjs:63`). Keep npm packages out of baselined rules' `to`,
  or use them only in rules with zero baselined hits.

- **2026-09-27** — `pnpm arch:check --output-type json` puts the **baselined** violations in
  `summary.violations` too, with `rule.severity: "ignore"` (`summary.ignore` is their count, 33
  today). The new ones are those with any other severity. Paths are relative to `server/`
  (`src/…`, `../reviewer-core/src/…`), so resolve them against `server/` before comparing with
  repo-relative paths. See `toRepoPath` and the `severity !== 'ignore'` filter in
  `.claude/skills/pr-self-review/scripts/arch-check.mjs:16` and `:44`.

- **2026-10-01** — `pnpm db:generate` (drizzle-kit) stops on an interactive prompt when one
  migration drops a column and adds others on the same table: it asks whether each new column
  is created or renamed from the dropped one. In a non-TTY shell it shows nothing and hangs
  until killed (seen dropping `conventions.accepted` while adding `status`, `category`, …,
  `src/db/schema/knowledge.ts` `conventions`). Run it under `expect`, answering Enter, which picks
  the first option ("+ … create column"). Then read the generated SQL and confirm it has no
  `RENAME COLUMN` (`src/db/migrations/0013_flat_blue_marvel.sql`).
- **2026-10-05** — a `buildApp` test that starts a review run and passes no `secrets` override reads the developer's real keys: `secretsPath` is `join(homedir(), '.devdigest', 'secrets.json')` (`src/platform/config.ts:74`), so the intent pre-step would make a paid model call and real GitHub requests. The three files that start a run (`reviews.it`, `reviews-skills.it`, `reviews-intent.it`) pass `MockSecretsProvider` and `MockGitHubClient`; a new one must too. To run the suite with no key reachable: `HOME=<empty dir holding only a .docker symlink> DOCKER_HOST=unix://<real home>/.docker/run/docker.sock pnpm test` — without the `DOCKER_HOST` the `.it` files self-skip.
  **See also:** "Integration files skip silently" below, under Recurring Errors & Fixes.
- **2026-10-05** — to learn whether a flaky test pre-dates the working tree without touching it: `git archive HEAD server reviewer-core | tar -x -C <scratch>`, symlink both `node_modules`, and run `pnpm exec vitest run` there. Used to show the `reviews-skills.it` race below exists at `aa19314`.
- **2026-10-06** — `deepseek/deepseek-v4-flash` (the intent classifier's default) is a reasoning model, and OpenRouter counts its reasoning tokens against `max_tokens`. With `maxTokens: 800` a PR with a linked document spent 577 tokens reasoning, returned `finish_reason: length` with cut-off JSON, and `completeStructured` paid for a repair attempt that then ran past the 30 s `withTimeout` — the route answered 502 while the abandoned attempt kept running (`withTimeout` does not cancel). Fixed by `CLASSIFIER_MAX_TOKENS = 2000` (`src/modules/intent/service.ts`). Measured on the same PR: 2 attempts / 24 s before, 1 attempt / 11–18 s after; with `reasoning: { enabled: false }` in the request body 7 s and 212 output tokens (not built: it needs a field on `StructuredRequest`). The upstream provider OpenRouter picks changes the price of the same call 4× ($0.00008 on StreamLake, $0.0003 on OpenInference). To see this for any structured call, wrap `llm.client.chat.completions.create` in a scratch script and print `usage` and `finish_reason`; none of it reaches `StructuredResult`.
  **Extended 2026-10-06:** built since: `StructuredRequest.reasoning: false` and `.signal` (OpenRouter provider only), and no repair retry after `finish_reason: length` (`OutputTruncatedError`). About 40 live runs on one PR showed what a single run hides: with `temperature: 0` the same input gives `medium` in roughly five runs of six and `low` in the rest (the model's `basis: 'insufficient'` flips), and latency ranges 2–30 s for 70–1200 output tokens depending on the upstream provider — three default-reasoning runs in a row hit the 30 s budget while reasoning-off runs minutes later took 2–11 s. Judge a prompt or setting change on at least six runs per variant; two prompt wordings I compared on fewer could not be told apart.
  **Extended 2026-10-06 (2):** a `low` tier has two model-driven causes and the tier alone does not say which: `basis: 'insufficient'` (now applied only when no linked issue or specification was read — `deriveConfidence`, `basisOverruled`) and `injection_suspected`. After the guard, 5 of 14 runs on the same PR were still `low`, every one through `injection_suspected: true`; I had first put all such runs down to `basis` after checking a single record. Read the downgrade line of the run (`basis insufficient — forced to low` / `injection suspected — forced to low`) before naming a cause.
  **Extended 2026-10-06 (3):** the injection flag in those runs was caused by one sentence of the demo PR's own description, "Not meant to be merged" — text that addresses a reviewer. With only that sentence removed, 10 of 10 runs gave `medium` with `injection_suspected: false` (5 of 14 `low` before). So the flag was working as specified, on a borderline input, and inconsistently; a fixture for intent tests should not address the reader.

## Decisions

- **2026-09-26** — the PR list's `cost_usd` is the **total** over a PR's completed runs, and one
  unpriced run makes that total `null` (`src/modules/pulls/routes.ts:165-168`). hw1 criterion #12
  requires the total. The partial sum (priced runs only) was rejected: it reads as a complete
  figure and would understate spend silently. This matches `reviewer-core`, where one unpriced
  chunk makes a run's cost `null`. Failed, running and cancelled runs add nothing.
  **See also:** `specs/L01-run-cost.md` and `server/specs/L01-run-cost.md`, which record the rule.

- **2026-09-27** — layer boundaries (`onion-architecture` skill) are enforced by
  `pnpm arch:check` against a **known-violations baseline** of 33 existing leaks
  (`.dependency-cruiser-known-violations.json`), not by fixing them first: routes querying
  Drizzle, services taking the whole `Container`, `reviews → pulls/status` and the
  `container.ts ↔ repo-intel` cycles. Fixing them up front was rejected as a large refactor
  bundled into a docs change. Error-level checks with no baseline were rejected because CI would
  go red at once. New services take narrow dependencies instead of `Container`
  (`di-narrow-deps`, `.dependency-cruiser.cjs:82`). Re-baseline only in a PR that *removes* a leak.
  **See also:** `.claude/skills/onion-architecture/references/enforcement-dependency-cruiser.md`.

- **2026-09-29** — the URL-import SSRF guard checks addresses **at connect time**, through a
  `lookup` hook on `https.get`, not by resolving the host first and fetching afterwards
  (`src/adapters/http-fetch/index.ts`, `publicOnlyLookup`). Resolve-then-`fetch()` was rejected,
  because `fetch` resolves the name a second time, and a DNS-rebinding host can answer differently
  that time. The hook sees every address the socket will use, including redirect hops.
  `127.0.0.1.nip.io` is refused only by this hook. IP literals skip DNS, so they are checked up
  front. That check also has to handle Node's hex rewrite of `[::ffff:127.0.0.1]` to
  `::ffff:7f00:1`, and the NAT64 and 6to4 forms (`hextets`, `embeddedIPv4`).

- **2026-10-05** — a GitHub 404 is a value at the port, not an exception: `getIssue` resolves `null` and `getFileContent` resolves `RepoFileResult` with a miss reason (`not_found` · `too_large` · `not_a_file` · `empty`); every other failure is rethrown by the adapter as `ExternalServiceError` (`httpStatus`, `githubFailure` in `src/adapters/github/octokit.ts:30-44`), and no service reads `err.status`. Rejected: `statusOf(err) === 404` in the intent service — it decided a persisted contract value from the SDK's error shape, and the mock could not produce that shape. Only these two methods were converted; the other methods of the class still rethrow the raw SDK error.
- **2026-10-05** — contract-shaped `jsonb` and text-enum columns of `pr_intent` are parsed on read in the repository mapper (`mapRow`, `src/modules/intent/repository.ts:35`); a row that fails is reported through the port's `onUnreadable` callback (`:151`) and returned as `undefined`, so `GET /pulls/:id/intent` answers `{ intent: null }` and the next derivation overwrites it. Rejected: throwing (a 500 on a `GET` polled every 4 s, and a row that never heals) and parsing on write (the values already passed `IntentClassification`).

## Recurring Errors & Fixes

### `No file …_<name>.sql found` on a fresh database, while CI's migrated lane is green
**Date:** 2026-08-05
**Cause:** `src/db/migrations/meta/_journal.json` had history *rewritten* rather than
appended — an entry replaced instead of added, and one upstream migration dropped. A
database that is already migrated never replays those entries, so the failure only shows
up where the schema is built from zero. The regenerated snapshots had also silently lost
columns that `src/db/schema/runs.ts` still declares.
**Fix / rule:** the journal, the `.sql` files and `meta/*_snapshot.json` must always
agree — same count, tags in order, each snapshot's `prevId` pointing at the previous one.
Never hand-merge them: renumber your own migrations to sit *after* upstream's and keep
the snapshot chain relinked. Verify against a fresh testcontainer, not your dev DB.
**See also:** the root `INSIGHTS.md` — the general rule this is one instance of: never resolve
a generated artefact by taking one side of a merge.
**Evidence 2026-09-26:** `src/db/migrations/meta/_journal.json:4` — the `entries` array that must agree
with the `.sql` files and `meta/*_snapshot.json`; `src/db/schema/runs.ts:8` — `agentRuns`, whose
columns the regenerated snapshots had lost.

### A dependency type-checks locally and fails CI with `TS2307`
**Date:** 2026-08-05
**Cause:** `fflate` was imported by a module but declared in neither `package.json` nor
the lockfile. It resolved locally only because a stray copy was sitting in
`node_modules` from an earlier install.
**Fix / rule:** after adding an import, confirm the package is declared —
`pnpm install --frozen-lockfile` reproduces what CI sees. A clean install is the only
honest check; a working local build proves nothing about the dependency graph.
**Evidence 2026-09-26:** the offending import no longer exists — `main` was reset to the starter in commit
`c6af1e4`, so no line shows it today. The rule's anchor is `package.json:16`, the
`dependencies` block every import must be declared in.

### `pnpm exec vitest run .it.test` reports "Docker not available" and skips, with Docker running
**Date:** 2026-09-20
**Cause:** `dockerAvailable()` in `test/helpers/pg.ts` runs `docker info` with a 5000 ms
timeout and treats any failure as "no Docker", and each test file probes it from its own
worker. Measured here: one `docker info` takes 0.5–1.2 s, but 8 started at once take ~3.5 s of
wall time before vitest's own transform load is added, so under a parallel run some files
plausibly exceed the timeout. (Inferred, not proven by instrumenting the helper.) The
symptom is worse than a failure: every skipped file counts as green, so a new `*.it.test.ts`
can look like it passed when it never ran. In that run only `repo-intel-symbol-clamp.it.test.ts`
executed; the other six files, including the new one, skipped.
**Fix / rule:** run the integration lane with `pnpm exec vitest run .it.test --no-file-parallelism`
(all seven files ran and passed, ~97 s) and read the summary for "skipped" — a passing
`.it` run that says `↓ … skipped` proves nothing. For one file, name it:
`pnpm exec vitest run test/<name>.it.test.ts`.
**See also:** `../TESTING.md` lists the plain `vitest run .it.test` command for the
integration lane; it does not mention this.
**2026-09-22:** hit again on the finding-counter branch, and diagnosed from scratch because this
entry was not read first. Only `repo-intel-symbol-clamp.it.test.ts` ran in two parallel attempts,
while `docker info` alone took 0.65 s. `pnpm exec vitest run .it.test --pool=forks
--poolOptions.forks.singleFork=true` also works: all 8 files ran, 30 tests passed. The helper is
`test/helpers/pg.ts:23`, with the 5000 ms timeout at `:27`.

### `TS2353: … 'findingsBySeverity' does not exist in type` at the `completeAgentRun` call site
**Date:** 2026-09-22
**Cause:** the `values` type of `completeAgentRun` is declared twice: once on the exported
function in `src/modules/reviews/repository/run.repo.ts:144`, and again, inline, on the
`ReviewRepository` class method at `src/modules/reviews/repository.ts:152`, which only forwards it
(`:173`). `run-executor.ts:244` calls the class method, so adding a field to `run.repo.ts` alone
still fails typecheck there.
**Fix / rule:** a new `agent_runs` column written at completion needs the field in both
declarations, and in the `.set({…})` in `run.repo.ts`. The same double declaration exists for
`createAgentRun` (`repository.ts:142`).

### List items vanish or are cut to a few characters after `items.map(helper)`
**Date:** 2026-10-05
**Cause:** the helper had an optional second parameter (`oneLine(text, max = 160)`), and `Array.prototype.map` passes the index there: item 0 was sliced to `''` and dropped, item 1 kept one character, item 2 two. The scope lists of the intent block never reached the review prompt whole, and the integration tests still passed because they asserted on other lines.
**Fix / rule:** never pass a function with an optional parameter bare to `map` — write `.map((item) => oneLine(item))`. Test a capped render function with three or more items; with one item the only symptom is a missing heading.
**Evidence:** `renderIntentBlock` in `src/modules/reviews/domain.ts:80`; `test/reviews-domain.test.ts` › "keeps every list item whole, up to the 160-char cap".

### `reviews-skills.it.test.ts` fails in a parallel run with `Cannot read properties of undefined (reading 'skills')` or `(reading 'skills_loaded')`
**Date:** 2026-10-05
**Cause:** not a failed run. The executor marks the run `done` (`completeAgentRun`, `src/modules/reviews/run-executor.ts:288`) before it writes the trace (`saveRunTrace`, `:347`). `waitForPrRuns` returns on `done`, the test reads `GET /runs/:id/trace` once (`test/reviews-skills.it.test.ts:125-126`), and inside that window the route answers the 404 error envelope, which has no `prompt_assembly`. A probe saw 3 early 404s in 60 reads under the full parallel suite and none standalone; the same failure reproduced on a `git archive HEAD` copy in 3 of 6 parallel runs, so it pre-dates L03.
**Fix / rule:** a test that reads a trace polls until the route answers 200 (`readTrace`, `test/reviews-intent.it.test.ts:180`). Do not rerun until green and do not read this failure as a regression of the change under test.
**Evidence:** the two line pairs above; `Tests 1 failed | 198 passed (199)` in a plain `pnpm test`, `Tests 3 passed (3)` for the file alone.
**See also 2026-10-05:** the poll now lives in `waitForRunTrace` (`test/helpers/runs.ts`); the local `readTrace` named above was removed.

## Open Questions

- **2026-09-26** — can a cancelled **single-pass** run come back as `done`? `cancelRun`
  (`src/modules/reviews/service.ts:85-90`) sets the row to `cancelled` at once, but the engine
  checks for cancellation only *before* each LLM call (`reviewer-core/src/review/run.ts:164`), and
  single-pass makes exactly one. If that call is already running when the user cancels, it
  finishes and the success path calls `completeAgentRun` with `status: 'done'`. That update
  filters by id alone (`src/modules/reviews/repository/run.repo.ts:181`), so it would overwrite
  `cancelled` and persist the review. Read from the code, not reproduced. To settle it: cancel a
  single-pass run on a large diff mid-call, then check the row's final status. The fix would be a
  `status = 'running'` guard on that update.

- **2026-10-05** — the trace race above is not fixed in `test/reviews-skills.it.test.ts` or `test/reviews.it.test.ts` (both read the trace once after `done`), and the product has the same window for a UI that opens the trace on `done`. Two fixes, not chosen: poll in the tests, or call `saveRunTrace` before `completeAgentRun` in `run-executor.ts`. Ruled out: a failed run returning a buffer trace (status was `done` in 60 of 60 probes).
  **Superseded 2026-10-05:** fixed in the tests. Every server test reads a trace through `waitForRunTrace` (`test/helpers/runs.ts`), which polls `GET /runs/:id/trace` until 200; six plain parallel `pnpm test` runs in a row were green afterwards (475 tests). The executor still marks `done` before it writes the trace, by the user's decision, so a UI that opens the trace on `done` can get one 404.
- **2026-10-05** — `extractReferences` is quadratic on runs of `[` and of `+` (`MARKDOWN_LINK_RE`, `BARE_PATH_RE` in `src/modules/intent/domain.ts:223-225`; the lookbehind of `BARE_PATH_RE` omits `+`, which its body class includes): about 1.6 s for a 65 000-character PR body, and the service passes the uncapped sanitised body (`src/modules/intent/service.ts:461`). Nothing hangs. Not fixed; either cap the text or add `+` to the lookbehind. `test/intent-domain.test.ts` bounds the hostile inputs at 10 s.
  **Superseded 2026-10-05:** fixed without changing detection. Six scans of author text in `src/modules/intent/domain.ts` are linear now (`HTML_COMMENT_RE`, `CLOSING_ISSUE_RE`, `blankMarkdownImages`, `takeMarkdownLinks` with the sticky `LINK_TAIL_RE`, `stripTrailingPunctuation`, the fallback alternative of `BARE_PATH_RE`); the lookbehind was left alone because adding `+` drops `docs/a.md` from `x:notes+docs/a.md`. A 262 144-character hostile body takes 1–12 ms, bounded at 1 000 ms in `test/intent-domain.test.ts`. The rewrite was checked by a differential run against the pre-change file: 117 782 comparisons, 0 mismatches.
- **2026-10-05** — the casts that pre-date the intent work still stand: `row.trace as RunTrace` (`src/modules/reviews/repository/run.repo.ts:194`) and the `severity` / `category` / `kind` casts in `src/modules/_shared/finding-dto.ts`. They break the same `zod-parse-at-boundary` rule the intent repository now follows; converting them was kept out of the L03 change.

## Session Notes

- **2026-09-20** — L01 run cost: persisted `ReviewOutcome.costUsd` into the new
  `agent_runs.cost_usd` (migration `0010`), surfaced on the three endpoints, and added
  `test/pulls-cost.it.test.ts` for the latest-completed-run selection. Found the silent
  `.it` skip above.
  **Evidence 2026-09-26:** commit `547709c`; `test/pulls-cost.it.test.ts:37`.
- **2026-09-26** — findings counter (migration `0011`, `agent_runs.findings_by_severity`,
  `PrMeta.findings_by_severity`/`findings_preview`), then PR-list cost switched from the latest
  run to the total over completed runs. Recorded the completion-time denormalization, the
  seed-gating trap, the cost decision, the doubly-declared `completeAgentRun` type, and a
  rediscovery of the `.it` skip.
  **Evidence 2026-09-26:** `src/db/migrations/0011_ambiguous_slyde.sql:1`; `src/modules/pulls/routes.ts:165-168`
  (the cost total).
- **2026-09-27** — added the `onion-architecture` skill, plus `server/.dependency-cruiser.cjs`, the
  baseline and the `arch:check` CI step, which also cruises `../reviewer-core/src`. Recorded two
  depcruise quirks and the baseline decision.
- **2026-09-27** — `pr-self-review` consumes `arch:check` JSON; recorded how its baselined and new violations differ. **See also:** `INSIGHTS.md` (root), 2026-09-27 entries.
- **2026-09-27** — architecture refactor S1: split `pulls` into routes / service / repository /
  domain, moved `rollupSeverities` to `reviews/domain.ts` and `findingRowToDto` to
  `modules/_shared/finding-dto.ts`. The baseline went from 33 to 28, and the `pulls-*.it` tests passed unedited.
  Plan: `specs/architecture-refactor.md`.
- **2026-09-29** — L02 skills module; URL-import SSRF hardening (connect-time lookup); skill version bumps serialised with `SELECT … FOR UPDATE`.
- **2026-10-01** — L02 conventions module (extract pipeline, candidate routes); `feature-models` moved to `modules/_shared/repository/feature-models.repo.ts` taking `Db`, which removed its two baselined violations.
- **2026-10-02** — review runs: per-run deadline (`RUN_DEADLINE_MS`) and Cancel now abort the in-flight model call via `RunBus.signalFor`; OpenRouter skips `open-inference` by default (`OPENROUTER_IGNORED_PROVIDERS`). **See also:** `../reviewer-core/INSIGHTS.md` (runaway generation, provider slugs).
- **2026-10-05** — L03 intent module, review-run pre-step and scope filter wiring; review fixes (parse on read, port-level GitHub outcomes); root cause of the `reviews-skills.it` flake; `renderIntentBlock` `map` bug found by the phase 6 tests. Plan: `specs/L03-intent-layer-plan.md` (revision 3).
- **2026-10-06** — L03 Smart Diff specified, no code yet (`specs/L03-smart-diff.md`, `server/specs/`, `client/specs/`); `pr_files` ordering and fill-time recorded above.

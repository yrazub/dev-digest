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

## Decisions

- **2026-09-26** — the PR list's `cost_usd` is the **total** over a PR's completed runs, and one
  unpriced run makes that total `null` (`src/modules/pulls/routes.ts:165-168`). hw1 criterion #12
  requires the total. The partial sum (priced runs only) was rejected: it reads as a complete
  figure and would understate spend silently. This matches `reviewer-core`, where one unpriced
  chunk makes a run's cost `null`. Failed, running and cancelled runs add nothing.
  **See also:** `specs/L01-run-cost.md` and `server/specs/L01-run-cost.md`, which record the rule.

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

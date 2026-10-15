# Development Plan: L04 — Blast Radius

**Revision 2** (2026-10-11) — replaces revision 1. Changes: the degraded order of Q5 (index status before the facade's flag) in phase 3; Q6 and Q7 recorded as settled; the former open questions moved to Assumptions and Risks; one new open question on which rows the real facade can reach.

**Goal:** For a pull request, show the symbols declared in its changed files, who calls them (`file:line`) and the HTTP endpoints and cron jobs in the calling files — as a Blast radius block on the PR's Overview tab and as the working `get_blast_radius` tool of `devdigest-mcp`, both rendering one route, `GET /pulls/:id/blast`, that only reads the ready `repo-intel` index. · **Packages:** `@devdigest/shared` (authored in `server/`), server, client, mcp, e2e ·
**Spec:** `specs/L04-blast-radius.md` (with Q5–Q7), `server/specs/L04-blast-radius.md`, `client/specs/L04-blast-radius.md`, `mcp/specs/L04-blast-radius.md` · **Assumptions:**
(1) Paths are relative to the repository root `/Users/yrazub/Projects/dev-digest`; the work is on `feature/l04-blast-radius`, cut from `main` at `1ff22a3`.
(2) Scope is all of P1 and P2 plus C2, C4, C5, C6, C7. C4, C5 and C7 are built inside phases 3, 5 and 6 (one rule each, not separately cuttable); C2 is phase 9 and C6 is phase 10, each removable without touching phases 1–8.
(3) `buildSummary` states all four numbers whenever at least one caller exists, zeros included (`"2 changed symbols, 3 callers, 0 endpoints, 0 cron jobs."`); the server spec gives three example sentences only.
(4) `toBlastRadius` takes a fourth context field, `prFilesMissing`, besides the three the server spec lists (`indexState`, `repoIntelEnabled`, `callerLimit`); row 1 of the degraded table needs it.
(5) In the MCP view, endpoints and crons are sanitised at `MAX_TITLE`; the mcp spec names a limit only for paths and names.
(6) The English wording of the new `blast.json` keys is this plan's (phase 5), accepted by Q7; tests and flow `12` pin it.
(7) The MCP view follows the mcp spec and does not repeat the server's `caller_limit` (Q7): its own cap of 10 callers is lower, so a group at the server's limit always carries `more_callers` and the cut note.
(8) The resync completion rule shared with `IndexStatus` is "the index row's `updatedAt` differs from the value captured when Resync was pressed" — what `IndexStatus.tsx:31` does today. Every index write sets `updated_at` (`server/src/modules/repo-intel/repository.ts:294-344`), so the client spec's "`lastIndexedSha` or `updatedAt` advances" reduces to it.
(9) `repoId` reaches `OverviewTab` in phase 10, not phase 6, although the client spec lists it among the tab's props: only the Resync button uses it, and adding it with C6 keeps that phase cuttable.
(10) The "()" suffix of a group's symbol uses the `kind` of the first `changed_symbols` entry with that name (D6: one group per name).

## Context read
| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` | Five packages, no workspace; contracts once in `server/src/vendor/shared`; `snake_case` contract fields; pnpm for server and client, npm for mcp and e2e; protected paths |
| `specs/L04-blast-radius.md` | Requirements A1–C7, the cross-package rules, the degraded table in its Q5 order, the contract surface, Q1–Q7, D1–D12, cross-package acceptance |
| `server/specs/L04-blast-radius.md` | The `blast` module with its five files, the structural types and ports, `forPull(workspaceId, prId, log)`, the container getter, the mapper's field rules, the cap fix, the seed rows, the test list |
| `client/specs/L04-blast-radius.md` | The hook, the component folder, the six body modes, the mark, Resync, the two kinds of graph edge (Q6), the string keys, the test list |
| `mcp/specs/L04-blast-radius.md` | The ninth route, the tool's description and steps, the compact view, the caps, every note text, the test list |
| `server/CLAUDE.md`, `server/README.md`, `server/src/modules/repo-intel/README.md` | Module layout; schema-first validation; commands `pnpm typecheck`, `pnpm test`, `pnpm arch:check`; the facade is the only way to the index |
| `client/CLAUDE.md`, `client/docs/ui-architecture.md`, `client/docs/data-flow.md` | `_components/<Name>/` layout; data only through `src/lib/hooks/*`; URL state through `router.replace`; a failed query toasts only on status 0 or 5xx; key shape `[resource, id]` |
| `mcp/CLAUDE.md` | An HTTP client of the API through `API_ROUTES` only; views are `.pick()` / `.extend()` of shared contracts; commands `npm ci`, `npm test`, `npm run typecheck` |
| `e2e/CLAUDE.md`, `e2e/README.md`, `e2e/specs/seed-fixtures.md` | A flow is data; `wait --text` / `wait --url` / `wait --fn` are the assertions; `npm run e2e:hermetic`; the seed contract a seed change must update |
| `TESTING.md` | One suite per package; `*.it.test.ts` is DB-backed; `server/test/mcp-stdio.it.test.ts` drives the MCP package and needs `cd mcp && npm ci` |
| `.claude/agents/README.md` | The implementer writes no tests; a phase closes on the test-writer's green `Verify (phase)`; the plan lists every existing test a phase breaks |
| `.claude/skills/pr-self-review/routing.json`, `references/critical-rules.md` | Which skills review which file, and the rule IDs that block |
| `.claude/skills/onion-architecture/SKILL.md`, `server/.dependency-cruiser.cjs` | Layer placement; `dep-no-cross-module` and `dep-domain-framework-free` are machine-checked, and a new violation is CRITICAL |
| `.claude/skills/frontend-ui-architecture/SKILL.md`, `react-best-practices/SKILL.md`, `security/SKILL.md`, `next-best-practices/SKILL.md`, `fastify-best-practices/SKILL.md`, `drizzle-orm-patterns/SKILL.md`, `zod/SKILL.md` | Colocation, one-way imports, pure helpers, no effect-derived state; URLs validated before `href`; nothing sensitive in logs |
| `server/src/modules/repo-intel/service.ts`, `repository.ts`, `pipeline/full.ts` | What `getIndexState` and `getBlastRadius` really answer in each index state (see Constraints, "Facade facts") |
| `INSIGHTS.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md`, `mcp/INSIGHTS.md`, `e2e/INSIGHTS.md` | The traps listed under Constraints |

## Constraints
- **Architecture:** a module never imports another module, type-only imports included (`tsPreCompilationDeps: true`). The `blast` module therefore declares the facade shapes it needs as its own structural types, reaches the facade through its own `BlastSource` port, and gets `MAX_CALLERS_PER_SYMBOL` from `container.repoIntelLimits.callersPerSymbol` — as the server spec now states. No new violation and no new baseline entry — `server/.dependency-cruiser.cjs:66-73`, `:112-116`; `server/specs/L04-blast-radius.md` → "Module `src/modules/blast/`"; precedent `server/src/modules/conventions/ports.ts:70-73`.
- **Architecture:** `domain.ts` and `ports.ts` import nothing but `@devdigest/shared`; only `repository.ts` imports `src/db/`; only `routes.ts` imports Fastify and `platform/container.ts`; the service takes narrow dependencies and receives the request logger as a parameter of `forPull` — `server/.dependency-cruiser.cjs:18-27`, `:52-64`, `:75-89`.
- **Architecture:** routes declare `schema: { params }` and no response schema, so nothing filters or validates the response at runtime; the tests parse the body through the contract — `server/INSIGHTS.md:22`.
- **Architecture:** the client imports only `type`s from `@devdigest/shared`; a value import breaks the webpack build. The list of reasons a resync can fix is a client constant typed against the contract type — `client/INSIGHTS.md:107`.
- **Architecture:** in `mcp/`, `ports.ts` and `api-client.ts` may not contain `z.object(`, and files under `src/` import only relative paths, `@devdigest/shared`, `zod` and the MCP SDK — `mcp/test/boundaries.test.ts:81-96`, `:151-153`.
- **Facade facts (read in the code, they fix the test expectations of phase 3):**
  - `getIndexState` never reads `REPO_INTEL_ENABLED`; with the flag off it answers the same as with it on — `server/src/modules/repo-intel/service.ts:189-205`.
  - With no `repo_index_state` row it synthesises `status: 'degraded'`, `degradedReason: 'no_data'`, `lastIndexedSha: ''` — `service.ts:192-204`.
  - For a stored row of status `degraded` or `failed` it answers `degradedReason` = `stats.degradedReason`, else `index_failed`; for `full` and `partial` it answers no `degradedReason` — `repository.ts:218-232`.
  - `getBlastRadius` answers `degraded: false` exactly when the flag is on, paths are given and the row's status is `full` or `partial`; otherwise it falls back and answers `degraded: true, reason: 'no_data'` — `service.ts:223-226`, `:320`, `:228-303`.
  - The only degraded row the indexer writes today is `status: 'degraded'` with `stats.degradedReason: 'no_data'` (no clone yet); no code writes status `failed` or the reason `repo_too_large` — `pipeline/full.ts:88-92`, `:253`, `pipeline/incremental.ts:243`.
- **Insights:** the facade's cap is global and a partial index is not reported as degraded; both are why phase 2 and `resolveDegraded` exist — `server/INSIGHTS.md:80`, `:85`.
- **Insights:** a seed block inside `if (!pr)` never reaches an already-seeded database; the index rows go outside it — `server/INSIGHTS.md:40`, `server/src/db/seed.ts:165`.
- **Insights:** a table with no unique index duplicates rows under `onConflictDoNothing()`. `references` has none (`server/src/db/schema/context.ts:97-118`), so its seed rows are inserted only when missing; `symbols`, `file_rank`, `file_facts` and `repo_index_state` have a unique index or primary key and may use `onConflictDoNothing()` — `server/INSIGHTS.md:67`.
- **Insights:** `pr_files` is written only by `GET /pulls/:id` and the seed, and with a GitHub mock that route replaces a PR's rows. No server test of this feature calls `GET /pulls/:id` on the seeded PR — `server/INSIGHTS.md:60`, `server/test/smart-diff.it.test.ts:1-9`.
- **Insights:** a seeded row a test changes cannot be restored by `seed()` unless the seed block re-inserts it; the degraded cases use rows the test created — `server/INSIGHTS.md:57-58`.
- **Insights:** to prove a route calls no external port, wrap the mocks in a recording `Proxy` — `server/INSIGHTS.md:72`.
- **Insights:** integration files skip silently when the Docker probe times out; a `pnpm test` summary that says `skipped` proves nothing. Read the summary, and if `.it` files skipped, run the two lanes of `server/CLAUDE.md` separately — `server/INSIGHTS.md:203`; `INSIGHTS.md:200`.
- **Insights:** in `mcp-stdio.it.test.ts` the write tests stay after `left the database as it found it`; a new read-tool test goes before it — `server/INSIGHTS.md:76`, `server/test/mcp-stdio.it.test.ts:253`.
- **Insights:** `pnpm typecheck` in `server` and `npm run typecheck` in `mcp` do not cover `test/**`; in `client` it does, with `noUncheckedIndexedAccess` — `server/INSIGHTS.md:77`, `mcp/INSIGHTS.md:33`, `client/INSIGHTS.md:67`.
- **Insights:** TanStack Query keeps `data` when a refetch fails; a component with several bodies takes its body from one pure function — `client/INSIGHTS.md:40`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts:55`.
- **Insights:** a mocked mutation hook must return one stable object, or a component whose effect depends on it loops — `client/INSIGHTS.md:120`.
- **Insights:** a test pins wording from the plan or the spec, or reads the string in the source; never from an implementer's summary — `mcp/INSIGHTS.md:11`.
- **Insights:** before pointing `sanitizeText` at a new kind of text, run it over ordinary values of that kind; and check every string that leaves the process in one pass — `mcp/INSIGHTS.md:17`, `:47`.
- **Insights:** `tools/list` was 2,938 of 4,000 characters with the stub; the new description adds about 70 — `mcp/INSIGHTS.md:30`.
- **Insights:** `SectionLabel` is uppercased by CSS, `find` does not wait, and `wait --url` proves navigation only: wait for a text before a click, and use `wait --fn` on lowercased text for a section label — `e2e/INSIGHTS.md:27`, `:33`, `:61`.
- **Insights:** `npm run e2e:hermetic` writes into the same `client/.next` as a running dev server; stop the dev stack first — `e2e/INSIGHTS.md:87`.
- **Insights:** run per-package commands one at a time, never two `cd <pkg> && …` in one parallel batch — `INSIGHTS.md:345`.
- **Insights (Skill: `next-best-practices`):** the local skill describes Next 16 while the client runs Next 15; where they disagree, `nextjs.org/docs` wins — `INSIGHTS.md:159`.
- **Verified against the code:** `server/test/mcp-stdio.it.test.ts` only lists `get_blast_radius` (`:146`) and never calls it, so no test there breaks; no existing server test counts index rows (the seed idempotency tests count workspaces, `pr_files` and `pr_intent`: `integration.it.test.ts:69`, `smart-diff.it.test.ts:352`, `intent-routes.it.test.ts:281`); `mcp/src` has no `E-BLAST` constant — the text is inline in `mcp/src/tools/get-blast-radius.ts:17-19`.
- **Do not touch:** `server/src/db/migrations/**` (no migration is needed; every table exists), every lock file (no dependency is added), `client/src/vendor/**` except the one contract copy of phase 1, `mcp/CLAUDE.md` and every other `CLAUDE.md` (main session), every `README.md` and the older `L04-devdigest-mcp` specs (doc-writer).

## Phases

### 1 · Contracts — `@devdigest/shared` (server, with the client copy)

The three response contracts, first because the route, the hook and the MCP port all type against them. `brief.ts` is not edited in either copy.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/vendor/shared/contracts/review-api.ts` | After `SmartDiffResponse`: add `BlastDegradedReason`, `BlastTotals` and `BlastRadiusResponse` exactly as in `server/specs/L04-blast-radius.md` → "Contract", each with its inferred type under the same name; add `BlastRadius` to the existing import from `./brief.js`. The barrel `index.ts` already re-exports this file | onion-architecture, security, zod | dep-domain-framework-free |
| `client/src/vendor/shared/contracts/review-api.ts` | The same added lines and the same import change, copied by hand. This file is a copy; nothing else in `client/src/vendor/**` is touched | — (excluded from review) | — |

**Tests (test-writer):**
- Extend `server/test/contracts.test.ts` — a full `BlastRadiusResponse` body parses, and the same body parses as `BlastRadius` (B2); `BlastDegradedReason.options` equals the six values in spec order; an unknown `reason` is rejected; `reason: null` and `indexed_sha: null` parse; `caller_limit: 0` and a negative or fractional total are rejected; a body without `totals` is rejected.
- Expected to change: none

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test` · `cd client && pnpm typecheck` · `cd mcp && npm run typecheck`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check` · `cd client && pnpm typecheck` · `cd mcp && npm run typecheck`
**Done when:**
- `BlastDegradedReason`, `BlastTotals` and `BlastRadiusResponse` are exported from `@devdigest/shared` in the server copy and in the client copy, with identical lines.
- B2 — a `BlastRadiusResponse` value parses as `BlastRadius`.
- `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts` are unchanged.

### 2 · `repo-intel` — the caller cap per changed symbol (Q2) — server

One change in the facade, before the module that reports `caller_limit`, so the number the route states is true. Alone in its phase because it changes what every consumer of `getBlastRadius` gets.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/repo-intel/service.ts` | In `tryPersistentBlast`, replace `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` (line 386) with a cap per `viaSymbol`: keep the first `MAX_CALLERS_PER_SYMBOL` rows of each symbol in the existing rank-descending order (after the sort at line 372). Nothing else changes: not the signature, not `BlastResult`, not the fallback path, not what is reported as degraded | onion-architecture, security | dep-inward-only |

**Tests (test-writer):**
- Add `server/test/repo-intel-blast-cap.it.test.ts` (Postgres) — a test-created repo with a `repo_index_state` row of status `full`, two symbols declared in one changed file, 25 resolved references to the first and 5 to the second: `getBlastRadius` returns 20 callers of the first and 5 of the second, and the 20 are the highest-ranked. Fixture facts the test depends on: a reference counts only when `decl_file` is the changed file and its `from_path` has a `file_rank` row (inner join, `repository.ts:503-531`), and callers are de-duplicated by file + enclosing symbol + target (`service.ts:361`), so the 25 references come from 25 files with distinct ranks.
- Expected to change: none (`server/test/repo-intel-facade-degraded.test.ts` covers the fallback path only and must stay green).

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check`
**Done when:**
- Q2, B6 — with 25 callers of one symbol and 5 of another, `getBlastRadius` returns 20 and 5, highest rank kept.
- The literal `20` for this limit exists only in `server/src/modules/repo-intel/constants.ts`.
- `pnpm arch:check` reports no new violation and the baseline file is unchanged.

### 3 · The `blast` module and `GET /pulls/:id/blast` — server

The read-only route: two reads of Postgres, one facade call, one pure mapper. After phase 2 so the route's `caller_limit` matches what the facade does. The field rules are the table in `server/specs/L04-blast-radius.md` → "Building the response"; the degraded order is the Q5 table of the root spec.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/blast/domain.ts` (new) | Pure, imports `@devdigest/shared` types only. Declares the structural inputs `BlastSourceResult` (`changedSymbols`, `callers` with `file`, `symbol`, `viaSymbol`, `line`, `rank`, optional `factsByFile`, `degraded`, `reason`) and `BlastSourceIndexState` (`status` of `full`, `partial`, `degraded` or `failed`, `lastIndexedSha`, optional `degradedReason`), where a reason is `Exclude<BlastDegradedReason, 'pr_files_missing'>`. Exports `toBlastRadius(result, ctx: { indexState, repoIntelEnabled, callerLimit, prFilesMissing }): BlastRadiusResponse`, `buildSummary(totals): string` (the three sentences of the server spec, correct singular and plural, Assumption 3) and `resolveDegraded(...)`, first match wins: (1) `prFilesMissing` → `pr_files_missing`; (2) flag off → `flag_off`; (3) index status `degraded` or `failed` → the state's `degradedReason`, else `index_failed`; (4) the facade answered `degraded: true` → its `reason`, else `no_data`; (5) index status `partial` → `index_partial`; (6) `degraded: false`, `reason: null`. String ordering by code unit, not `localeCompare` | onion-architecture, security | dep-domain-framework-free, dep-inward-only |
| `server/src/modules/blast/ports.ts` (new) | `BlastStore` (`findPull(workspaceId, prId)` → `{ id, repoId }` or `undefined`; `changedPaths(prId)` → `string[]`), `BlastSource` (`getBlastRadius(repoId, changedFiles)` → `BlastSourceResult`; `getIndexState(repoId)` → `BlastSourceIndexState`) and `BlastLog` (`info(fields, message)`); types from `./domain.js` | onion-architecture, security | dep-domain-framework-free |
| `server/src/modules/blast/repository.ts` (new) | `BlastRepository implements BlastStore`, shaped like `smart-diff/repository.ts`: `findPull` filters by workspace and id; `changedPaths` selects `pr_files.path` ordered by path. Read-only | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-missing-authz |
| `server/src/modules/blast/service.ts` (new) | `BlastService` with deps `{ store, source, repoIntelEnabled, callerLimit }` and `forPull(workspaceId, prId, log)`: unknown PR → `NotFoundError('Pull request not found')`; no stored paths → skip `getBlastRadius`, read `getIndexState`, answer the empty map with `pr_files_missing`; otherwise one `getBlastRadius` and one `getIndexState` in parallel, then `toBlastRadius`; then exactly one `log.info` with `{ prId, repoId, files, symbols, callers, endpoints, crons, degraded, reason, indexStatus, indexedSha, ms }` and the message `blast: served from the repo-intel index` — counts and ids only, no path and no symbol name | onion-architecture, security | dep-inward-only, db-only-in-repository, sec-secret-exposure |
| `server/src/modules/blast/routes.ts` (new) | The plugin, shaped like `smart-diff/routes.ts`: builds `BlastService` from `new BlastRepository(container.db)`, `container.repoIntel` (assigned to `BlastSource`; this assignment is the compile-time check that a new facade reason or index status fails `typecheck`), `container.config.repoIntelEnabled` and `container.repoIntelLimits.callersPerSymbol`; `GET /pulls/:id/blast` with `schema: { params: IdParams }`, `getContext`, then `service.forPull(workspaceId, req.params.id, req.log)`. No rate-limit override, no response schema | onion-architecture, security, fastify-best-practices | edge-thin-routes, di-composition-root-only, sec-missing-authz |
| `server/src/modules/index.ts` | Import `./blast/routes.js` and add the entry `blast` to `modules` | onion-architecture, security | dep-inward-only |
| `server/src/platform/container.ts` | A getter `repoIntelLimits` returning `{ callersPerSymbol: MAX_CALLERS_PER_SYMBOL }`, with the import from `../modules/repo-intel/constants.js`. The container is the composition root and already imports this module | onion-architecture, security, fastify-best-practices | di-composition-root-only |

**Tests (test-writer):**
- Add `server/test/blast-domain.test.ts` (hermetic) — grouping by `viaSymbol` (B3); a caller in a file that declares a changed symbol of that name is dropped (B5); a caller of a symbol not in `changedSymbols` is dropped; a duplicate `file` + `line` inside one group is dropped; callers ordered by rank descending, then file, then line, and groups by highest rank, then symbol (C5), with three or more callers in an ordering case; endpoints and crons are the distinct sorted union over the group's caller files; no `factsByFile` gives two empty lists; a symbol without callers stays in `changed_symbols` only; every total; `buildSummary` for the three shapes and the singular forms; `indexed_sha` is `null` for an empty `lastIndexedSha`; the output parses as `BlastRadiusResponse` and as `BlastRadius` (B2). For `resolveDegraded`, each of the six rows and these precedence cases: row 1 wins over a failed index and a degraded facade; row 2 wins over a failed index; a `failed` index with a facade that answers `no_data` gives `index_failed` (row 3 over row 4, Q5); a `degraded` index with `degradedReason: 'no_data'` gives `no_data`, with `repo_too_large` gives `repo_too_large`, without a reason gives `index_failed`; a degraded facade with a `full` index gives the facade's reason, and `no_data` when it has none; a degraded facade with a `partial` index gives the facade's reason, not `index_partial` (row 4 over row 5); a `partial` index with a non-degraded facade gives `index_partial`; `reason` is `null` exactly when `degraded` is `false`.
- Add `server/test/blast-service.test.ts` (hermetic, fake `BlastStore`, `BlastSource` and `BlastLog`) — `getBlastRadius` is called exactly once with the PR's paths and `getIndexState` once; with no stored paths `getBlastRadius` is not called and the answer is `pr_files_missing`; an unknown PR rejects with `NotFoundError` (assert `instanceof` or `code`, not `name`); `caller_limit` equals `MAX_CALLERS_PER_SYMBOL` when the test passes that constant (B6); exactly one `info` call whose fields are the twelve keys above and whose values contain no path and no symbol name (B1).
- Add `server/test/blast.it.test.ts` (Postgres, `buildApp` with `MockSecretsProvider` and recording proxies over `MockGitHubClient` and `MockLLMProvider`) on rows the test creates (repos without a clone path, PRs, `pr_files`, `repo_index_state`, `symbols`, resolved `references`, `file_rank`, `file_facts`):
  - status `full` → `200`, a body that parses as both contracts, the expected groups and totals, `degraded: false`, `reason: null`; `caller_limit` equals `MAX_CALLERS_PER_SYMBOL` through the real wiring;
  - status `partial` → `degraded: true`, `index_partial`, the map still present (row 5);
  - status `failed` → `index_failed`, an empty map (the facade falls back and the repo has no clone), `indexed_sha` equal to the row's SHA (row 3, Q5);
  - status `degraded` with `stats: { degradedReason: 'repo_too_large' }` → `repo_too_large` (row 3);
  - no index row → `no_data`, `indexed_sha: null` (row 3 through the synthesised state);
  - a PR without `pr_files` → `pr_files_missing`, empty map (row 1);
  - an app built with `REPO_INTEL_ENABLED=false` on the `full` repo → `flag_off` (row 2);
  - an app built with `overrides.repoIntel` whose `getBlastRadius` answers `degraded: true` with no reason and whose `getIndexState` answers status `full` → `no_data` (row 4; the real facade cannot produce this combination — Open questions);
  - `404` `not_found` for an unknown uuid and for a PR of another workspace; `422` for a bad id; the row counts of `pr_files`, `symbols`, `references`, `repo_index_state` and `agent_runs` are the same after the requests; the proxies recorded no GitHub and no model call (B4). `changed_symbols` is compared as a set: the facade reads symbols without `ORDER BY`.
- Extend `server/test/routes-smoke.test.ts` — `GET /pulls/not-a-uuid/blast` answers `422` `validation_error` with no database.
- Expected to change: none

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check`
**Done when:**
- B2 — `GET /pulls/:id/blast` answers `200` with a body that parses as `BlastRadiusResponse` and as `BlastRadius`.
- B1, B4 — one request makes exactly one `getBlastRadius` call, writes no row, logs one `blast` line with the index status and the counts, and calls no model and no GitHub.
- B3, B5, C5 — `downstream` is grouped by symbol, without the declaring file, callers and groups in rank order with the stated tie-breaks.
- B6 — the response's `caller_limit` is `MAX_CALLERS_PER_SYMBOL`, and no file under `server/src/modules/blast/` contains the number.
- B7, Q5 — all six reasons are returned with `200` by the real route and the real facade: `pr_files_missing` (row 1), `flag_off` (row 2), `index_failed`, `repo_too_large` and `no_data` (row 3, from a stored `failed` or `degraded` row or from no row), `index_partial` (row 5).
- B7 — row 4 is returned by the route when the facade is injected through `ContainerOverrides.repoIntel`, and every row and precedence is covered in `blast-domain.test.ts`.
- An unknown PR and a PR of another workspace answer `404`; a non-uuid id answers `422`.
- No file under `server/src/modules/blast/` imports another module's folder, and `pnpm arch:check` reports no new violation and no new baseline entry.

### 4 · Seed — the index rows of PR #482 (Q3) — server, with the e2e seed contract

The demo PR answers a full map with no clone on disk. Its own phase because it changes what every seeded database and every browser flow sees.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/db/seed.ts` | A block outside `if (!pr)`, after the intent block, for the demo repo. (1) `repo_index_state`: status `full`, `INDEXER_VERSION` (imported from `../modules/repo-intel/constants.js`), `last_indexed_sha` `b1a57b1a57b1a57b1a57b1a57b1a57b1a57b1a57`, `onConflictDoNothing()`. (2) `symbols`, all kind `function`, `onConflictDoNothing()`: `rateLimit` (line 12) and `bucketKey` (line 38) in `src/middleware/ratelimit.ts`; `publicRouter` (8) in `src/api/public/index.ts`; `webhookHandler` (30) in `src/api/public/webhooks.ts`; `healthCheck` (6) in `src/api/public/health.ts`; `app` (10) in `src/server.ts`; `resetBuckets` (3) in `src/jobs/reset-buckets.ts`. (3) `references` with `decl_file` `src/middleware/ratelimit.ts`, inserted only when no row with that `from_path` + `to_symbol` + `line` exists for the repo: `rateLimit` from `src/api/public/index.ts:23`, `src/api/public/webhooks.ts:45`, `src/api/public/health.ts:11`, `src/server.ts:88`; `bucketKey` from `src/jobs/reset-buckets.ts:8`. (4) `file_rank` (`hotness` 0, `pagerank` = `rank`), `onConflictDoNothing()`: index.ts 0.09 / percentile 99, webhooks.ts 0.08 / 95, health.ts 0.07 / 90, server.ts 0.06 / 85, reset-buckets.ts 0.05 / 80. (5) `file_facts`, `onConflictDoNothing()`: `GET /api/public/items` on index.ts, `POST /api/public/webhooks` on webhooks.ts, `GET /api/public/health` on health.ts, cron `reset-rate-buckets (hourly)` on reset-buckets.ts. No delete, no overwrite of an existing row; `src/middleware/ratelimit.ts:41` is not seeded as a caller (B5). The doc comment of `seed()` names the block | onion-architecture, security, drizzle-orm-patterns | sec-hardcoded-secret |
| `e2e/specs/seed-fixtures.md` | A new section "PR #482 has a seeded repo-intel index": the tables and rows above, the resulting answer (2 groups in the order `rateLimit`, `bucketKey`; callers in the order index.ts:23, webhooks.ts:45, health.ts:11, server.ts:88, then reset-buckets.ts:8; totals 4 symbols, 5 callers, 3 endpoints, 1 cron; `degraded: false`; the indexed SHA), that flow `12` reads it, and that the block runs outside `if (!pr)`. In "The demo repo has exactly three pending convention candidates", replace "with no `repo_index_state` row, so their evidence has no GitHub link" with the new fact: the repo has a seeded index row, so the candidates' evidence links to the seeded SHA and the Conventions index line shows it (accepted, Q7) | — (`.md`) | — |

**Tests (test-writer):**
- Extend `server/test/blast.it.test.ts` with a `describe` for the seeded PR #482, read through the database and the blast route only — the route answers `degraded: false`, `reason: null`, `indexed_sha` equal to the seeded SHA, `summary` `4 changed symbols, 5 callers, 3 endpoints, 1 cron job.`, totals `{ symbols: 4, callers: 5, endpoints: 3, crons: 1 }`, `downstream` in the order and with the caller names, lines, endpoints and crons recorded in `seed-fixtures.md`; a second `seed()` leaves 1 `repo_index_state`, 7 `symbols`, 5 `references`, 5 `file_rank` and 4 `file_facts` rows for the demo repo; after deleting those rows `seed()` restores them; a `repo_index_state` row whose status a test set to `partial` is not overwritten by `seed()` (restore `full` with an explicit update in `finally`).
- Expected to change: none. Checked: no existing test reads the index tables or `GET /repos/:id/index-state` for the demo repo, and none asserts `evidence_url` of a seeded convention; `conventions-extract.it.test.ts` and `repo-intel-symbol-clamp.it.test.ts` use their own repos. A failure in an existing file is a regression.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check`
**Done when:**
- Q3, A4 — on a fresh seed `GET /pulls/:id/blast` for PR #482 answers 2 groups, 5 callers, 3 endpoints and 1 cron with `degraded: false`.
- Running the seed on a database that lacks the index rows adds them, and running it again adds no row.
- `e2e/specs/seed-fixtures.md` states the seeded index rows, the resulting answer, the flow that depends on them and the effect on the demo repo's Conventions screen, and no longer says the demo repo has no `repo_index_state` row.

### 5 · Client data layer — the hook and the strings

The one data path for the new route and every string the later client phases read (C7 holds from here on). The P3 strings are included so phases 9 and 10 touch no message file.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/lib/hooks/blast.ts` (new) | Shaped like `smart-diff.ts`: `blastKeys.pull(prId)` = `["blast", prId]`, `blastKeys.detail(prId, headSha)` = `["blast", prId, headSha]`; `useBlastRadius(prId, headSha)` → `api.get<BlastRadiusResponse>` on `/pulls/${prId}/blast`, `enabled` only when both are set (D10), no polling; `import type` only | frontend-ui-architecture, security | struct-one-way, logic-no-server-state-copy |
| `client/messages/en/blast.json` | `stat.symbols`, `stat.callers`, `stat.endpoints`, `stat.crons` become ICU plurals of the label only (`symbol`/`symbols`, `caller`/`callers`, `endpoint`/`endpoints`, `cron`/`crons`); `callerCount` becomes `1 caller` / `# callers`; `view.tree` `Tree`, `view.graph` `Graph`; `noDownstream`, `graph.empty`, `graph.ariaLabel` unchanged. New: `noSymbols` `No symbols are declared in the changed files.`; `moreWithoutCallers` `# more changed symbol has no callers.` / `# more changed symbols have no callers.`; `callersCut` `Showing the first {limit} callers; there may be more.`; `openOnGithub` `Open {file}:{line} on GitHub`; `loadFailed` `The blast radius could not be loaded.`; `retry` `Try again`; `graph.legend.symbol` `Changed symbol`, `graph.legend.caller` `Caller`, `graph.legend.endpoint` `Endpoint or cron`; `degraded.title` `This map may be incomplete`; `degraded.reason.flag_off` `The repository index is switched off on this server (REPO_INTEL_ENABLED=false).`, `.index_failed` `The last indexing run failed.`, `.index_partial` `The repository index is partial, so some callers may be missing.`, `.repo_too_large` `The repository is too large to index fully.`, `.no_data` `The repository has not been indexed yet.`, `.pr_files_missing` `The changed files of this pull request are not stored yet.`; `degraded.resync` `Resync index`, `degraded.resyncing` `Resyncing…`, `degraded.resyncSlow` `The index has not changed yet. Try again in a minute.` No registration is needed: `src/i18n/request.ts` loads every file of `messages/en/` | — (`.json`) | — |

**Tests (test-writer):**
- Add `client/src/lib/hooks/blast.test.tsx` (mocked `fetch`, as `smart-diff.test.tsx`) — `useBlastRadius("pr1", "sha1")` requests `GET /pulls/pr1/blast` and returns the body; nothing is requested without a PR id or without a head SHA; a new head SHA is a new request; invalidating `blastKeys.pull("pr1")` refetches and invalidating another PR's key does not; a `404` surfaces as an error; with `createTranslator` over the real `blast.json`, the plural forms of the four `stat` labels, `callerCount` and `moreWithoutCallers`, and that all six `degraded.reason.*` keys exist.
- Expected to change: none (no source file reads `blast.json` today).

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- `useBlastRadius` reads `GET /pulls/:id/blast`, waits for both ids and types its data as the shared `BlastRadiusResponse`.
- C7 — every key named above exists in `client/messages/en/blast.json` with the stated text.

### 6 · The Blast radius block — Tree view, states, the mark, links — client

The block on the Overview tab, complete for P1 and P2: summary, groups, `file:line` links, chips with crons apart (C4), the six body modes and the degraded mark. No view switch and no Resync button yet (phases 9 and 10). Folder: `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/`, called `BlastRadiusCard/` below.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `BlastRadiusCard/helpers.ts` (new) | Pure: `blastBodyMode` → `loading`, `error`, `noFiles`, `noSymbols`, `noCallers` or `map` (no data and an error → `error`; no data → `loading`; `reason` `pr_files_missing` → `noFiles`; `totals.symbols` 0 → `noSymbols`; empty `downstream` → `noCallers`; else `map` — a failed refetch with data keeps the data's mode); `callerHref` → `githubBlobUrl(repoFullName, indexed_sha ?? headSha, file, line)`, or `null` without a repository name; `groupIsCut(group, callerLimit)`; the symbol label with `()` for kind `function` or `method` | frontend-ui-architecture, security, next-best-practices | logic-pure-domain, struct-one-way, sec-xss |
| `BlastRadiusCard/constants.ts` (new) | Stat icons (`Code`, `CornerDownRight`, `Globe`, `Clock`), chip tones (accent for endpoints, warning for crons), skeleton row keys, the callable kinds | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `BlastRadiusCard/styles.ts` (new) | `s`, CSS variables only | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `BlastRadiusCard/BlastRadiusCard.tsx` (new) | `"use client"`. Props `prId`, `repoFullName`, `headSha`. Calls `useBlastRadius`; a `section` whose accessible name is `brief` → `block.blast`; inside a `Card`: the `SectionLabel`, then by mode: `loading` → `Skeleton` rows; `error` → `loadFailed` and a `retry` button that refetches; `noFiles` → the mark only; `noSymbols` → summary row and `noSymbols`; `noCallers` → summary row and `noDownstream` with the symbol count; `map` → summary row and one `SymbolGroup` per `downstream` entry in response order, then `moreWithoutCallers` when `changed_symbols` is longer than `downstream`. The summary row shows the four `totals` numbers, each stat one element whose text reads `<number> <label>`. `DegradedNote` sits between the summary row and the body whenever `degraded` is true and the mode is not `loading` or `error`. Nothing is regrouped, reordered or recounted; no label literal | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, split-pure, logic-no-effect-derivation, logic-no-server-state-copy, react-hooks-conditional, react-nested-component, react-render-side-effect |
| `BlastRadiusCard/index.ts` (new) | Re-exports `BlastRadiusCard` | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `BlastRadiusCard/_components/SymbolGroup/SymbolGroup.tsx` (new), `index.ts` (new) | One changed symbol as a region named by the symbol: the row with the monospace label and `callerCount`, followed by `+` and the `callersCut` title when `groupIsCut`; the callers as a list, one `file:line` per line in monospace — a link (`target="_blank"`, `rel="noopener noreferrer"`, `title` from `openOnGithub`) when `callerHref` is not null, plain text otherwise — with the caller's name muted at the right; a list named by the `stat.endpoints` label with one accent chip (`Globe`) per endpoint; a separate list named by the `stat.crons` label with one warning chip (`Clock`) per cron (C4). Always open; repository text as text nodes | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, split-pure, sec-xss, react-nested-component |
| `BlastRadiusCard/_components/DegradedNote/DegradedNote.tsx` (new), `index.ts` (new) | Props `reason`. A warning-toned line with `role="note"`, the accessible name and visible title `degraded.title`, an `AlertTriangle` icon and the sentence `degraded.reason.<reason>` | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-pure, react-render-side-effect |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | New props `prId`, `repoFullName`, `headSha`; renders `BlastRadiusCard` above the Description section when `prId` is set; the Description section is unchanged | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-no-cross-feature, split-pure |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Line 147: pass `prId`, `repoFullName` and `pr.head_sha` to `OverviewTab`. Nothing else | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |

**Tests (test-writer):**
- Add `BlastRadiusCard/helpers.test.ts` — `blastBodyMode` for each of the six modes and for `{ data present, isError: true }` (the data's mode, not `error`); `callerHref` with `indexed_sha`, with `indexed_sha: null` (head SHA), without a repository name (`null`), and with a path that needs encoding; `groupIsCut` below and at the limit; the `()` label for `function`, `method` and another kind.
- Add `BlastRadiusCard/BlastRadiusCard.test.tsx` (real `blast.json` and `brief.json`; the hook module mocked with a stable object) — the four numbers come from `totals`, not from array lengths (give a fixture where they differ); groups and callers in response order; a caller is a link with the GitHub blob URL at `indexed_sha`, `target="_blank"` and `rel="noopener noreferrer"`, and plain text when `repoFullName` is null; endpoint and cron chips in two separately named lists; the `+` on a group at `caller_limit` and none below; `moreWithoutCallers` with the right count; the `noCallers` and `noSymbols` texts; `noFiles` shows the mark and no summary row; for each of the six reasons the mark with its sentence, and the map still rendered under it; loading skeleton; the error state with `Try again` calling `refetch`; an error with data keeps the map.
- Add `OverviewTab/OverviewTab.test.tsx` (the `../BlastRadiusCard` module mocked to capture props) — the block comes before Description in the document and receives `prId`, `repoFullName` and `headSha`; no block when `prId` is null; Description still renders.
- Expected to change: none (no existing test renders `OverviewTab` or the page).

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- A1, A2 — the Overview tab renders the block above Description, and its four numbers equal `totals`.
- A3, C4, C5 — each group shows its callers as `file:line` in response order, then endpoint chips, then cron chips in their own list.
- A5, D4 — a caller link is the GitHub blob URL at `indexed_sha`, or the head SHA when it is null, with the line anchor, opening in a new tab.
- A6, B7 — `noCallers` and `noSymbols` show a text; a degraded response shows the mark with the sentence of each of the six reasons, and the map under it.
- B6 — the cut mark is driven by `caller_limit`; no caller count or depth is a literal in the component folder.
- C7 — no Blast radius label is a literal in a `.tsx` file of the folder; no component calls `fetch`.

### 7 · `get_blast_radius` — the working tool — mcp, with the real-API test in server

The stub becomes a tool over the ninth route. After phase 4, because the real-API test compares the tool with the seeded map. `server.ts`, `tool.ts` and `resolve.ts` are not edited: the tool keeps its name, input and place in `TOOLS`.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `mcp/src/ports.ts` | `ApiBlastRadius` = the shared `BlastRadiusResponse`, used whole (no `z.object(` here); `getBlastRadius(prId): Promise<ApiBlastRadius>` on `DevDigestApi`; `API_ROUTES.getBlastRadius: 'GET /pulls/:id/blast'`; the comment says eight reads and one write | security | sec-secret-exposure |
| `mcp/src/api-client.ts` | `getBlastRadius(prId)` through the existing `request` and `parseView`, like `getConventions`; no new timeout, header or retry | security | sec-injection |
| `mcp/src/mocks.ts` | State `blast` by PR id; `getBlastRadius` records the call like the other reads and answers the state's value, or an empty non-degraded map when the key is missing (`caller_limit: 1`, since no reader holds the server's number) | — (excluded from review) | — |
| `mcp/src/constants.ts` | `MAX_BLAST_SYMBOLS = 15`, `MAX_BLAST_CALLERS = 10`, `MAX_BLAST_FACTS = 10`; `SERVER_INSTRUCTIONS` gains `For what a PR's changes can reach, call get_blast_radius.` and stays at or below 500 characters — it is 470 today and the sentence with its space is 58, so the first sentence loses at least 28 characters while `repo is owner/name; pr is the PR number.` and every later sentence stay word for word | security | sec-secret-exposure |
| `mcp/src/blast-view.ts` (new) | Pure `toBlastView({ repo, pr, blast })`, shaped like `review-view.ts`, following `mcp/specs/L04-blast-radius.md` → "Result": field order `repo`, `pr`, `summary`, `totals`, `impact`, `symbols_without_callers`; the three caps with `more_symbols`, `more_callers`, `more_endpoints`, `more_crons` and the cut note (its `10` taken from `MAX_BLAST_CALLERS`); `totals` and order untouched; `degraded`, `reason` and `note` only as the spec's note table says, a degraded note before a cut note; `indexed_sha` and `caller_limit` are not in the view (Assumption 7); every repository string through `sanitizeText` (paths `MAX_PATH`, names, endpoints and crons `MAX_TITLE`), `summary` through `cutText` at `MAX_SUMMARY`, `repo` at `MAX_REPO` | security | sec-secret-exposure |
| `mcp/src/tools/get-blast-radius.ts` | The description of the mcp spec word for word; `run`: `resolvePull` → `deps.api.getBlastRadius(pull.id)` → `toBlastView`; the stub's error text and comment are deleted; `readOnlyHint: true` and the input shape unchanged | security | sec-secret-exposure |

**Tests (test-writer):**
- Add `mcp/test/blast-view.test.ts` — the view of a full map equals the spec's example shape; the route's order kept; `declared_in` present and absent; each cap with its `more_*` field and the cut note; `totals` untouched by a cut; each of the seven notes of the spec's table, and the degraded-plus-cut join; `degraded`, `reason` and `note` absent for a plain map; a token-like string in a path is masked, a multi-line name is collapsed, and ordinary paths and identifiers (`src/task-runner.ts`, `ask_user`) come through unchanged.
- Extend `mcp/test/read-tools.test.ts` — `get_blast_radius` on `MockDevDigestApi`: the happy path makes exactly `listRepos`, `listPulls`, `getBlastRadius`; an unknown repository and an unknown PR return the existing texts and make no `getBlastRadius` call (B8); an `ApiError` of each kind maps to its catalogue text, a `404` from the blast route being E-API-HTTP; `pr: "482"` works.
- Extend `server/test/mcp-stdio.it.test.ts`, before `left the database as it found it` — `get_blast_radius` for `acme/payments-api` #482 is not an error, and its `totals`, `summary` and first `impact` entry (symbol, callers, endpoints) equal the body of `GET /pulls/:id/blast` read with `app.inject` (A7). No `GET /pulls/:id` call.
- Expected to change `mcp/test/api-client.test.ts` (`:632-684`) — the allow-list is nine routes: the port list gains `getBlastRadius`, `GET` routes are 8, the all-methods test calls nine methods with a blast body that parses, the prototype has nine names; add the `getBlastRadius` row to the request cases and the bad-id cases, and a body that fails the contract → `invalid_response`.
- Expected to change `mcp/test/tool.test.ts` (`:464-529`) — the E-BLAST cases are removed (`answers %j with E-BLAST`, `gives the same text whatever the arguments are`, `accepts a numeric string … yields E-BLAST`); the shape and argument-rejection cases stay.
- Expected to change `mcp/test/stdio.test.ts` — `answers tools/call get_blast_radius with isError and "not implemented"` (`:69-79`) is replaced: against the local `node:http` stub serving `/repos`, `/repos/<id>/pulls` and `/pulls/<id>/blast`, the call returns a map and no error. If the stub then knows `acme/payments-api`, the 404 case at `:391-400` asks for a repository the stub still does not serve, so its meaning is kept. The budget tests stay and must pass with the new description and instructions.

**Verify (code):** `cd mcp && npm run typecheck` · `cd mcp && npm test`
**Verify (phase):** `cd mcp && npm run typecheck && npm test` · `cd server && pnpm test` (needs `cd mcp && npm ci` once, and Docker)
**Done when:**
- A7 — on seeded data `get_blast_radius` for `acme/payments-api` #482 returns the same totals, summary and first group as `GET /pulls/:id/blast`.
- B8 — `tools/list` holds the same five tools in the same order; `get_blast_radius` has `readOnlyHint: true`, the two arguments and the new description; an unknown repository or PR returns the existing error and makes no blast request.
- D11 — a degraded or empty map is a normal result with `degraded`, `reason` and a note naming the next step, never `isError`.
- D12 — a cut list carries its `more_*` field and the note, and `totals` states the full numbers.
- `API_ROUTES` has nine entries, one write; the tool sends three reads.
- The budgets hold: `tools/list` at most 4,000 characters, instructions at most 500, each description at most 240 with no `{`.
- No file under `mcp/src/` contains the text `not implemented`.

### 8 · e2e — the block on seeded data

One read-only flow over the client ↔ API ↔ database seam, before the P3 phases so the P1 and P2 behaviour is proven in a browser first.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| Nothing — test-writer only | | | |

**Tests (test-writer):**
- Add `e2e/specs/12-pr-blast-radius.flow.json` — open `{BASE}/`, `wait --url /pulls`, `wait --text` the seeded PR title, click it, `wait --url /pulls/482`, `wait --load networkidle`; the block label through `wait --fn` on lowercased page text (`blast radius`); the four stats through `wait --fn` on page text with whitespace collapsed (`4 symbols`, `5 callers`, `3 endpoints`, `1 cron`); `wait --text "rateLimit"`; `wait --text "src/api/public/index.ts:23"`; `wait --fn` that a link exists with `href` `https://github.com/acme/payments-api/blob/b1a57b1a57b1a57b1a57b1a57b1a57b1a57b1a57/src/api/public/index.ts#L23` and `target="_blank"`; `wait --text "GET /api/public/items"`; `wait --text "reset-rate-buckets (hourly)"`; `wait --text "2 more changed symbols have no callers."`. No click after the PR row: nothing the other flows read changes, and no model is called.
- Expected to change: none — flows `01`–`11` stay unedited and must pass; `09` now sees evidence links on the seeded candidates and asserts nothing about them.

**Verify (phase):** `cd e2e && npm run typecheck && npm run e2e:hermetic`
**Done when:**
- A1–A5, C4 — flow `12-pr-blast-radius` passes in the hermetic run: the block, its four numbers, a caller `file:line` with its GitHub `href`, an endpoint chip and a cron chip.
- Flows `01`–`11` pass in the same run with no edit to their files.

### 9 · P3 — the Graph view and the Tree / Graph switch (C2) — client, with the flow extended

Cuttable: it adds one folder, one helper and the switch. The view lives in the URL (D9), read and written in the card the way `DiffTab.tsx:41-48` handles `order`. The edges are the two kinds of Q6.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `BlastRadiusCard/helpers.ts` | Add pure `graphLayout(downstream, sizes)` → nodes in three columns (changed symbols; callers; endpoints and crons) with hand-computed positions, edges, and the canvas size: one caller node per distinct `file` + `name` carrying the href of its first line; one edge from a caller to each changed symbol it reaches; one edge from a changed symbol to each endpoint and cron of its group; no edge from a caller to an endpoint or cron (Q6); one fact node per distinct value; no two nodes of a column overlap | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `BlastRadiusCard/constants.ts` | Graph sizes (column x positions, node height and gap, label length before the ellipsis) and the `blast` URL parameter name and value | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `BlastRadiusCard/styles.ts` | Styles of the switch, the scroll container and the legend | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `BlastRadiusCard/_components/BlastGraph/BlastGraph.tsx` (new), `index.ts` (new) | Inline SVG from `graphLayout`: `role="img"`, the name `graph.ariaLabel`; curved edges drawn under the nodes; labels as text nodes, a long one cut with an ellipsis and its full value in `title`; a caller node is a link with the same `href`, `target` and `rel` as its tree line; a legend of the three `graph.legend.*` kinds; horizontal scroll inside the block. No graph library | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-pure, split-no-nested-definitions, sec-xss, react-nested-component |
| `BlastRadiusCard/BlastRadiusCard.tsx` | Read `blast` with `useSearchParams()` (`graph` → graph, anything else → tree); two buttons `view.tree` / `view.graph` with `aria-pressed` at the right end of the summary row; a click calls `router.replace` on the current pathname, setting `blast=graph` or deleting `blast`, keeping every other parameter. In mode `map` the graph view renders `BlastGraph`; in mode `noCallers` it renders `graph.empty` | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-effect-derivation, react-hooks-conditional, react-render-side-effect |

**Tests (test-writer):**
- Extend `BlastRadiusCard/helpers.test.ts` — `graphLayout`: one node per distinct caller when a caller reaches two symbols, with two edges; an edge per caller-to-symbol pair; an edge per symbol-to-endpoint and symbol-to-cron pair; no edge whose ends are a caller and an endpoint or cron; one node per distinct fact; no overlap inside a column; an empty `downstream` gives no nodes.
- Extend `BlastRadiusCard/BlastRadiusCard.test.tsx` — with `blast=graph` in the mocked search params the SVG named `Blast radius graph` renders and the tree does not; a caller node is a link with the tree line's URL; the legend names the three kinds; `Graph` calls `router.replace` with `blast=graph` and keeps `tab=overview`; `Tree` deletes `blast`; `aria-pressed` follows the view; `noCallers` with the graph view shows `No downstream callers to graph.`
- Extend `e2e/specs/12-pr-blast-radius.flow.json` — after the tree checks: `wait --text "Graph"`, click the button `Graph` with `--exact`, `wait --url blast=graph`, `wait --fn` for `svg[role="img"][aria-label="Blast radius graph"]`, `reload`, the same two waits again, click `Tree` with `--exact`, `wait --fn` that the URL holds no `blast=`, `wait --text "src/api/public/index.ts:23"`.
- Expected to change `BlastRadiusCard/BlastRadiusCard.test.tsx` — no phase 6 assertion changes; the file gains a `vi.mock("next/navigation")` with a stable router (as `DiffTab.test.tsx:55-59`), because the card now reads the URL. `OverviewTab.test.tsx` mocks the card and stays unedited.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test` · `cd e2e && npm run typecheck && npm run e2e:hermetic`
**Done when:**
- C2 — the switch shows the graph and the tree again, and `?blast=graph` survives a reload (flow `12`).
- Q6 — the graph has one node per distinct caller, an edge per caller-to-symbol pair, an edge per symbol-to-endpoint and symbol-to-cron pair, and no caller-to-endpoint edge.
- The graph scrolls horizontally inside the block.
- `client/package.json` and `client/pnpm-lock.yaml` are unchanged.

### 10 · P3 — the Resync button on the mark (C6) — client

Cuttable: it adds the button to `DegradedNote` and one shared rule. The completion rule is the one `IndexStatus` uses (Assumption 8); it moves to a pure module both components import, because a route's `_components/` may not import a sibling route's.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/lib/repo-intel-resync.ts` (new) | Pure `resyncSettled(waitingFrom, state)`: true when a wait is running and the state's `updatedAt` differs from the captured one. A separate file, not `hooks/repo-intel.ts`: `IndexStatus.test.tsx:24-30` replaces that module with a two-export mock | frontend-ui-architecture, security | logic-pure-domain, struct-one-way |
| `client/src/app/repos/[repoId]/conventions/_components/IndexStatus/IndexStatus.tsx` | The comparison at line 31 calls `resyncSettled`; behaviour, strings and timeout unchanged | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-no-cross-feature |
| `BlastRadiusCard/constants.ts` | `RESYNC_FIXABLE_REASONS` = `index_partial`, `index_failed`, `no_data` (typed against the shared `BlastDegradedReason` type) and `RESYNC_MAX_POLLS = 40` | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `BlastRadiusCard/_components/DegradedNote/DegradedNote.tsx` | New props `repoId`, `prId`. For a fixable reason, a button `degraded.resync`: it calls `useResyncRepoIntel(repoId).mutate` and on success records the index row's current `updatedAt`; while waiting, `useRepoIntelStatus(repoId, true)` polls, the button is disabled and reads `degraded.resyncing`; when `resyncSettled` holds, an effect invalidates `blastKeys.pull(prId)` and stops the wait; after `RESYNC_MAX_POLLS` answered polls without a change the wait stops and `degraded.resyncSlow` is shown. The effects only react to the polled query; nothing is derived in them. Other reasons render no button | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-effect-derivation, logic-no-server-state-copy, react-hooks-conditional, react-render-side-effect |
| `BlastRadiusCard/BlastRadiusCard.tsx`, `OverviewTab/OverviewTab.tsx`, `pulls/[number]/page.tsx` | A required `repoId` prop passed page → `OverviewTab` → `BlastRadiusCard` → `DegradedNote` (the page has it from `useParams`) | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |

**Tests (test-writer):**
- Add `client/src/lib/repo-intel-resync.test.ts` — false with no wait, false with no state, false for the same `updatedAt`, true for a different one.
- Extend `BlastRadiusCard/BlastRadiusCard.test.tsx` (`@/lib/hooks/repo-intel` mocked with stable objects) — the button is shown for `index_partial`, `index_failed` and `no_data` and absent for `flag_off`, `repo_too_large` and `pr_files_missing`; a click calls the resync mutation once, starts polling and shows `Resyncing…` on a disabled button; when the mocked state's `updatedAt` changes, `blastKeys.pull(prId)` is invalidated once and polling stops; after `RESYNC_MAX_POLLS` unchanged answers polling stops and `The index has not changed yet. Try again in a minute.` is shown.
- Expected to change `BlastRadiusCard/BlastRadiusCard.test.tsx` and `OverviewTab/OverviewTab.test.tsx` — the render helpers pass the new required `repoId`, and the OverviewTab props assertion includes it; no other expectation changes.
- Expected to change: nothing in `IndexStatus/IndexStatus.test.tsx` — its four tests stay unedited and must pass.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- C6 — Resync next to the mark calls `POST /repos/:id/resync`, and the map is read again when the index row changes.
- The button appears only for `index_partial`, `index_failed` and `no_data`.
- `IndexStatus` and `DegradedNote` use the same `resyncSettled`, and `IndexStatus.test.tsx` is unedited and green.

### Closing steps — not a phase (no implementer, no test-writer)

- `plan-verifier` and `architecture-reviewer` after phase 10 (or after phase 8 if P3 is cut), then `/pr-self-review` and `cd e2e && npm run e2e:hermetic` with the dev stack stopped.
- `doc-writer`: `server/README.md` (API map: the `blast` module and a row for `GET /pulls/:id/blast` in the style of the Smart Diff row); `server/src/modules/repo-intel/README.md` (the per-symbol cap; `getBlastRadius` is now wired); `client/docs/data-flow.md` (a `["blast", prId, headSha]` row) and `client/docs/ui-architecture.md` (`?blast=graph`); `mcp/README.md` (the tool row, the stub paragraph, the Inspector example); `specs/L04-devdigest-mcp.md` and `mcp/specs/L04-devdigest-mcp.md` (tool 5 and the E-BLAST row point to `mcp/specs/L04-blast-radius.md`); `e2e/specs/README.md` and `e2e/README.md` (a row for flow `12`); the status rows of the four `specs/**/README.md` indexes.
- Main session: `mcp/CLAUDE.md` ("eight routes" → nine, the stub gotcha removed, a row for `src/blast-view.ts`); a `Superseded` line under `server/INSIGHTS.md:80` through the `engineering-insights` skill; the PR description naming what each agent did (B9) and the demo video (A8).

## Out of scope
- The collapsible tree (C1) and the Prior PRs block (C3); anything that fills `PrHistory`.
- A model-written summary; the Intent, Risk areas and Review focus blocks and the two-column layout of the prototype.
- A caller of a caller; `BFS_DEPTH`; re-indexing from the blast route; a GitHub call from the blast route.
- Any change to how `repo-intel` builds the index, to `BlastResult`, to the facade's signature or to what it reports as degraded; an `ORDER BY` on the facade's symbol read; validating `repo_index_state.stats` on read.
- A caller-to-endpoint edge in the graph, and a per-caller facts field in the contract (Q6).
- Repeating the server's `caller_limit` in the MCP view (Q7).
- Any edit to `brief.ts`, to a migration, to a lock file or to `package.json`; any new dependency.
- Extending `useRunSettledRefresh` (a finished review does not change the map).
- Refactoring `IndexStatus` beyond the one comparison; fixing the hard-coded `Description` label in `OverviewTab.tsx:16`; removing the baselined `repos/service.ts → repo-intel/constants.ts` import.
- Documentation and `CLAUDE.md` edits (closing steps).

## Risks
- **Seeding `repo_index_state` for the demo repo changes its Conventions screen** (`server/src/modules/conventions/repository.ts:56-61`, `service.ts:75`, `:244`): seeded candidates get a GitHub evidence link at the seeded SHA, the index line shows that SHA, and the scan route passes its first not-indexed check. Accepted by the user (Q7). — No test or flow asserts the old behaviour (checked in phase 4); `seed-fixtures.md` records it in the same phase; the hermetic run of phase 8 covers flow `09`.
- **Seeded `file_rank` rows give two of the demo PR's files a high percentile**, so a real review of PR #482 in a dev database gains a rank note in its prompt. — No test reviews the seeded PR; accepted.
- **`index_failed` and `repo_too_large` have no writer today** (Constraints, "Facade facts"): through the route they appear only for an index row that carries them, which phase 3 creates in its test. — The mapping is tested end to end, so they work when the indexer starts writing them; nothing in the UI is unreachable code.
- **`stats.degradedReason` is cast, not parsed** (`server/src/modules/repo-intel/repository.ts:231`): a hand-written value outside the enum would reach `reason`, and the MCP client would reject the body as E-API-SHAPE. — Only the indexer writes that column, and it writes `no_data`; left as it is because the facade is out of scope.
- **`changed_symbols` order is not deterministic** (the facade reads symbols without `ORDER BY`). — Integration tests compare it as a set; the MCP `declared_in` uses the first entry of a name, stable while names are unique per PR.
- **Equal ranks at the cap boundary** make the kept rows depend on database order. — The cap test uses distinct ranks; the mapper's own order has full tie-breaks.
- **`mcp-stdio.it.test.ts` and the other integration files skip silently without Docker.** — Read every `pnpm test` summary for `skipped`; phases 2, 3, 4 and 7 do not close on a skipped file.
- **The instructions budget** (470 of 500 characters before the new sentence). — The stdio budget test fails the phase if the shortened text is still too long.
- **A hermetic e2e run while the dev stack is up** leaves `client/.next` pointing at the e2e API. — Stop the dev stack before phases 8 and 9.
- **`client/src/vendor/shared` edited by hand** can drift from the authored file. — Phase 1 copies only the added lines and both typechecks run.

## Open questions
- **Row 4 of the degraded table cannot be produced by the real facade.** The root spec's acceptance says "each row of the degraded table above is reachable through the route", and Q5 says "every reason is reachable through the route". With the Q5 order every *reason* is reachable (phase 3, Done when), but row 4 as a row is not: the facade answers `degraded: true` only when the flag is off (row 2 wins), when no paths are given (row 1 wins), or when the index row is missing or not `full`/`partial` (row 3 wins, since `getIndexState` then answers `degraded` or `failed`) — `server/src/modules/repo-intel/service.ts:189-205`, `:223-226`, `:320`. Row 4 is a safety net for a facade that changes later. Options: (a) keep the row, cover it through the route with a facade injected by `ContainerOverrides.repoIntel` and in the domain unit test, and read the acceptance line as "every reason" — planned; (b) reword the acceptance line of `specs/L04-blast-radius.md` to "every reason is reachable through the route; row 4 is covered with an injected facade". No code depends on the choice; I would do (a) now and (b) when the spec is next touched.
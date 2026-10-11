# L04 — Blast Radius (server)

The server part of [`../../specs/L04-blast-radius.md`](../../specs/L04-blast-radius.md): one
read-only route that turns the `repo-intel` facade's flat `BlastResult` into the grouped
`BlastRadiusResponse`, a one-line fix of the facade's caller cap, and index rows in the seed.

The module computes nothing about the code. It reads stored rows, regroups them and counts.

## What already exists

| Piece | Where |
|---|---|
| `container.repoIntel` — `getBlastRadius`, `getIndexState`; a test injects a mock through `ContainerOverrides.repoIntel` | `src/platform/container.ts` |
| `BlastResult`, `BlastCallerRow`, `BlastChangedSymbol`, `IndexState`, `DegradedReason` | `src/modules/repo-intel/types.ts` |
| `MAX_CALLERS_PER_SYMBOL` | `src/modules/repo-intel/constants.ts` |
| `pull_requests` (workspace-scoped, `repo_id`), `pr_files` (`path`) | `src/db/schema/pulls.ts` |
| `getContext`, `IdParams`, `NotFoundError` | `src/modules/_shared/`, `src/platform/errors.ts` |
| A module of the same shape (route → service → repository → pure domain) | `src/modules/smart-diff/` |

## Contract

Added to `src/vendor/shared/contracts/review-api.ts`, next to `SmartDiffResponse`, and exported
through the package index. The same lines go into `client/src/vendor/shared/contracts/review-api.ts`.

```ts
export const BlastDegradedReason = z.enum([
  'flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data', 'pr_files_missing',
]);

export const BlastTotals = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});

/** Response of `GET /pulls/:id/blast`. */
export const BlastRadiusResponse = BlastRadius.extend({
  totals: BlastTotals,
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(), // null exactly when degraded is false
  indexed_sha: z.string().nullable(),     // the commit the line numbers refer to
  caller_limit: z.number().int().positive(),
});
```

Each schema has its inferred type under the same name. The first five values of
`BlastDegradedReason` are the facade's `DegradedReason`; the port assignment in `routes.ts`
(below) ties the two at compile time, so a new facade reason fails `typecheck` instead of
failing a request.

## Module `src/modules/blast/`

| File | Holds |
|---|---|
| `routes.ts` | the Fastify plugin; registered in `src/modules/index.ts` as `blast` |
| `service.ts` | `BlastService.forPull(workspaceId, prId, log)` — the request logger is a parameter, since a service cannot import Fastify |
| `repository.ts` | `BlastRepository` — two reads |
| `domain.ts` | `toBlastRadius`, `resolveDegraded`, `buildSummary`, and the structural input types `BlastSourceResult` and `BlastSourceIndexState` — pure, no imports outside `@devdigest/shared` |
| `ports.ts` | `BlastStore` (the two reads), `BlastSource` (`getBlastRadius`, `getIndexState`), `BlastLog` (`info`) |

`arch:check` forbids one module importing another, type-only imports included
(`dep-no-cross-module`). So the `blast` module does not import `repo-intel/types` or
`repo-intel/constants`: it declares the shape it needs from the facade as its own structural
types, and `routes.ts` assigns `container.repoIntel` to the `BlastSource` port. That assignment
is the compile-time check: a facade reason or index status the module does not know fails
`typecheck`. The caller limit reaches the module through a new getter on the container, the
composition root: `container.repoIntelLimits.callersPerSymbol`, which returns
`MAX_CALLERS_PER_SYMBOL`.

The service receives its dependencies through a deps object — the store, the source,
`repoIntelEnabled` and `callerLimit` — wired in `routes.ts`. Check the placement with the
`onion-architecture` skill and `pnpm arch:check`; no new violation and no new baseline entry.

### Route

`GET /pulls/:id/blast` — `params: IdParams`, no body, no query.

| Case | Answer |
|---|---|
| the PR exists in the caller's workspace | `200`, a `BlastRadiusResponse` |
| unknown PR, or one of another workspace | `404`, code `not_found` |
| an id that is not a uuid | `422` (schema validation) |

No other failure is turned into an error: the facade never throws, and a missing or broken
index is a `200` with `degraded: true`. The route inherits the global rate limit; it is cheap
and gets no tighter one.

### Repository reads

- `findPull(workspaceId, prId)` → `{ id, repoId } | undefined`, from `pull_requests`.
- `changedPaths(prId)` → `string[]`, the `path` column of `pr_files`, ordered by path.

### Service

1. `findPull`; `undefined` → `NotFoundError('Pull request not found')`.
2. `changedPaths`. When it is empty: skip the facade, read only `getIndexState`, and answer the
   empty map with `degraded: true`, `reason: 'pr_files_missing'`.
3. Otherwise call `repoIntel.getBlastRadius(repoId, paths)` **once** and
   `repoIntel.getIndexState(repoId)` once, in parallel.
4. Return `toBlastRadius(result, { indexState, repoIntelEnabled, callerLimit })`.
5. Log one line through the request logger (B1), at `info`:
   `{ prId, repoId, files, symbols, callers, endpoints, crons, degraded, reason, indexStatus, indexedSha, ms }`
   with the message `blast: served from the repo-intel index`. No path or symbol name is logged.

### Building the response (`domain.ts`)

`toBlastRadius(result: BlastResult, ctx): BlastRadiusResponse`:

| Field | Rule |
|---|---|
| `changed_symbols` | `result.changedSymbols` as `{ name, file, kind }`, in the facade's order |
| `downstream` | group `result.callers` by `viaSymbol`; one entry per symbol with at least one remaining caller |
| a caller | `{ name: row.symbol, file: row.file, line: row.line }` |
| dropped callers | a row whose `file` is a file that declares a changed symbol named `viaSymbol` (B5); a row whose `viaSymbol` is not in `changedSymbols`; an exact duplicate of `file` + `line` inside one group |
| caller order | `rank` descending, then `file`, then `line` (C5) |
| group order | the group's highest `rank` descending, then `symbol` |
| `endpoints_affected` | the distinct union of `factsByFile[caller.file].endpoints` over the group's callers, sorted; `[]` when `factsByFile` is absent |
| `crons_affected` | the same over `.crons` |
| `totals.symbols` | `changed_symbols.length` |
| `totals.callers` | the sum of `callers.length` over `downstream` |
| `totals.endpoints`, `totals.crons` | distinct values across all groups |
| `summary` | `buildSummary(totals)` |
| `degraded`, `reason` | `resolveDegraded(...)`, below |
| `indexed_sha` | `indexState.lastIndexedSha`, or `null` when it is empty |
| `caller_limit` | `ctx.callerLimit` |

`buildSummary` returns one sentence with correct plurals and no model:
`"2 changed symbols, 14 callers, 3 endpoints, 1 cron job."`. With no changed symbol:
`"No symbols are declared in the changed files."`. With symbols and no caller:
`"2 changed symbols, no downstream callers."`.

`resolveDegraded` applies the table of the root spec ("Degraded is a mark, not an error"),
first match wins: `pr_files_missing` → `flag_off` → index status `degraded` or `failed` (the
state's `degradedReason`, else `index_failed`) → the facade's own `degraded` (its `reason`,
else `no_data`) → index status `partial` (`index_partial`) → not degraded, `reason: null`.
The index status comes before the facade's flag (Q5), because on a failed index the facade
falls back to the clone and reports `no_data`.

## The caller cap in `repo-intel` (Q2)

`tryPersistentBlast` in `src/modules/repo-intel/service.ts` ends with
`callers.slice(0, MAX_CALLERS_PER_SYMBOL)` on the flat, rank-sorted list. Replace it with a cap
per `viaSymbol`: keep the first `MAX_CALLERS_PER_SYMBOL` rows of each symbol in the existing
rank order. The fallback path has no cap today and is not changed. Nothing else in the facade
changes: not its signature, not `BlastResult`, not what it reports as degraded.

`BFS_DEPTH` is not used by `getBlastRadius` and is not surfaced by this feature.

## Seed (Q3)

`pnpm db:seed` stays idempotent and adds, for the demo repository of PR #482, the rows that
make the route answer a full map with no clone on disk:

| Table | Rows |
|---|---|
| `repo_index_state` | one row: `status: 'full'`, the current `INDEXER_VERSION`, a fixed `last_indexed_sha` |
| `symbols` | `rateLimit` and `bucketKey` declared in `src/middleware/ratelimit.ts` (a changed file), plus the enclosing symbols of the callers: `publicRouter`, `webhookHandler`, `healthCheck`, `app`, `resetBuckets` |
| `references` | resolved references (`decl_file` set) to `rateLimit` from `src/api/public/index.ts:23`, `src/api/public/webhooks.ts:45`, `src/api/public/health.ts:11`, `src/server.ts:88`; to `bucketKey` from `src/jobs/reset-buckets.ts:8` |
| `file_rank` | one row per caller file, with distinct ranks so that the order is fixed |
| `file_facts` | `GET /api/public/items` on `index.ts`, `POST /api/public/webhooks` on `webhooks.ts`, `GET /api/public/health` on `health.ts`; the cron `reset-rate-buckets (hourly)` on `reset-buckets.ts` |

The prototype also lists `src/middleware/ratelimit.ts:41` as a caller of `bucketKey`. That is
the declaring file, so it is not seeded as a caller (B5). The seeded answer is therefore
2 groups, 5 callers, 3 endpoints, 1 cron; `symbols` counts every seeded symbol declared in the
PR's changed files. Record the exact values in `e2e/specs/seed-fixtures.md`.

`src/api/public/index.ts` and `webhooks.ts` are themselves files of PR #482. That is allowed: a
changed file can call a symbol declared in another changed file.

## Tests

| File | Kind | Covers |
|---|---|---|
| `test/blast-domain.test.ts` | hermetic | grouping by `viaSymbol` (B3); a declaring file dropped (B5); a caller of an unknown symbol dropped; caller and group order by rank with the tie-breaks (C5); endpoints and crons attributed through caller files and de-duplicated; no `factsByFile` → empty lists; the totals; `buildSummary` for the three shapes and the singular forms; every row of the degraded table; `reason` is `null` exactly when `degraded` is `false`; the output parses as `BlastRadiusResponse` and as `BlastRadius` (B2) |
| `test/blast-service.test.ts` | hermetic | with a mock facade: `getBlastRadius` called exactly once with the PR's paths; not called when the PR has no files; unknown PR → `NotFoundError`; `caller_limit` equals `MAX_CALLERS_PER_SYMBOL` (B6); the log line carries the counts and no path |
| `test/blast.it.test.ts` | Postgres | the route on seeded index rows: `200`, the body parses, the seeded groups and totals; a `partial` index → `degraded: true`, `index_partial`, the map still present; a `failed` index → `index_failed` (Q5); no index row → `no_data`; `404` for an unknown PR and for a PR of another workspace; `422` for a bad id; no row is written by the request |
| `test/repo-intel-blast-cap.it.test.ts` | Postgres | Q2: 25 references to one symbol and 5 to another give 20 and 5, highest rank kept |
| `test/routes-smoke.test.ts`, `test/contracts.test.ts` | hermetic | the new route and the new contracts, where those suites enumerate them |

Where each test belongs is decided by `../../TESTING.md`.

## Documentation

`README.md` — the API map gets the `blast` module and a row for `GET /pulls/:id/blast` in the
style of the Smart Diff row. `src/modules/repo-intel/README.md` — the per-symbol cap. Both are
written by `doc-writer` after the code is verified.

## Acceptance

- [ ] `GET /pulls/:id/blast` answers a body that parses as `BlastRadiusResponse` and as
      `BlastRadius` (B2).
- [ ] One request makes exactly one `getBlastRadius` call and writes nothing; its log line
      shows the index status and the counts; no model, clone or index job is involved (B1, B4).
- [ ] `downstream` is grouped by symbol, without the declaring file, in rank order (B3, B5, C5).
- [ ] `totals` and `summary` agree with the arrays in every test fixture.
- [ ] Each row of the degraded table is covered and returns `200` (B7).
- [ ] The facade caps callers per symbol; the number 20 exists only in
      `repo-intel/constants.ts` (B6, Q2).
- [ ] On a fresh seed, the route answers the seeded map for PR #482 with `degraded: false`.
- [ ] `pnpm typecheck`, `pnpm test` and `pnpm arch:check` are green.

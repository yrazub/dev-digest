# L01 — Findings counter (server)

Store a per-severity findings breakdown on each run, and surface it plus a read-only finding
preview list from the PR list endpoint.

Read [`specs/L01-findings-counter.md`](../../specs/L01-findings-counter.md) first — it
states what the feature is, and that it was revised against `docs/hw1-criteria.md`
(criteria #16–23), which takes precedence over the first draft. The client-side half is
specified in
[`../../client/specs/L01-findings-counter.md`](../../client/specs/L01-findings-counter.md).

## Two different sources, for two different screens

| Screen | Granularity | Source |
|---|---|---|
| PR list badges + popover (A) | the PR's **latest completed run** | `agent_runs`, the same query that sums `cost_usd` |
| Timeline tiles (C) | **every** run for the PR | `agent_runs`, one row per run, already fetched by `GET /pulls/:id/runs` |
| Review-runs pill row + filter (B) | **one run's** findings | `review.findings`, already fetched client-side — no server change |

B needs nothing here — see the client spec. A and C both key off `agent_runs`, which
already denormalizes a flat `findingsCount` at run completion
(`server/src/db/schema/runs.ts:27`, written in `run-executor.ts:249`). This spec adds the
per-severity version next to it, using the same write path, so both screens read a plain
column instead of joining `findings` on every list request.

## `rollupSeverities` — casing fix

`src/modules/pulls/status.ts` already has the right shape with the wrong keys — the module's
own docstring anticipates this feature ("a FINDINGS severity breakdown") but nothing calls
it. Fix the casing to match `Severity` and `findings_by_severity` elsewhere in the codebase:

```ts
// before
export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}
```

```ts
// after
export interface SeverityCounts {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.CRITICAL += 1;
    else if (r.severity === 'WARNING') c.WARNING += 1;
    else if (r.severity === 'SUGGESTION') c.SUGGESTION += 1;
  }
  return c;
}
```

## Schema

`agent_runs` gains one nullable jsonb column, after `findings_count`:

```ts
findingsBySeverity: jsonb('findings_by_severity').$type<{
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}>(),
```

Same nullability story as `cost_usd`: `null` until the run completes, and `null` (not a
zeroed object) for `failed`/`cancelled` runs, exactly mirroring how `findings_count` itself
already behaves for those statuses. The migration is produced by `pnpm db:generate` (next
number after `0010`, run-cost's) and applied with `pnpm db:migrate`; migrations and
`meta/_journal.json` are never hand-edited.

## Write path

`src/modules/reviews/run-executor.ts:243-254`, `completeAgentRun` call — `keptFindings`
(`= outcome.review.findings`, line 215) is already in scope where `findingsCount:
findingRows.length` is set. Add one line using the same array:

```ts
findingsCount: findingRows.length,
findingsBySeverity: rollupSeverities(keptFindings),
```

`repository/run.repo.ts`'s `completeAgentRun` (lines 142-177) gains a matching
`findingsBySeverity` field on its `values` type and its `.set({...})` call, written whenever
`findingsCount` is. On the failure path (`run-executor.ts:83, 305`, `findingsCount: 0`),
leave `findingsBySeverity` unset (`null`) rather than `{CRITICAL:0,...}` — a failed run has
no meaningful breakdown, same reasoning as `costUsd` staying `null` there.

## Contracts

Authored in `src/vendor/shared/`, then copied to `client/src/vendor/shared/` (the client's
copy is synced by hand — see the root `CLAUDE.md`).

| File | Change |
|---|---|
| `contracts/trace.ts` → `RunSummary` | `findings_by_severity: z.object({ CRITICAL: z.number().int(), WARNING: z.number().int(), SUGGESTION: z.number().int() }).nullable()`, next to `findings_count` |
| `contracts/platform.ts` → `PrMeta` | `findings_by_severity: <same object>.nullish()`, next to `score`/`cost_usd` |
| `contracts/platform.ts` → `PrMeta` | `findings_preview: z.array(Finding).nullish()`, right after `findings_by_severity` |

`RunSummary`'s copy is `.nullable()` (server always writes the key on objects it builds,
same as `cost_usd` there); `PrMeta`'s copies are `.nullish()` (list-endpoint-only fields,
same as `score`/`cost_usd`). `findings_preview` reuses the existing `Finding` schema
verbatim rather than a new narrower type — it already carries every field the popover needs
(severity, category, title, file, start_line, end_line, confidence, rationale) and the extra
fields (`suggestion`, `kind`, trifecta fields) are simply unused by a read-only preview, not
harmful to include.

## Query — `GET /repos/:id/pulls`

The existing cost lookup in `src/modules/pulls/routes.ts` already reads every
`status = 'done'` row in `agent_runs` for the PRs on the page, newest first. Extend its
`select` to also pull `id` and `findingsBySeverity`:

```ts
const runRows = await container.db
  .select({
    prId: t.agentRuns.prId,
    runId: t.agentRuns.id,
    costUsd: t.agentRuns.costUsd,
    findingsBySeverity: t.agentRuns.findingsBySeverity,
  })
  .from(t.agentRuns)
  .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
  .orderBy(desc(t.agentRuns.ranAt));
```

One pass over those rows fills two maps: `latestRunByPr: Map<prId, { runId,
findingsBySeverity }>` (first row seen per PR — the latest completed run), and the per-PR
cost total (every row summed; see `L01-run-cost.md`). `PrMeta.findings_by_severity` comes
straight off the first map. So the findings column shows one run, while `cost_usd` covers
all of them.

For `findings_preview`, add one more query scoped to the run ids just collected:

```ts
const runIds = [...latestRunByPr.values()].map((r) => r.runId);
const previewRows = runIds.length
  ? await container.db
      .select({ runId: t.reviews.runId, finding: t.findings })
      .from(t.reviews)
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.reviews.runId, runIds))
  : [];
```

Group `previewRows` by `runId` in JS, then look up each PR's preview list via its
`latestRunByPr` entry's `runId`. A PR whose latest completed run has no matching `reviews`
row (should not happen in steady state, but a run predating the `reviews.run_id` link is
possible on seeded/legacy data) gets `findings_preview: []`, not an error.

`findings_by_severity` for a PR with **no** completed run is `null` (no entry in
`latestRunByPr`), exactly like `cost_usd` is `null` for the same PRs.

## Endpoints

| Endpoint | Change |
|---|---|
| `GET /repos/:id/pulls` | each `PrMeta` carries `findings_by_severity` and `findings_preview` |
| `GET /pulls/:id/runs` | each `RunSummary` carries `findings_by_severity` |

`GET /pulls/:id` (`PrDetail`) and `GET /runs/:id/trace` are untouched — the Review-runs pill
row/filter (screen B) works entirely off `review.findings`, already fetched, and the Run
Trace drawer (screen D) already renders full findings, not a count.

## Acceptance criteria

1. A run with 2 CRITICAL, 1 WARNING, 0 SUGGESTION findings writes
   `agent_runs.findings_by_severity = {CRITICAL:2, WARNING:1, SUGGESTION:0}` on completion.
2. A `failed`/`cancelled` run has `findings_by_severity = null`, never a zeroed object.
3. `GET /repos/:id/pulls` returns `findings_by_severity` and `findings_preview` from the
   **latest completed** run, unaffected by a later `running`/`failed` run. (`cost_usd`, by
   contrast, is the total over all completed runs.)
4. `findings_preview` for that PR contains exactly the findings of that run's review — no
   findings from an older review or a different run leak in.
5. A PR with no completed run returns `findings_by_severity: null` and
   `findings_preview: []`.
6. `GET /pulls/:id/runs` returns `findings_by_severity` per run, independent of which run is
   "latest" — every settled run in the list carries its own breakdown.
7. `rollupSeverities()` returns `{ CRITICAL, WARNING, SUGGESTION }` and its one call site
   (`run-executor.ts`) uses the new shape.

## Tests

- `test/contracts.test.ts` — add `findings_by_severity` to the `RunSummary` fixture; add
  `findings_by_severity` and `findings_preview` to the `PrMeta` fixture.
- A unit test for the updated `rollupSeverities()` — uppercase keys, unknown severities
  ignored.
- `test/reviews.it.test.ts` — assert `agent_runs.findings_by_severity` after a completed run
  with a known mix of severities, and `null` after a failed run.
- A pulls-list test (`*.it.test.ts`): a PR whose latest completed run has findings across all
  three severities (assert badges + preview), a PR with a completed run and zero findings
  (assert `{CRITICAL:0,...}` and an empty preview, not `null`), a PR with no completed run
  (assert both fields `null`), and a PR with a newer `failed` run after a completed one
  (assert the completed run's data still wins).

Anything that is not `*.it.test.ts` must stay hermetic and key-free.

## Out of scope

- The Review-runs pill row and severity filter (screen B) need no server change — see the
  client spec.
- `RunTrace.stats` is not touched; the Run Trace drawer already renders full findings
  (screen D), which this spec does not need to improve on.
- `multi_agent_runs` and the `observability.ts` cost/findings contracts belong to a later
  lesson and stay untouched.

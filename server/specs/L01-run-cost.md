# L01 — Run cost (server)

Persist the USD cost of an agent run and expose it from the three endpoints the UI reads.

Read [`specs/L01-run-cost.md`](../../specs/L01-run-cost.md) first — it states what the
feature is and why an unknown cost must stay unknown. The client-side half, the three
screens that render the value, is specified in
[`../../client/specs/L01-run-cost.md`](../../client/specs/L01-run-cost.md).

## Why this is only wiring

The cost is already computed and already reaches this module; it is simply thrown away.

| Stage | Where | State |
|---|---|---|
| priced per LLM call | `src/adapters/llm/pricing.ts` (`estimateCost`, USD per 1M tokens) | works |
| live prices for OpenRouter | `src/platform/price-book.ts`, injected in `src/platform/container.ts` | works |
| accumulated across chunks | `reviewer-core` → `ReviewOutcome.costUsd` | works |
| persisted | — | **missing** |

`estimateCost` returns `null` for a model it does not know, and `reviewer-core` makes that
`null` sticky: one unpriced chunk makes the whole run's cost unknown. That is deliberate,
and this spec preserves it — an unknown cost must stay `null` all the way to the client,
never collapse to `0`.

## Contracts

Authored in `src/vendor/shared/`, then copied to `client/src/vendor/shared/` (the client's
copy is synced by hand — see the root `CLAUDE.md`).

| File | Change |
|---|---|
| `contracts/trace.ts` → `RunStats` | `cost_usd: z.number().nullable()`, right after `tokens_out` |
| `contracts/trace.ts` → `RunSummary` | `cost_usd: z.number().nullable()`, right after `tokens_out` |
| `contracts/platform.ts` → `PrMeta` | `cost_usd: z.number().nullish()`, next to `score` |

`PrMeta.cost_usd` is `.nullish()` because it is populated by the list endpoint only —
exactly like its neighbour `score`, and it carries the same comment. In `trace.ts` it is
`.nullable()`, because the server always writes the key on the objects it builds.

## Schema

`agent_runs` gains one nullable column, after `tokens_out`:

```ts
costUsd: doublePrecision('cost_usd'),
```

`doublePrecision` matches the existing `ci_runs.cost_usd` and `eval_runs.cost_usd`.
The migration is produced by `pnpm db:generate` (next number is `0010`) and applied with
`pnpm db:migrate`; migrations and `meta/_journal.json` are never hand-edited.

## Behaviour

| Run reaches | `agent_runs.cost_usd` |
|---|---|
| `done` | `ReviewOutcome.costUsd` — may itself be `null` when the model is unpriced |
| `failed` / `cancelled` | `null` |
| still `running` | `null` — the column is written only on completion |

The same value is written into `run_traces.trace.stats.cost_usd`. Traces built on the
failure path record `cost_usd: null`.

## Endpoints

| Endpoint | Change |
|---|---|
| `GET /pulls/:id/runs` | each `RunSummary` carries `cost_usd` |
| `GET /runs/:id/trace` | `stats.cost_usd` |
| `GET /repos/:id/pulls` | each `PrMeta` carries `cost_usd` — see below |

### `GET /repos/:id/pulls` — which run's cost

The list column shows the cost of the PR's **latest completed** run: newest `ran_at` among
rows with `status = 'done'`. A later `running` or `failed` run does not displace it. A PR
with no completed run returns `null`.

Compute it the way the endpoint already computes the latest review score — one `IN` query
over all the PR ids on the page, ordered newest-first, first row seen per PR wins — rather
than a subquery per row. `prIds` is already scoped to the repo, so no extra workspace
filter is needed.

## Acceptance criteria

1. After a successful run, `agent_runs.cost_usd` equals `ReviewOutcome.costUsd`.
2. A `failed` or `cancelled` run stores `null`, never `0`.
3. An unpriced model yields `cost_usd: null` from all three endpoints — never `0`.
4. `GET /repos/:id/pulls` returns the latest **completed** run's cost, unaffected by a
   newer run that is still running or that failed.
5. A PR with no runs returns `cost_usd: null`.
6. `agent_runs` rows that predate the migration have `cost_usd = NULL` and break no endpoint.
7. Trace documents written before this lesson have no `stats.cost_usd`; `GET /runs/:id/trace`
   still serves them (the trace body is not re-validated on read).

## Tests

- `test/contracts.test.ts` — add `cost_usd` to the `RunStats` and `RunSummary` fixtures.
- `test/reviews.it.test.ts` — assert the persisted `cost_usd` after a completed run.
  `MockLLMProvider` returns `costUsd: 0.001` per structured call, so a single-pass review
  over a one-file diff costs exactly `0.001`.
- A test for the "latest completed run" selection used by the PR list, including the case
  where a newer `failed` run must be ignored.

Anything that is not `*.it.test.ts` must stay hermetic and key-free.

## Out of scope

- `reviewer-core` is not modified. Its accumulation is already correct.
- The cost of runs that throw is lost: the tokens and dollars spent on failed
  structured-output attempts live in local variables inside the provider and vanish with
  the exception. Not addressed here.
- `multi_agent_runs` and the `observability.ts` cost contracts belong to a later lesson and
  stay untouched.

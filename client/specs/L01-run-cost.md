# L01 — Run cost (client)

Surface the USD cost of a review run on the three screens that the design file
(`docs/DevDigest Design (standalone).html`) shows it on.

Read [`specs/L01-run-cost.md`](../../specs/L01-run-cost.md) first — it states what the
feature is and why an unknown cost must stay unknown. The data comes from the server half,
specified in [`../../server/specs/L01-run-cost.md`](../../server/specs/L01-run-cost.md),
which adds `cost_usd` to `PrMeta`, `RunSummary` and `RunStats`. Nothing here needs a new
hook or a new request — every screen already fetches the object the field lands on.

## Formatting

One exported helper covers all three screens:

```ts
/** A run's USD cost at 4 decimal places ($0.0013); em-dash when unknown. */
export function formatCostUsd(usd: number | null | undefined): string;
```

Four decimals everywhere, so that a fraction-of-a-cent run does not read as `$0.00`.
It accepts `undefined` because trace documents written before this lesson have no
`cost_usd`. It belongs in `src/lib/`, since it is needed in two separate route trees and in
the list; the private `fmt` in `src/lib/model-label.ts` formats per-1M model prices and is a
different concern.

## Screen A — pull-request list · `/repos/:repoId/pulls`

A new `COST` column between `STATUS` and `UPDATED`, showing `formatCostUsd(pr.cost_usd)`:
the total cost of all that PR's completed runs, or `—` (no completed run, or any of them
unpriced). The server does the summing; the client only formats the number.

The table is a CSS grid whose header renders from a single list of column keys, so the
column is one new key, one new grid track, one new cell and one new `next-intl` string.
The header helper right-aligns only the last column, so `COST` stays left-aligned — as in
the mockup.

> **Known divergence from the mockup, deliberately not closed.** The mockup places COST
> before a per-row `Run Review` button, but the app has no such button: the last column is
> `UPDATED` and clicking the row opens the PR. The mockup also shows a `FINDINGS` column
> that does not exist. Both are out of scope for L01.

## Screen B — PR detail → Agent runs

### B1 — the timeline run row

Under the timestamp in the right-hand metadata column, a second line:

```
9,119 tok · $0.0013
```

Tokens are `tokens_in + tokens_out`, thousands-grouped, rendered only when the sum is
greater than zero. The ` · $…` tail is appended only when `cost_usd` is not null, so an
unpriced run shows the token count alone. Both values are already on `RunSummary`; the
tokens simply were not being rendered.

### B2 — the accordion header in "Review runs"

The cost sits between the score badge and the run's date.

A review is not a run, so `ReviewRecord` must **not** gain a cost field. The parent tab
already has both lists: it matches the review's `run_id` against the runs it fetched and
passes the cost down as a prop. When no run matches, or the cost is null, nothing renders.

## Screen C — Run Trace drawer

The **Stats** card gains a fourth tile, making the row
`DURATION · TOKENS · COST · FINDINGS` as in the mockup. The tiles are a flex row of equal
`flex: 1` children, so the layout needs no change — they just get narrower.

Traces written before this lesson have no `stats.cost_usd`, and the trace response is not
validated on read, so the field arrives `undefined` and the tile shows `—`.

## States

| Case | Rendered |
|---|---|
| cost known | `$0.0013` |
| cost `null` (unpriced model, failed run, no run yet) | `—` on A and C; omitted on B1 and B2 |
| list still loading | the existing skeleton row — no cost-specific state |

## Acceptance criteria

1. All three screens render a known cost as `$0.0000`, four decimals.
2. An unknown cost is `—` on the list and in the drawer tile, and is simply absent on the
   timeline line and the accordion header — never `$0.0000`, never a blank cell.
3. The `COST` column header and the `COST` tile label come from `next-intl`, not from
   strings inlined in JSX.
4. The token line on the timeline disappears entirely when a run reports no tokens.
5. Cost and token values render with tabular figures (`tnum` / `mono`), like the numbers
   beside them.

## Tests

Colocated, following the existing component tests: real message JSON through
`NextIntlClientProvider`, `afterEach(cleanup)`, hook modules mocked with `vi.mock` (no
`fetch` mocking).

- A unit test for `formatCostUsd`: four decimals, and `null` / `undefined` → `—`.
- A new test for the list row — the formatted cost, and `—` when there is none. The row
  calls `useRouter()`, so `next/navigation` needs mocking.
- Extend the timeline test — its run factory gains `cost_usd`; assert the combined
  `… tok · $…` line, and that the ` · $` tail is absent when the cost is null.
- Extend the drawer test — add `cost_usd` to the trace fixture and assert the `COST` tile.

Browser-level acceptance for these screens belongs in [`../../e2e/specs`](../../e2e/specs);
no existing flow asserts on cost, so none needs updating for L01.

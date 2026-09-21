# L01 — Run cost

Show what a review actually costs, in USD, everywhere a run is visible.

This is the umbrella spec: what the feature is, how the value travels end to end, and who
owns which part. The implementable detail lives in the two module specs:

| Package | Spec | Owns |
|---|---|---|
| `server` | [`server/specs/L01-run-cost.md`](../server/specs/L01-run-cost.md) | the column, the persistence, the three endpoints, the shared contracts |
| `client` | [`client/specs/L01-run-cost.md`](../client/specs/L01-run-cost.md) | the three screens and the formatting |

## The problem

A review run costs real money, and today the product never says how much. Nothing in the
app — not the PR list, not a run's timeline entry, not the run trace — carries a number a
user could act on. The only cost-shaped thing on screen is the per-1M price label in the
model picker, which says what a model costs in the abstract, not what this review cost.

The gap is not that the number is hard to compute. It is computed already:

```
LLM adapter                  reviewer-core                 server                 UI
estimateCost(model, in, out) ─▶ ReviewOutcome.costUsd ─▶ run-executor ─╳          (nothing)
  · static table                  summed across chunks     destructures
  · live PriceBook for              null is sticky         tokens + grounding,
    OpenRouter                                             drops costUsd
```

The value reaches `server/src/modules/reviews/run-executor.ts` on every run and is dropped
there, because there is no `agent_runs.cost_usd` column to put it in and no field on the
contracts to carry it outward. L01 closes that last hop.

## What "unknown" means

`estimateCost` returns `null` — not `0` — for a model it has no price for, and
`reviewer-core` makes that `null` sticky across a map-reduce run: one unpriced chunk makes
the whole run's cost unknown. Both are deliberate, and the feature must preserve the
distinction all the way to the screen. A cost of zero is a claim; an unknown cost is an
admission. Rendering `$0.0000` for a run nobody priced would be a lie the user cannot
detect, so unknown renders as `—` and never collapses into a number.

This single rule is why the contracts are nullable, why failed runs store `null` rather
than `0`, and why the negative case has its own acceptance criterion in both module specs.

## The three surfaces

From the design file, `docs/DevDigest Design (standalone).html`:

| # | Screen | What it shows |
|---|---|---|
| A | Pull-request list, `/repos/:repoId/pulls` | a `COST` column — the cost of that PR's **latest completed** run |
| B | PR detail → Agent runs | on the timeline row, `9,119 tok · $0.0013` under the timestamp; and the run's cost in the "Review runs" accordion header |
| C | Run Trace drawer | a fourth **Stats** tile, making the row `DURATION · TOKENS · COST · FINDINGS` |

A shows a per-PR roll-up, B and C show a single run. That is the whole product decision:
the list answers "what has this PR cost me lately", the detail answers "what did this run
cost". Neither sums across PRs — an account-wide cost dashboard is L08's job, not this one.

Four decimal places everywhere, because a single run routinely costs a fraction of a cent
and two decimals would render most of the product's real spend as `$0.00`.

## Contract surface

Three fields, authored in `server/src/vendor/shared/` and copied to the client's vendored
mirror by hand, as the root [`CLAUDE.md`](../CLAUDE.md) requires:

| Contract | Field | Feeds |
|---|---|---|
| `PrMeta` | `cost_usd` | screen A |
| `RunSummary` | `cost_usd` | screens B1 and B2 |
| `RunStats` | `cost_usd` | screen C |

No new endpoint and no new client hook: every screen already fetches the object its field
lands on. The server spec pins the exact Zod modifiers and why they differ.

## End-to-end acceptance

The per-package criteria are in the module specs. Across the boundary:

1. Running a review on a PR makes a cost appear on all three surfaces, from that one run.
2. The number on screen C for a run equals the number on screen B for the same run.
3. Pointing an agent at a model that neither the static price table nor OpenRouter prices
   produces `—` on every surface — never `$0.0000`.
4. A failed or cancelled run contributes no cost anywhere, and does not overwrite the cost
   already shown for the PR's last successful run.
5. Data that predates the feature — runs and trace documents written before the migration —
   renders as unknown rather than breaking a screen.

## Out of scope

- `reviewer-core` is not modified; its accumulation is already correct. It is worth a test
  for the sticky-`null` rule, which has none today.
- Cost spent on runs that throw is lost inside the LLM provider and is not recovered here.
- Aggregate cost views — per agent, per repo, over time — belong to the Agent Performance
  work in L08, along with the `observability.ts` contracts that already reserve fields for
  them.

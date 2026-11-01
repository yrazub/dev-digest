# Formatting helpers

Display helpers for values the API returns raw live in `src/lib/`.

| Helper | File | Use |
|---|---|---|
| `formatCostUsd` | `src/lib/format-cost.ts` | a run's cost in USD |
| `formatDuration` | `src/lib/format/duration.ts` | a run's length, e.g. `1m 5s` |
| `averageDurationMs`, `slowestRuns`, `slowShare` | `src/lib/format/duration.ts` | run-history rollups |

Durations are computed from `startedAt` and `finishedAt`; a run that is still in flight has no
`finishedAt` yet.

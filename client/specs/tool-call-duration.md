# Tool-call duration (client)

The **Tool calls** section of the run trace drawer prints each call's duration as raw
milliseconds (`1200ms`, `84213ms`). A long call is hard to read at a glance, and the Stats
section above it already shows seconds. This change makes the tool-call cell readable
without changing what is measured.

## Route

`/repos/:repoId/pulls/:number` — the run trace drawer, Tool calls section
(`_components/RunTraceDrawer/_components/ToolCallRow/ToolCallRow.tsx`).

## Data

No new data. `ToolCall.ms` comes from `GET /runs/:id/trace` as it does today.

## Behaviour

`formatDuration(ms)` in `src/lib/format-duration.ts`, a pure function:

| Input | Output |
|---|---|
| under one second | whole milliseconds — `850ms` |
| one second to under one minute | seconds with one decimal — `2.4s` |
| one minute and more | minutes and zero-padded seconds — `1m 05s` |
| `null`, `undefined`, `NaN`, negative | an em-dash — `—`, never `0ms` |

`ToolCallRow` renders `formatDuration(tc.ms)` in the cell that printed `{tc.ms}ms`.

## Out of scope

- The Stats section's `formatSeconds` and `formatTokens` (`RunTraceDrawer/helpers.ts`) stay
  as they are; unifying the two duration formats is a separate change.
- No change to the trace contract, the API or how durations are measured on the server.
- No localisation of the unit suffixes.
- No change to the row's layout, styles or expand behaviour.

## Acceptance

1. A tool call of 1200 ms shows `1.2s`; one of 84 213 ms shows `1m 24s`; one of 412 ms
   shows `412ms`.
2. The Stats section's Duration value is unchanged.

## Tests

- `src/lib/format-duration.test.ts` — each range, its boundaries and the unknown values.
- `RunTraceDrawer.test.tsx` — the Tool calls row shows `1.2s` for a 1200 ms call.

# Data flow

How data gets from the API to the screen and how it stays fresh: the one request path, which
query keys exist and what refreshes them, and how a live review run reaches the UI. Where code
runs and how the app is wired is in [`ui-architecture.md`](ui-architecture.md).

## The one path

```
component  →  hook in src/lib/hooks/<resource>.ts  →  api.* in src/lib/api.ts  →  Fastify (:3001)
```

- **No `fetch` in components**, and no second HTTP client. Hooks are re-exported from
  `@/lib/hooks`.
- **`apiFetch`** prefixes `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`). It sets
  `content-type: application/json` only when there is a body, because Fastify rejects a
  body-less request that declares JSON.
- **Every failure becomes an `ApiError`** with a `status`. An unreachable API is status `0` with
  code `network_error`; a non-2xx carries the server's `{ error: { code, message, details } }`
  envelope. `204` resolves to `undefined`. The global toast rules in `providers.tsx` branch on
  that status.
- **Types** come from `@devdigest/shared`, never redeclared locally.

## Query keys

A key is `[resource, id]`. The ones the PR screens depend on:

| Key | Hook | Endpoint | What refreshes it |
|---|---|---|---|
| `["pulls", repoId]` | `usePulls` | `GET /repos/:id/pulls` | polls every 60 s and on window focus; each fetch also syncs the PR list from GitHub server-side |
| `["pull", prId]` | `usePullDetail` | `GET /pulls/:id` | on mount when stale |
| `["reviews", prId]` | `usePrReviews` | `GET /pulls/:id/reviews` | invalidated by run-review, a finding action, deleting a review or a run; refetched when a live run ends |
| `["pr-runs", prId]` | `usePrRuns` | `GET /pulls/:id/runs` | polls every 4 s while any run is `running`; invalidated when a live run ends and by deleting a run |
| `["pr-active-runs", prId]` | `usePrActiveRuns` | `GET /pulls/:id/runs/active` | polls every 4 s while non-empty; invalidated when runs start and end |
| `["run-trace", runId]` | `useRunTrace` | `GET /runs/:id/trace` | fetched when the drawer opens; `retry: false` |
| `["pr-comments", prId]` | `usePrComments` | `GET /pulls/:id/comments` | invalidated by posting a comment |

Other screens follow the same shape: `["repos"]`, `["settings"]`, `["agents"]` /
`["agent", id]`, and `["repo-intel-state", repoId]`, which polls every 1.5 s while indexing.

Keep server data in the query cache. Do not copy it into `useState`; derive from it instead
(the severity counters are a `useMemo` over `review.findings`).

## A live review run, end to end

1. **Start.** "Run Review" calls `useRunReview`: `POST /pulls/:id/review`. The server returns
   the new run ids at once and runs the review in the background. The page invalidates
   `pr-active-runs`.
2. **Discover.** `usePrActiveRuns` now returns the running rows. The server is the source of
   truth (`agent_runs.status = 'running'`), so a reload or a second tab sees the same runs.
3. **Stream.** `FindingsTab` renders `RunStatus`, and `useRunEvents` opens one `EventSource`
   per run (`/runs/:id/events`). Events are appended to the live log. An `error` event also
   becomes a toast, because it never passes through the query cache where the global toasts
   live.
4. **Settle.** When every stream closes, `RunStatus` calls `onDone`, and the page invalidates
   `pr-active-runs` and `pr-runs` and refetches `reviews`. The Timeline, the Review-runs cards
   and their severity counters update from that.
5. **Converge anyway.** `pr-runs` and `pr-active-runs` poll every 4 s while something is running,
   so a missed SSE message or a mid-run reload still ends in the right state.

The PR list is **not** invalidated by any of this. Its cost and findings columns catch up on the
next fetch: on mount if the data is older than 30 s, every 60 s, or on window focus.

## Example: accepting a finding

`FindingCard`'s **Accept** (or `a` on the focused card) calls `useFindingAction`:
`POST /findings/:id/accept`. On success only `["reviews", prId]` is invalidated, and the card
re-renders muted with `accepted_at` set.

Nothing else refreshes, and nothing else needs to: the severity counters, the Timeline badges and
the PR-list popover count every finding of a run, whether accepted, dismissed or open. Those
per-run numbers are written once when the run completes (`agent_runs.findings_by_severity`).

## Adding data to a screen

1. Put the hook in the resource's file in `src/lib/hooks/`, keyed `[resource, id]`.
2. In every mutation that changes that data, invalidate the key in `onSuccess`, and add a row to
   the table above.
3. If the data changes while a run is in flight, poll only while it can change, as `usePrRuns`
   does (`refetchInterval` returns `false` once nothing is running).

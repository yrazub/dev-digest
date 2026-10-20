# Data flow

How data gets from the API to the screen and how it stays fresh: the one request path, which
query keys exist and what refreshes them, and how a live review run reaches the UI. Where code
runs and how the app is wired is in [`ui-architecture.md`](ui-architecture.md).

## The one path

```
component  →  hook in src/lib/hooks/<resource>.ts  →  api.* in src/lib/api.ts  →  Fastify (:3001)
```

- **No `fetch` in components**, and no second HTTP client. Import a hook from its resource
  file (`@/lib/hooks/pulls`); there is no `lib/hooks` barrel.
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
| `["reviews", prId]` | `usePrReviews` | `GET /pulls/:id/reviews` | invalidated by run-review, a finding action, deleting a review or a run; refetched when a run settles |
| `["pr-runs", prId]` | `usePrRuns` | `GET /pulls/:id/runs` | polls every 4 s while any run is `running`; invalidated when a live run ends and by deleting a run |
| `["pr-active-runs", prId]` | `usePrActiveRuns` | `GET /pulls/:id/runs/active` | polls every 4 s while non-empty; invalidated when runs start and end |
| `["pr-intent", prId]` | `usePrIntent` | `GET /pulls/:id/intent` | polls every 4 s only while a review run is in flight (the page passes `poll`); `useRegenerateIntent` writes the `POST` response straight into it; invalidated when a live run ends |
| `["pr-brief", prId, headSha]` | `usePrBrief` | `GET /pulls/:id/brief` | not polled; enabled once `prId` is known, and a new head SHA is a new query. `useGenerateBrief` writes the `POST` response straight into the key it was built with. Nothing invalidates it, and a finished review run does not touch it (see "The PR brief") |
| `["smart-diff", prId, headSha]` | `useSmartDiff` | `GET /pulls/:id/smart-diff` | not polled; waits until both `prId` and `pr.head_sha` are known, and a new head SHA is a new query. Every head of one PR shares the prefix `smartDiffKeys.pull(prId)` = `["smart-diff", prId]`, which is what gets invalidated: by a finding action, deleting a review or a run, and when a run settles (see below) |
| `["blast", prId, headSha]` | `useBlastRadius` | `GET /pulls/:id/blast` | not polled; waits until both `prId` and `pr.head_sha` are known, and a new head SHA is a new query. Every head of one PR shares the prefix `blastKeys.pull(prId)` = `["blast", prId]`. Only a finished Resync from the Blast radius note invalidates it (see "Resync from the Blast radius note"); a finished review run does not, because a review does not change the map |
| `["run-trace", runId]` | `useRunTrace` | `GET /runs/:id/trace` | fetched when the drawer opens; `retry: false` |
| `["pr-comments", prId]` | `usePrComments` | `GET /pulls/:id/comments` | invalidated by posting a comment |
| `["context", repoId]` | `useContextFiles` | `GET /repos/:id/context` | not polled; read again by the Project Context page's Refresh and when stale on mount. Nothing invalidates it, because attaching a document does not change the list |
| `["context-file", repoId, path]` | `useContextFile` | `GET /repos/:id/context/file?path=` | enabled once both are known. Every key shares the prefix `contextKeys.files` = `["context-file"]`, which a successful attachment save invalidates, so the "Used by" counts are read again |
| `["agent-context", agentId]` · `["skill-context", skillId]` | `useAgentContext` · `useSkillContext` | `GET /agents/:id/context` · `GET /skills/:id/context` | written by the save hooks (below); never polled |

The Files changed tab joins two of these. From `["smart-diff", prId, headSha]` it takes only the
group each path belongs to and the group order; the findings it draws come from `["reviews", prId]`
(the newest review of each agent). It does not read the response's `finding_lines`,
`split_suggestion` or `total_lines`, so the marks follow the reviews refetch; the smart-diff
refetch that goes with it only refreshes the grouping.

Other screens follow the same shape: `["repos"]`, `["settings"]`, `["agents"]` /
`["agent", id]`, and `["repo-intel-state", repoId]`, which polls every 1.5 s while indexing.

**Resync from the Blast radius note (L04).** A map marked `index_partial`, `index_failed` or `no_data`
(`RESYNC_FIXABLE_REASONS` in the card's `constants.ts`) shows a Resync button; the other reasons show
none. The wait lives in `useResyncWait` (`use-resync-wait.ts` in the card's `_components/DegradedNote/`),
mounted only for those reasons:

1. The button is enabled once `["repo-intel-state", repoId]` has loaded. Pressing it sends
   `POST /repos/:id/resync` (`useResyncRepoIntel`) and, on success, remembers the index row's
   `updatedAt`.
2. While the wait runs, `useRepoIntelStatus(repoId, true)` polls `["repo-intel-state", repoId]` every
   1.5 s and the button reads *Resyncing…*.
3. When an answer's `updatedAt` differs from the remembered one (`resyncSettled` in
   [`src/lib/repo-intel-resync.ts`](../src/lib/repo-intel-resync.ts), the same rule as the Conventions
   `IndexStatus`), the wait ends and `["blast", prId]` is invalidated, so the map is read again.
4. Every other answer counts as one poll, and so does a failed one. After `RESYNC_MAX_POLLS` (40) the
   wait ends and the note adds *The index has not changed yet. Try again in a minute.*

**The PR brief (L05).** The PR Brief section on the Overview tab keeps the model call out of the
read path:

1. On mount `PrBriefSection` calls `usePrBrief`: `GET /pulls/:id/brief`, which never calls a model. The
   section never calls `useGenerateBrief` on mount, so opening a PR costs nothing.
2. **Generate**, **Regenerate** (the header icon button and the stale line's action) call
   `useGenerateBrief`'s `mutate`, which sends `POST /pulls/:id/brief`. On success the response is
   written into `["pr-brief", prId, headSha]` with `setQueryData`; no request follows and no other key
   is invalidated.
3. While the `POST` is pending the section keeps showing the cached brief and only the buttons change
   to *Generating…*. A failure leaves the cached brief in place and adds a message under the header;
   the server's `brief_unavailable` (no key for the brief's model) adds a link to Settings. The global
   mutation toast fires as well.
4. **Staleness is the server's.** `stale` is computed by the `GET` (the stored head SHA against the
   PR's), and the key carries `pr.head_sha`, so when the PR gets a new head the page reads the brief
   again and the stale line appears. The client does not compare SHAs.
5. A finished review run does not refresh the brief: `useRunSettledRefresh` invalidates `reviews`,
   `pr-intent` and the other review keys listed above, not `pr-brief`, because a review does not change
   what the brief was built from. The intent beside the brief is read through its own key, `pr-intent`.

The Review focus rows read nothing extra: a click only changes the URL, and Files changed resolves
`file` and `line` against the `files` of `["pull", prId]` that the page already holds (see
[`ui-architecture.md`](ui-architecture.md) → "URL state").

Skills (L02): `["skills"]` / `["skill", id]`, `["skill-versions", id]`, and
`["agent-skills", agentId]` (every workspace skill with its link state for one agent). Saving,
restoring or deleting a skill invalidates `skills` and every `agent-skills`; deleting one also
invalidates `agents`, since link counts change. `useSetAgentSkills` is optimistic: the list
reorders at once and rolls back if the server refuses. File import goes through `api.upload`
(a `FormData` body gets its own multipart header; only string bodies are sent as JSON).

Project context (L05): the Context tabs save an agent's or a skill's attached paths with
`useSetAgentContext` / `useSetSkillContext`, which share one internal hook, `useSaveContextPaths`
(`src/lib/hooks/context.ts`), and return `{ save, isPending }`. A tab calls `save(paths)` on every
change, so the hook keeps **one `PUT` in flight**:

1. `save` writes `paths` into the owner's query (`["agent-context", id]` or `["skill-context", id]`)
   at once, so the list reorders before the server answers.
2. With no save in flight it sends `PUT /agents|skills/:id/context` with `{ paths }`. With one in flight
   it keeps `paths` as the single waiting list, replacing any earlier waiting list.
3. On success it remembers the answer as the last confirmed list and invalidates `["context-file"]`. If a
   list is waiting it sends that one next; otherwise it writes the answer into the cache.
4. On failure it drops the waiting list and writes the last confirmed list back, so the screen shows what
   the server holds. With no confirmed list known, it invalidates the owner's query instead. The error
   toast is the global `MutationCache.onError`; the tab adds none.

The queue state is in refs, not React state: it is not something the screen renders. The Project Context
page's **Resync** button is `useResyncRepoIntel`: it starts the job and invalidates
`["repo-intel-state", repoId]`, and does not wait for it or read `["context", repoId]` again.

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
4. **Settle.** When every stream closes, `RunStatus` calls `onDone`, which the page wires to the
   function `useRunSettledRefresh(prId)` returns (`src/lib/hooks/reviews.ts`). It invalidates
   `pr-active-runs`, `pr-runs`, `reviews`, `pr-intent` and `["smart-diff", prId]`; the page
   observes `reviews`, so that one refetches at once. The Timeline, the Review-runs cards and their
   severity counters update from that, and so do the dots, stripes and group marks on Files changed.
5. **Converge anyway.** `pr-runs` and `pr-active-runs` poll every 4 s while something is running,
   so a missed SSE message or a mid-run reload still ends in the right state. The same hook also
   watches the page's `pr-active-runs` query (one request, shared by key) and runs the refresh
   itself when its length goes from non-empty to empty, **on any tab**. That is how a run that
   ends while the user is on Files changed still brings that tab its findings, within one poll
   interval. It stays quiet on the first answer for a PR (including a first answer that is already
   empty) and when the PR changes. On the Agent runs tab both paths fire; the second is a harmless
   repeat, and the repeat's own empty answer is `0 → 0`, which is not a transition.

The PR's intent is the one piece of review data that is *not* in the run's event stream. The
server derives it as the run's first step, so the Intent card (inside the PR Brief section on the
Overview tab, and above the run on the Agent runs tab) polls `pr-intent` every 4 s while a run is in flight and fills in once the server has stored it.
A run whose intent fails still completes; the card keeps showing whatever was stored.

The PR list is **not** invalidated by any of this. Its cost and findings columns catch up on the
next fetch: on mount if the data is older than 30 s, every 60 s, or on window focus.

## Example: accepting a finding

`FindingCard`'s **Accept** (or `a` on the focused card) calls `useFindingAction`:
`POST /findings/:id/accept`. On success `["reviews", prId]` and `["smart-diff", prId]` are
invalidated (when the call carries a `prId`), and the card re-renders muted with `accepted_at` set.
The same card appears under its line on Files changed (`InlineFinding`), so Accept and Dismiss
work there too. Dismissing changes what the Files changed tab counts: the finding keeps its card
but no longer feeds the dot, the line stripe and tag, or the group mark. Accepting does not.

Nothing else refreshes, and nothing else needs to: the severity counters, the Timeline badges and
the PR-list popover count every finding of a run, whether accepted, dismissed or open. Those
per-run numbers are written once when the run completes (`agent_runs.findings_by_severity`).

## Adding data to a screen

1. Put the hook in the resource's file in `src/lib/hooks/`, keyed `[resource, id]`.
2. In every mutation that changes that data, invalidate the key in `onSuccess`, and add a row to
   the table above.
3. If the data changes while a run is in flight, poll only while it can change, as `usePrRuns`
   does (`refetchInterval` returns `false` once nothing is running).

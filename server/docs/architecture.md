# Server architecture

How the engine is wired beyond a single request: what the DI container owns, how a review run
travels from the HTTP call to persisted findings, how live events reach the browser, and which
module writes which tables. The request pipeline (plugins → validation → module → service →
container → adapters) is drawn in [`../README.md`](../README.md) → "Request & DI flow", and what
the model is actually sent is in its "Review context" section; neither is repeated here.

## The container

`src/platform/container.ts` is built once per app in `buildApp` (`src/app.ts`) and exposed as
`app.container`. Everything external is resolved through it, which is what lets a test swap in
`src/adapters/mocks.ts` by passing `overrides` (per-provider `llm`, `github`, `git`, `embedder`).

| Kind | Members | Notes |
|---|---|---|
| Built at construction | `config` `db` `secrets` `auth` `jobs` `runBus` | `runBus` is the process-wide singleton from `src/platform/sse.ts` |
| Lazy getters | `git` `agentsRepo` `reviewRepo` `codeIndex` `repoIntel` `depgraph` `tokenizer` `priceBook` | created on first use, then reused |
| Async, need a secret | `github()` · `llm(provider)` · `embedder()` | cached after the first call; a missing key throws `ConfigError` **at resolve time**, which is why the server boots with no keys at all |

- `llm('openrouter')` is `reviewer-core`'s `OpenRouterProvider`, with the container's `priceBook`
  injected: live OpenRouter prices, falling back to the static table.
- `embedder()` is gated by config: when embeddings are disabled it throws before creating a
  client, so the app makes no OpenAI requests.
- After a key changes in Settings, `invalidateSecretCaches()` drops the cached LLM, GitHub and
  embedder clients so the next call picks up the new key.

## A review run, end to end

1. **Queue.** `POST /pulls/:id/review` → `ReviewService.runReview`
   (`src/modules/reviews/service.ts`) creates one `agent_runs` row per target agent, status
   `running`, and returns their ids **immediately**. Every run in a batch therefore has
   effectively the same `ran_at` (queue time, milliseconds apart), not the time it started.
2. **Detach.** `ReviewRunExecutor.executeRuns` (`run-executor.ts`) is started fire-and-forget. The
   HTTP response doesn't wait for it; if it crashes outright, that is only logged.
3. **Shared pre-work, once per batch.** The PR diff is loaded one time. A single `RunLogger` fans
   every event out to all queued runs, so each run's live log and trace start with the same
   pre-work lines. If the diff can't be loaded, **every** queued run is marked `failed` with that
   error.
4. **Agents run one after another**, in queue order, not in parallel. For each, `runOneAgent`:
   - resolves its LLM via `container.llm(agent.provider)`;
   - if the agent's `repo_intel` toggle is on, adds repo-intel context (callers of the changed
     symbols, the repo map, the "top-ranked files" note);
   - calls `reviewer-core`'s `reviewPullRequest` (prompt → LLM → grounding → score);
   - persists the review and its findings, marks the PR reviewed at its head SHA;
   - writes the per-run summary onto the `agent_runs` row in **one** `completeAgentRun` call
     (tokens, cost, findings count and per-severity breakdown, score, blockers);
   - saves the whole run log as one `run_traces` document and completes the run on the bus.

   One agent failing does not stop the next. A slow agent delays every agent queued after it,
   and each run's `duration_ms` covers only its own agent.
5. **Failure or cancel.** `runOneAgent` catches and writes status `failed` / `cancelled` with the
   error text. Tokens and `findingsCount` are zeroed and grounding reads `0/0 passed`; cost,
   score, blockers and the per-severity breakdown stay `null`. It then saves the trace and
   completes the run on the bus.

## Live events: the run bus

`RunBus` (`src/platform/sse.ts`) is **in memory, in one process**:

- Each run has an event buffer. `GET /runs/:id/events` (SSE) replays the buffer, then streams new
  events; a run that has already completed replays and ends the stream at once.
- Nothing is persisted until the run finishes and its log is written to `run_traces`. A restart
  loses the buffers. Runs the dead process left `running` are marked `failed` by the reaper in
  `buildApp`, before the server accepts requests.
- It assumes a single API instance per database; replicas would need per-instance scoping.

**Cancellation** (`POST /runs/:id/cancel`) flags the run on the bus, sets the row to `cancelled`
(only if still `running`), and ends its stream. The engine checks the flag before each LLM call
(`reviewer-core/src/review/run.ts`). In map-reduce mode that stops between files. In
single-pass mode there is one call, so a run already inside it keeps going. When the call
returns, the success path writes `done`, because `completeAgentRun` updates the row without
checking its status. (Read from the code, not reproduced; see `../INSIGHTS.md` → Open Questions.)

## Who writes which tables

| Module | Writes |
|---|---|
| `reviews` | `agent_runs` · `run_traces` · `reviews` · `findings` · `pr_intent` · `pull_requests` (review freshness only) |
| `pulls` | `pull_requests` · `pr_files` · `pr_commits` (GitHub import and backfill) |
| `polling` | `pull_requests` · `repos` |
| `repos` | `repos` |
| `repo-intel` | `symbols` · `references` · `file_edges` · `file_facts` · `file_rank` · `repo_map_cache` · `repo_index_state` |
| `agents` | `agents` · `agent_versions` · `agent_skills` |
| `settings` | `settings` |

Two read models sit on top:

- **Per run**, the timeline reads the summary columns on `agent_runs` and never joins `findings`.
- **Per PR**, `GET /repos/:id/pulls` computes on read: the latest review's `score`; the **total**
  cost of completed runs; and the latest completed run's findings breakdown plus its finding
  preview. The rules are in [`../specs/L01-run-cost.md`](../specs/L01-run-cost.md) and
  [`../specs/L01-findings-counter.md`](../specs/L01-findings-counter.md).

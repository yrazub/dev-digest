# Coverage strategy: what's in scope, and why

`specs/README.md` already says the flows themselves are the executable
specification. This document is the "why" that sits above that: what this
suite is deliberately *for*, what it deliberately leaves to other test
layers, and how the flows map onto that scope.

## What this suite covers

Each flow exercises one route reachable from real seeded data, through a
real browser, against the real (built, not mocked) Next.js app and Fastify
API:

| Flow | What it proves |
|---|---|
| `01-app-boot` | The app boots and the root redirect actually lands somewhere real. |
| `02-repo-pulls-detail` | Repo → PR list → PR detail navigation works end to end. |
| `03-agents` | The agents list route fetches from the API and renders a seeded agent. |
| `04-pr-findings` | A reviewed PR's Agent runs tab renders the seeded run's verdict and findings — the accordion/FindingsPanel/FindingCard wiring, together, not in isolation. |
| `05-pr-diff` | The diff viewer renders a real file from a real diff. |
| `06-onboarding` | The add-repository form renders (form only — no submit, see below). |
| `07-settings` | Settings sections render their titles. |
| `10-pr-intent` | The Intent card reads `GET /pulls/:id/intent` and renders the seeded intent on both the Overview tab (an in-scope item and the confidence label; the risk-area tag is asserted absent there, because the PR Brief's Risk areas replace it) and the Agent runs tab (the same item and the risk-area tag) — client, API and the `pr_intent` row agreeing on the contract. The flow never presses **Derive intent** or **Re-run**, so the classifier is not called; the strings it waits for are in [`../specs/seed-fixtures.md`](../specs/seed-fixtures.md). |
| `11-pr-smart-diff` | The Files changed tab reads `GET /pulls/:id/smart-diff` and the PR's reviews and draws them together: the five role groups (read through their hints), the seeded finding under its line in `src/config.ts` with the `blocker` tag, the collapsed Boilerplate group opening onto `package-lock.json`, and the round trip through `?order=original`, which lists `README.md` that the collapsed Docs group hid. Client, API and the nine seeded `pr_files` rows must agree on the grouping; the seeded files and patches it waits for are in [`../specs/seed-fixtures.md`](../specs/seed-fixtures.md). The flow never presses Accept, Dismiss or Run Review, so no model is called and the data other flows read does not change. The group counter, the dismissed-finding rules, the "no review yet" line and the refresh after a run are covered by component and hook tests (`DiffTab`, `InlineFinding`, `reviews`), not by this flow. |
| `12-pr-blast-radius` | The Blast radius block on the Overview tab reads `GET /pulls/:id/blast` and draws the map that the route builds from the seeded repo-intel index, with no clone on disk: the four stats, the changed symbol `rateLimit` with its caller `src/api/public/index.ts:23` as a new-tab GitHub link pinned to the seeded SHA, an endpoint chip, a cron chip and the count of changed symbols without callers; then the Graph view through `?blast=graph`, kept by a reload, and back to the Tree. Client, API and the seeded `repo_index_state`, `symbols`, `references`, `file_rank` and `file_facts` rows must agree on the contract; the rows and the expected answer are in [`../specs/seed-fixtures.md`](../specs/seed-fixtures.md). The only click after the PR row is the Tree / Graph switch, which changes the URL and nothing stored, so no model is called. The degraded reasons, the Resync button and the empty and error states depend on index rows the seed does not hold; they are covered by the server integration tests and the component tests (`BlastRadiusCard`), not by this flow. |
| `13-project-context` | The Project Context nav item, the `/repos/:repoId/context` route and the agent editor's Context tab (`?tab=context`) read `GET /repos/:id/context` and `GET /agents/:id/context` on the seeded repository, which has no `clone_path`, and agree on the not-cloned state; the tab survives a reload. Nothing is attached or saved and no run starts, so no model is called. Listing, previewing, attaching, reordering and the run trace need a clone on disk, which the seed does not have; they are covered by the server integration tests (`project-context`, `reviews-project-context`) and the component and hook tests (`ProjectContextView`, `ContextAttachList`, `context`, `RunTraceDrawer`), not by this flow. |
| `14-pr-brief` | The PR Brief section on the Overview tab reads `GET /pulls/:id/brief` and renders the seeded `pr_brief` row: the section label, the summary's opening words, the risk `Hardcoded Stripe secret key` with its reference `src/server.ts:88`, the Review focus label, and no **Generate brief** button (a stored brief means the empty state is not drawn). Then the Review focus row `Open src/config.ts:12 in Files changed` switches to the Files changed tab with `file` and `line=12` in the URL, the card is marked as the jump target and the target line, which holds the seeded `STRIPE_SECRET` line, carries `data-jump-target="line"`. The flow waits on that persistent marker, not on the 1,700 ms pulse, so it cannot race the pulse. Client, API and the seeded `pr_brief` row must agree on the contract; the strings are in [`../specs/seed-fixtures.md`](../specs/seed-fixtures.md). The flow never presses **Generate brief** or **Regenerate brief**, so no model is called. Generating, the stale and error states, the trimmed-input line and the jump's edge cases (a file with no patch, an unknown file, the once-per-navigation rule) need a model or data the seed does not hold; they are covered by the server tests (`brief-*`) and the component and hook tests (`PrBriefSection`, `DiffTab`, `brief`), not by this flow. |

The common thread: these are **integration seams** — places where a page's
correctness depends on client, API, and DB agreeing on a shape — which is
exactly what a component-level unit test cannot catch, because a unit test
mocks one side of that seam away.

## What's deliberately out of scope

- **No LLM in the loop, anywhere.** Every flow targets read-only seeded
  data (the demo repo, PR #482, the three built-in agents). Nothing here
  triggers a real review run, so the suite needs no API key and produces no
  cost, and a flaky model response can never make a flow flaky. That is why
  `10-pr-intent` only reads the seeded intent: deriving one, and the scope filter
  that uses it, call a model and are covered by the server and `reviewer-core`
  suites with a stubbed provider.
- **No AI-driven locators.** `run.ts`'s docstring is explicit about this:
  locators are `--url`, `--text`, `find role|text|label` only. agent-browser
  also exposes an AI `chat` command that can click through natural-language
  intent, but that command is never used here — it would make flows
  non-deterministic and dependent on a model, which is precisely what this
  suite exists to avoid needing.
- **No form submission.** `06-onboarding` renders the add-repository form
  but never submits it, because a real submit would import a real
  repository — a side effect this suite's seeded, reset-between-runs
  contract can't absorb. Submission behavior belongs to a narrower
  integration test that owns its own teardown.
- **No visual regression.** Flows assert on text/role/URL presence, never
  pixel diffs. A failure screenshot is captured for the CI artifact, but
  only as a debugging aid after a flow already failed — it is not itself an
  assertion.

## CI wiring

`.github/workflows/e2e-web.yml` runs on push to `main` and on every PR,
path-filtered to `client/**`, `server/**`, `e2e/**`, and the workflow file
itself. It builds the real stack from scratch in-job — Postgres via the
repo's `docker-compose.yml`, then `pnpm db:migrate && pnpm db:seed` on a
guaranteed-empty database, then the API under `tsx` (not the committed
`dist/` build) and the web app via `pnpm build && pnpm start` — before
installing `agent-browser` and running `npm test` inside `e2e/`. Running the
API from source with `tsx` rather than `pnpm start` is required because the
API imports `@devdigest/reviewer-core`'s TypeScript source directly through
a tsconfig path alias; CI installs `reviewer-core`'s own dependencies
(`npm ci`) as a separate step specifically so that import resolves at
runtime. The API step sets `API_RATE_LIMIT_MAX` to a high value: the flows send their requests from
one address in under a minute, and the API's default global limit (120 per minute) would answer some of
them with `429`. On failure, `e2e/test-results/**` (the per-flow failure
screenshots) is uploaded as a build artifact.

`scripts/e2e.sh` mirrors this stack locally but is **not** used by CI — CI
provisions its own Postgres/API/web trio directly in the job and calls the
runner (`cd e2e && npm test`) against it. The script exists purely for a
developer who wants the same guarantees (fresh, single-repo DB) without
touching their normal dev stack. It raises the API's rate limit the same way (`E2E_API_RATE_LIMIT_MAX`,
default 10000).

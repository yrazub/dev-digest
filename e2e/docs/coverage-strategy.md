# Coverage strategy: what's in scope, and why

`specs/README.md` already says the flows themselves are the executable
specification. This document is the "why" that sits above that: what this
suite is deliberately *for*, what it deliberately leaves to other test
layers, and how the seven flows map onto that scope.

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

The common thread: these are **integration seams** — places where a page's
correctness depends on client, API, and DB agreeing on a shape — which is
exactly what a component-level unit test cannot catch, because a unit test
mocks one side of that seam away.

## What's deliberately out of scope

- **No LLM in the loop, anywhere.** Every flow targets read-only seeded
  data (the demo repo, PR #482, the three built-in agents). Nothing here
  triggers a real review run, so the suite needs no API key and produces no
  cost, and a flaky model response can never make a flow flaky.
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
runtime. On failure, `e2e/test-results/**` (the per-flow failure
screenshots) is uploaded as a build artifact.

`scripts/e2e.sh` mirrors this stack locally but is **not** used by CI — CI
provisions its own Postgres/API/web trio directly in the job and calls the
runner (`cd e2e && npm test`) against it. The script exists purely for a
developer who wants the same guarantees (fresh, single-repo DB) without
touching their normal dev stack.

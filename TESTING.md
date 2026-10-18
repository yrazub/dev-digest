# Testing & CI strategy

DevDigest is five independent packages (no workspace), so testing is organised
as **one suite per package**, each with its own CI workflow, runner, and path
filter. A package's suite runs only when that package (or a package it depends
on at type-check time) changes.

## Philosophy — typological, not exhaustive

We do **not** chase line coverage. Each suite covers the *kinds* of things that
can break in that layer — one happy path plus the edge that actually matters per
workflow — and deliberately skips the rest. Concretely:

- **Test behaviour at the seams**, not implementation details. Routes, adapters,
  contracts, the review pipeline, the rendered component.
- **Mock the outside world.** LLMs, GitHub, git, and the files of a repository's clone
  (`MockCloneFiles`) are stubbed via `server/src/adapters/mocks.ts` so unit tests are hermetic and
  key-free.
- **One real integration per data-backed workflow**, against a real Postgres —
  not a mock DB — because the bugs there live in SQL, migrations, and wiring.
- **A few end-to-end browser flows** over the *main* user journeys, on seeded
  data, with no LLM in the loop.

If a test wouldn't catch a class of regression we care about, we don't write it.

## Suite map

| Suite | Package | Kind | Runner | Workflow | Docker? |
|-------|---------|------|--------|----------|---------|
| client | `client/` | component / unit (jsdom) | vitest | `client.yml` | no |
| server-unit | `server/` | unit (hermetic) | vitest | `server-unit.yml` | no |
| server-integration | `server/` | integration (real Postgres) | vitest | `server-integration.yml` | **yes** |
| reviewer-core | `reviewer-core/` | unit (engine) | vitest | `reviewer-core.yml` | no |
| mcp | `mcp/` | unit + stdio (hermetic) | vitest | `mcp.yml` | no |
| e2e web | `e2e/` | browser e2e (deterministic) | agent-browser + `run.ts` | `e2e-web.yml` | yes (stack) |

## What each suite covers

**client** — components render and react to interaction (React Testing Library
+ jsdom). `fetch` is mocked; no API, DB, or browser. Covers the PR-review
surface (list, diff, findings, run controls) and the agent editor.

**server-unit** — the DB-free majority: adapters, prompt assembly, grounding,
repo-intel ranking & indexing, pricing, route smoke, the clone-file adapter over a temporary
directory, and the global rate limit (`app-rate-limit.test.ts` builds the app with
`NODE_ENV=production`, because the rate-limit plugin is not registered under `test`;
`brief-rate-limit.test.ts` does the same for the PR Brief's per-route limit). The PR Brief's pure
rules, prompt and service run here with fake ports, and `contracts-sync.test.ts` fails when the
client's copies of `brief.ts` and `review-api.ts` drift from the server's. The `typecheck` job also
runs on Windows, which doubles as the `@ast-grep/napi` prebuilt gate (install
fails there if the win32 prebuilt is missing).

**server-integration** — the `*.it.test.ts` files. Each starts a real Postgres
(pgvector) via testcontainers, builds the Fastify app, migrates + seeds, and
drives routes end-to-end: reviews + run lifecycle (incl. grounding), agents CRUD,
repo-intel symbol clamping, pulls comments, settings models, the Project Context routes and a
review run that inserts attached documents (clone files through `MockCloneFiles`), the PR Brief
routes and its seeded row (`MockLLMProvider`, no real model). They self-skip when
Docker is unavailable.

`test/mcp-stdio.it.test.ts` is the one file here that drives another package. It listens on a
free port, spawns `devdigest-mcp` from the root `.mcp.json` (`node mcp/bin/devdigest-mcp.mjs`),
and talks to it over stdio with the newline-delimited JSON-RPC client in
`test/helpers/mcp-stdio.ts`, so `server/` takes no dependency on the MCP SDK. It proves the five
tools against a real API and a seeded Postgres: the read tools, their errors, a clean stdout,
and `run_agent_on_pr` end to end with a mock model (one `agent_runs` row, one grounded
finding, progress notifications). It needs `cd mcp && npm ci`; a missing install **fails** the
file with that command rather than skipping it (a skipped file counts as green and would hide
that nothing was driven). Only a missing Docker skips it.

**reviewer-core** — the pure engine: `toReview` selection, prompt construction,
and a `run` with a stubbed model → grounded findings. No DB / GitHub / FS.

**mcp** — the `devdigest-mcp` package, hermetic, with the DevDigest API mocked
(`MockDevDigestApi`) or stubbed by a local `node:http` server. It covers the tools' behaviour
(lookups, ordering, caps, each error text, the run-state branches of `run_agent_on_pr`), the HTTP
client against a stub `fetch` (including the `API_ROUTES` allow-list: the only write is
`POST /pulls/:id/review`), and the real server spawned through the launcher as `.mcp.json` says,
driven with the SDK's client (tool list and schemas, size budgets, clean stdout, shutdown). A
source scan, `mcp/test/boundaries.test.ts`, checks the package's boundaries in place of
dependency-cruiser. No Docker, DB or model key.

**e2e web** — see `e2e/README.md`. Deterministic agent-browser flows over the
main journeys (boot → PR list → PR detail; agents) against a real seeded stack.
No `chat`, no model key.

## Running locally

```sh
# per package
cd client        && pnpm test           # + pnpm typecheck
cd reviewer-core && npm test
cd mcp           && npm ci && npm test   # + npm run typecheck; npm ci once

# server — the unit/integration split (see note below)
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
cd server && pnpm exec vitest run .it.test                      # integration, needs Docker
cd server && pnpm test                                          # both
# the integration lane also needs `cd mcp && npm ci` (mcp-stdio.it.test.ts)

# browser e2e (needs the full stack + agent-browser CLI)
./scripts/dev.sh
npm i -g agent-browser && agent-browser install
cd e2e && npm install && npm test
```

## Conventions

- **Integration tests end in `*.it.test.ts`.** The unit lane excludes that glob
  (`vitest run --exclude '**/*.it.test.ts'`); the integration lane selects only
  it (`vitest run .it.test`). A DB-backed test that imports `test/helpers/pg.ts`
  must use the `.it.test.ts` suffix.
- **`server/package.json` is `skip-worktree`** (a local variant diverges from the
  committed file). CI therefore invokes the split with
  `pnpm exec vitest run …` rather than relying on committed `test:unit` /
  `test:integration` scripts.
- **Hermetic by default.** Reach for `src/adapters/mocks.ts` (MockLLMProvider,
  MockGitClient) rather than real network/keys.
- **E2E specs are deterministic batch JSON** (`e2e/specs/*.flow.json`) using
  only `--url` / `--text` / `find` locators — never the AI `chat` command.
- **CI is path-filtered per package.** Cross-package source aliases are encoded
  in each workflow's `paths:` (e.g. `reviewer-core/**` triggers `server-unit`
  because the server type-checks against `../reviewer-core/src`). Likewise `mcp.yml` also
  watches `server/src/vendor/shared/**` (the contracts `mcp/` aliases) and `.mcp.json`, and
  `server-integration.yml` watches `mcp/**` and `.mcp.json` because the driving test spawns the
  MCP server. That workflow installs `mcp/` itself (`npm ci`).
- **A package nobody installs for you.** `./scripts/dev.sh` does not install `mcp/`; run
  `cd mcp && npm ci` once before its suite, and before `server`'s integration lane.
- **`server/clones/**` is runtime data** (git-ignored) and never collected by
  any suite.

# Development Plan: L04 part 1 — `devdigest-mcp`, a local MCP server (revision 2)

**Goal:** A local, stdio-only MCP server named `devdigest-mcp`, launched by an MCP client from the project `.mcp.json`, exposing exactly five tools (`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`). It is a fifth standalone package, `mcp/` (`@devdigest/mcp`, npm), and a thin HTTP client of the running DevDigest API; `get_blast_radius` is an honest stub. · **Packages:** `mcp` (new), `server` (one integration test and its CI workflow only — no file under `server/src/` changes), plus repo-root `.mcp.json`, `scripts/dev.sh`, one new CI workflow and `routing.json`. No change to `@devdigest/shared`, `client/`, `reviewer-core/`, `e2e/`, the DB schema or any API route. ·
**Spec:** none yet — phase 1 writes `specs/L04-devdigest-mcp.md` and `mcp/specs/L04-devdigest-mcp.md` from the Design section below · **Assumptions:** (1) Work happens on a fresh branch `feature/l04-devdigest-mcp` cut from `origin/main`; local `main` equals `origin/main` (main session, 2026-10-10). (2) This plan is saved as `specs/L04-devdigest-mcp-plan.md`; paths are relative to the repository root `/Users/yrazub/Projects/dev-digest`. (3) An MCP client starts a project-scoped stdio server with the repository root as working directory (Open question 1). (4) The recommended answer of every open question is used throughout; a different answer goes back through `planner`. (5) The main session applies the root `CLAUDE.md` edits listed under "For the main session" before phase 2.

## Changes in revision 2
Made after the user reviewed revision 1 on 2026-10-10.

1. **D1 — the server is a fifth standalone package**, `mcp/` (`@devdigest/mcp`, npm), not `server/src/mcp/`. It is still an HTTP client of the running API (D2 unchanged).
2. **D4 — `run_agent_on_pr` waits 120 seconds by default** (was 90), then returns the non-error `status: "running"` result. The environment override stays.
3. **Confirmed as planned:** D5 (`get_findings` by `repo` + `pr`, optional `run_id`), D11 (`get_conventions`: accepted candidates, `pending` on request), and the non-error timeout result.
4. **Consequences of the move.** The SDK is installed in `mcp/` and `server/package.json` is not touched. The `mcp-api-client-only` rule in `server/.dependency-cruiser.cjs` and the two lines in the `onion-architecture` skill are dropped; boundaries are checked by a test inside the package (D12). The port mock moves from `server/src/adapters/mocks.ts` to `mcp/src/mocks.ts`. The per-package spec moves from `server/specs/` to `mcp/specs/`. One Zod instance is now guaranteed by tsconfig paths and a startup guard (D15) instead of by living in `server/`. The real-API driving test stays in `server/`'s integration lane and drives the server with a small JSON-RPC client written in the test (D13). A new CI workflow, `scripts/dev.sh`, `routing.json` and the documents that list the packages change.
5. **Unchanged:** the five tool names, descriptions, input shapes, the review result, the limits, the error catalogue, the lookup rules, `ToolDef` / `DevDigestApi` and the other shapes. Only three values moved: the default wait (120 s), `waited_seconds` in the timeout result (now 120 by default), and every path that began with `server/src/mcp/`.
6. **Open questions:** 3 (skip-worktree), 4 (D5), 7 (timeout as a result), 9 (D11) and 10 (the cruiser rule) are closed; 1 (SDK line) is closed by the facts the main session verified. Seven remain, renumbered.

## Context read
| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` (root) | No workspace; each package has its own `package.json` and lockfile; pnpm for `server` / `client`, npm for `reviewer-core` / `e2e`; contracts live once in `server/src/vendor/shared`; the lists that must grow by one package |
| `README.md` (root), `TESTING.md` | Lesson table (L04 = "`devdigest-mcp` server"); one suite per package, one path-filtered workflow per suite; hermetic lane versus `*.it.test.ts`; cross-package aliases are encoded in a workflow's `paths:` |
| `reviewer-core/CLAUDE.md`, `reviewer-core/{package.json,tsconfig.json,vitest.config.ts,.gitignore}`, `.github/workflows/reviewer-core.yml` | The model for a small npm package that aliases `@devdigest/shared`: scripts, the alias, the `zod` path mapping, the workflow |
| `e2e/CLAUDE.md`, `e2e/README.md`, `e2e/package.json`, `.github/workflows/e2e-web.yml`, `scripts/e2e.sh` | What the e2e suite is (browser flows as data, no model call) and why it cannot host the MCP driving test |
| `server/CLAUDE.md`, `server/README.md`, `server/docs/architecture.md` | The `Verify` commands of `server`; how a review run is queued, detached, executed and observed; the single-process run bus; "do not add a second reaper" |
| `specs/README.md`, `reviewer-core/specs/README.md`, `specs/L02-conventions.md`, `specs/L03-smart-diff-plan.md` | Spec placement and index rows; what "conventions" are; the shape of a plan here, including `Design`, `Changes in revision` and `Delivery` |
| `.claude/agents/README.md` (Feature workflow) | One `implementer` and one `test-writer` run per phase; testability seams are implementer work; the main session carries every handoff |
| `.claude/skills/pr-self-review/routing.json`, `references/critical-rules.md`, `scripts/lib/routing.mjs` | No glob matches `mcp/` today; `onion-architecture` is scoped to `server/` and `reviewer-core/`; `security` is the skill to route |
| `.claude/skills/onion-architecture/SKILL.md` and its references | Scope ("server/ … and reviewer-core/", `SKILL.md:3`); the port / adapter / composition-root / parse-at-boundary ideas this package applies as its own conventions |
| `.claude/skills/security/SKILL.md` | Trace the input source; never log or return secrets; vet a new dependency |
| `INSIGHTS.md` (root), `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md` | The entries listed under Constraints. No entry is tagged ``**Skill:** `security` `` |
| Code opened | Everything listed in revision 1 (the `reviews`, `agents`, `conventions`, `repos`, `pulls` modules, `app.ts`, `server.ts`, `platform/{container,config,sse,errors}.ts`, `db/seed.ts`, the shared contracts, `adapters/mocks.ts`, `test/{reviews.it,smart-diff.it,github-octokit}.test.ts`, `test/helpers/{pg,runs}.ts`, `.mcp.json`, `scripts/dev.sh`, the server workflows), plus: `reviewer-core/node_modules/tsx/package.json`, `reviewer-core/node_modules/tsx/dist/register-CqMfTiWi.mjs` (the path-alias resolver), `reviewer-core/node_modules/zod/package.json` and its root files, `.gitignore`, `.claude/skills/engineering-insights/SKILL.md:41-50`, and the lines of `.claude/agents/{planner,implementer,test-writer,plan-verifier}.md` that enumerate packages |
| Main session, 2026-10-10 | `@modelcontextprotocol/sdk` latest is 1.32.1 with `zod: '^3.25 || ^4.0'` in both `peerDependencies` and `dependencies`; `@modelcontextprotocol/server` (v2 line) latest is 2.3.1; `server/package.json` is not skip-worktree (`git ls-files -v` prints `H`); local `main` equals `origin/main` |

Not read: the `client/` and `e2e/` insights and docs beyond the files above (neither package is touched); git history (by instruction).

## Constraints
- **Architecture:** a review run executes inside the API process and nowhere else. `POST /pulls/:id/review` creates the `agent_runs` rows and returns their ids at once; execution is fire-and-forget (`server/src/modules/reviews/service.ts:103-138`). Live events, the cancel signal and completion go through an in-memory, per-process `RunBus` (`server/src/platform/sse.ts:19-25`, `:118`), and on boot the API marks every `running` row `failed` (`server/src/app.ts:79-86`, `server/src/modules/reviews/repository/run.repo.ts:107-114`). `server/docs/architecture.md:127-134` states the single-instance assumption and `server/CLAUDE.md` forbids a second reaper. So the MCP process never executes a run and never opens the database (D2).
- **Architecture:** the `onion-architecture` skill does not cover this package (`SKILL.md:3`; `routing.json` includes only `server/src/**` and `reviewer-core/src/**`), and `pnpm arch:check` does not cruise it. Its ideas are applied as the package's own conventions, written in `mcp/CLAUDE.md` and checked by `mcp/test/boundaries.test.ts` (D12): (1) the HTTP client implements a port, `DevDigestApi`, and so does its mock; (2) `new` of the client and of the transport appears only in `mcp/src/main.ts`; (3) every input is parsed where it enters — tool arguments, environment variables, every API response, every SSE frame; (4) only `main.ts` touches `process.*`.
- **Contracts:** a shape that crosses a package boundary is defined once in `@devdigest/shared` (root `CLAUDE.md`, Conventions). The package imports the contracts as source through a tsconfig alias and derives its API views with `.pick()` / `.extend()`; it declares no object schema of its own for an API shape (D15).
- **Contracts:** routes declare no response schema, so a response is whatever the repository mapped (`server/INSIGHTS.md:22-30`). The client therefore parses only the fields it uses.
- **Packages:** no workspace; install inside the package; match the manager to the lockfile; a lock file changes only as the side effect of an install run in that package (root `CLAUDE.md`, Conventions and Do not touch). `mcp/package-lock.json` is created by `npm install` run in `mcp/` and by nothing else.
- **Insights:** pnpm 10+ installs when a script's dependencies do not match, and a `cd`-based command run in parallel with another once wrote a `pnpm-lock.yaml` into an npm package (root `INSIGHTS.md:340-355`). Run every `cd <pkg> && …` command one at a time; after any install, `mcp/` must hold no `pnpm-lock.yaml` and no `pnpm-workspace.yaml`. The server is never launched through `pnpm`, `npm run` or `npx`: each can write to stdout.
- **Insights:** verify an MCP server by driving it, and spawn the `command` + `args` read out of `.mcp.json` itself (root `INSIGHTS.md:77-83`). Both stdio tests do exactly that.
- **Insights:** `.mcp.json` is tracked and ships to every clone: no secrets, no machine paths (root `INSIGHTS.md:215-226`).
- **Insights:** an undeclared dependency passes locally and fails CI (`server/INSIGHTS.md:175-185`). The new workflow runs `npm ci`, which is the honest check.
- **Insights:** a `buildApp` test that starts a review without a `secrets` override reads the developer's real keys (`server/INSIGHTS.md:108`). The integration test passes `MockSecretsProvider` and `MockGitHubClient`.
- **Insights:** integration files skip silently when the Docker probe times out (`server/INSIGHTS.md:187-208`). A phase is not closed on a run that prints `skipped` for `mcp-stdio.it.test.ts`; rerun the lanes separately as `pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm exec vitest run .it.test --no-file-parallelism`.
- **Insights:** a failed run has zeroed counts and `null` score, cost and breakdown by design (`server/INSIGHTS.md:32-38`); a cancelled single-pass run may still end `done` (`server/INSIGHTS.md:236-244`). The tools read the run's final status after the event stream ends and never infer it.
- **Do not touch:** everything under `server/src/` (no route, no contract, no mock, no cruiser rule), `server/package.json`, `server/pnpm-lock.yaml`, `server/.dependency-cruiser*`, `client/**`, `reviewer-core/**`, `e2e/**`, every existing lock file. Root `CLAUDE.md`, `server/CLAUDE.md`, the agent files and the `engineering-insights` skill are edited by the main session, not by `implementer` or `doc-writer`.

## Design

### How a review runs today (verified)
1. `POST /pulls/:id/review` with `{ agentId }` → `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews: [] }`, returned before any model call (`reviews/routes.ts:27-44`, `service.ts:103-138`). Rate limit 10 per minute on this route (`routes.ts:29`), 120 per minute globally (`app.ts:98-100`).
2. The executor loads the diff, derives the intent once, then runs the agents one after another (`run-executor.ts:105-148`). On success it inserts the review and findings (`:272-284`), writes `status: 'done'` (`:297-309`), saves the trace and completes the run on the bus (`:356-357`). On failure or cancel it writes `failed` / `cancelled` with the error text and completes the bus (`:360-383`).
3. Observation: `GET /runs/:id/events` is an SSE stream that replays the buffer, streams new events and ends when the run completes; it is exempt from rate limiting (`routes.ts:48-92`). `GET /pulls/:id/runs` lists a PR's runs with `status` and `error`, newest first (`routes.ts:101-104`, `run.repo.ts:41-71`). `GET /pulls/:id/reviews` lists reviews with findings, newest first, each carrying `run_id` (`routes.ts:129-132`, `review.repo.ts:59-75`).
4. No route addresses a run without its PR id (`routes.ts:10-17`, `:95-149`).

So a run is asynchronous: an id now, events over SSE, the result by a second read.

### Decisions
| # | Decision | Reason (evidence) | Rejected |
|---|---|---|---|
| D1 | A fifth standalone package: folder `mcp/`, package `@devdigest/mcp`; the MCP server name and the `.mcp.json` key stay `devdigest-mcp` | User decision (2026-10-10). Folders are role names without the product prefix and packages are `@devdigest/<name>` (`server` → `@devdigest/api`, `e2e` → `@devdigest/e2e`); the lesson's name `devdigest-mcp` is what a client sees | `server/src/mcp/` (revision 1); a folder named `devdigest-mcp/` (Open question 2) |
| D2 | The MCP process reaches DevDigest only over HTTP, against the running API (default `http://127.0.0.1:3001`) | The run executor, the run bus and the boot reaper assume one process (Constraints). Over HTTP the MCP process holds no secret and needs no database, Fastify, pino or dotenv | In-process through `Container` |
| D3 | `repo` is `owner/name`; `pr` is the PR number; `agent` is the agent id from `list_agents` (an exact, unique name is also accepted) | `repos` is unique on `(workspace_id, full_name)` (`db/schema/repos.ts:22`); agents have a uuid and no unique name or slug (`db/schema/agents.ts:8-36`); the agent must be resolved against `GET /agents` anyway, because `RunRequest.agentId` is a plain string (`contracts/platform.ts:275-278`) compared to a uuid column (`agents/repository.ts:65-71`) | Internal ids for repo and PR |
| D4 | `run_agent_on_pr` waits on the run's SSE stream for at most **120 s** (`DEVDIGEST_MCP_WAIT_SECONDS`, 1–600), then reads the run's status once; a run still going is a non-error `status: "running"` result | User decision. The stream is the product's own completion signal, is rate-limit exempt and yields progress text | Polling `GET /pulls/:id/runs`; a 90 s default (revision 1) |
| D5 | `get_findings` takes `repo` and `pr`, plus an optional `run_id` | Confirmed by the user. No route resolves a run id alone, and with five fixed tools a `run_id`-only tool could not read a review made in the UI | `get_findings(run_id)` alone |
| D6 | Every result is one text block holding compact JSON; no `outputSchema`, no `structuredContent` | `outputSchema` is paid for in every client's `tools/list`; returning both forms can put the payload in context twice | `outputSchema` on the two review tools |
| D7 | SDK: `@modelcontextprotocol/sdk@^1.32.1`, installed in `mcp/` with npm | Latest is 1.32.1 and it accepts `zod ^3.25 || ^4.0` (main session, 2026-10-10); the shared contracts are written for Zod 3 and resolve to 3.25.76 elsewhere in the repo (`server/pnpm-lock.yaml:2638`, `reviewer-core/package-lock.json:2387-2388`). The v2 line is a different package (`@modelcontextprotocol/server` 2.3.1) | v2: only by a user decision |
| D8 | Launch: `node mcp/node_modules/tsx/dist/cli.mjs --tsconfig mcp/tsconfig.json mcp/src/main.ts`; no build step, no wrapper | The repo runs TypeScript through tsx (`server/package.json:7`, `scripts/e2e.sh:134`); `dist/cli.mjs` is tsx's declared `bin` (`reviewer-core/node_modules/tsx/package.json:25`) and the `--tsconfig` flag exists in 4.22.4 (`reviewer-core/node_modules/tsx/dist/cli.mjs:53`); under npm `mcp/node_modules/tsx` is a real directory; `tsc` output would leave the alias unresolved | `npm --prefix mcp run …` or `npx` (a banner or an install prompt on stdout) |
| D9 | `run_agent_on_pr` attaches to a `running` run of the same agent on the same PR instead of starting a second one | The tool spends money; the likeliest misuse is a retry after a timeout | Always start a new run |
| D10 | `get_blast_radius` returns `isError: true` with a fixed text and calls nothing | An error cannot be mistaken for data | An empty impact map |
| D11 | `get_conventions` returns candidates with status `accepted` by default (`pending` on request) from `GET /repos/:id/conventions` | Confirmed by the user | The body of the `repo-conventions` skill |
| D12 | Boundaries are checked by `mcp/test/boundaries.test.ts`, inside the package's own suite | It reads every file under `mcp/src/` and the two config files and fails on: an import that is not a relative path inside `src/`, `@devdigest/shared`, `zod`, `@modelcontextprotocol/sdk/*` or a `node:` builtin; any `console.` call or `process.stdout`; `process.` used outside `main.ts`; a tsconfig `paths` key other than the three of D15; a runtime dependency other than the SDK, `zod` and `tsx`. An import graph cannot see a stdout write, so a source check is needed anyway | A rule in `server/.dependency-cruiser.cjs` over `../mcp/src` in the manner of `core-stays-pure` (`:28-36`): it would make `server`'s unit workflow run on every `mcp/` change and still not see stdout writes (Open question 6) |
| D13 | The real-API driving test is `server/test/mcp-stdio.it.test.ts`, in `server`'s integration lane; it talks to the spawned server through a newline-delimited JSON-RPC client written in the test | Its fixtures — real Postgres, `buildApp`, the adapter mocks — are the server integration suite's (`TESTING.md:18-19`, `:46-50`, `:79-82`), and a cross-package dependency is expressed in the workflow's `paths:` (`TESTING.md:91-93`), as `reviewer-core/**` already is in `server-unit.yml:20-27`. A hand-written client keeps the SDK out of `server/package.json` and checks the wire format independently | Importing `buildApp` and `test/helpers/pg.ts` into `mcp/test` (the new suite would need pnpm, `reviewer-core` deps and Docker, and stop being hermetic); the `e2e/` package (its flows are browser commands and "nothing in this suite may trigger a model call", `e2e/CLAUDE.md`, so it cannot cover `run_agent_on_pr`) |
| D14 | Package manager: npm | The two small non-app packages use npm (`reviewer-core/package.json`, `e2e/package.json`); `reviewer-core.yml` is a ready model; pnpm 10+ would need a per-package `pnpm-workspace.yaml` to let esbuild (a tsx dependency) build (`server/pnpm-workspace.yaml:1-5`) | pnpm |
| D15 | One Zod instance: `mcp/tsconfig.json` maps `@devdigest/shared` to `../server/src/vendor/shared/index.ts` and `zod` to `./node_modules/zod/index.js`; `mcp/vitest.config.ts` aliases the same two; `main.ts` refuses to start when the contracts and the package see different copies | See "How the shared contracts resolve" below | Letting the contracts resolve `zod` from `server/node_modules` (a second instance, and a hidden dependency on `server` being installed) |

### How the shared contracts resolve
The eleven files of `server/src/vendor/shared` import only the bare specifier `zod` (grep: `from 'zod'` in every file, no subpath). Left alone, a runtime resolves that from the file's own location, that is `server/node_modules/zod` — a second copy.

- **Type-check (`tsc`):** `paths` apply to every file of the program, so `zod` in the contract files maps to `mcp/node_modules/zod/index.js`, whose sibling `index.d.ts` exists. `reviewer-core/tsconfig.json:24-25` does the same with a directory target.
- **Runtime (`tsx`, the launch of D8):** tsx 4.22.4 applies tsconfig path aliases to every importer whose URL does not contain `/node_modules/` — `resolveTsPathsSync` in `reviewer-core/node_modules/tsx/dist/register-CqMfTiWi.mjs:2` — and tries each mapped path as a file URL before falling back. The mapping therefore targets a file, `./node_modules/zod/index.js` (Zod's ESM entry: `"type": "module"`, `"import": "./index.js"`, `reviewer-core/node_modules/zod/package.json:4`, `:48-52`), not a directory, whose handling was not verified. The SDK's own imports come from inside `node_modules`, so they resolve normally to the same package.
- **Tests (`vitest`):** aliases for `@devdigest/shared` (as `reviewer-core/vitest.config.ts:9`) and for exactly `zod` to the same file.
- **Guard:** `assertSingleZod()` checks `Severity instanceof z.ZodType`, with `Severity` from `@devdigest/shared` and `z` from the package's `zod`. `main.ts` calls it first and exits 1 with a stderr line when it fails. Phase 2 proves it under vitest and under tsx.
- **If it cannot be made to pass** (phase 2 stop rule): deriving views from a sibling package is then not workable. The alternative that still keeps one definition is type-only imports (`import type { Agent, … } from '@devdigest/shared'`, erased at runtime, the way `client/` consumes the contracts) with parsers declared in `mcp/src/ports.ts` and a compile-time check that each contract type is assignable to its parser's input, so a renamed or retyped contract field fails `npm run typecheck`. That is a change of `ports.ts` and goes back through `planner`.

### Layout of `mcp/`
| Path | Holds | Phase |
|---|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | the package | 2 |
| `CLAUDE.md`, `README.md`, `INSIGHTS.md`, `specs/` | the package's documents | 1, 2 |
| `src/constants.ts` | server name and version, the instructions text, every limit and cap | 2 |
| `src/single-zod.ts` | `assertSingleZod()` | 2 |
| `src/config.ts` | `McpConfig`, `loadMcpConfig(env)` | 3 |
| `src/tool.ts` | `ToolDef`, `ToolDeps`, `ToolContext`, `ToolFailure`, `executeTool`, `toolOk`, `toolError`, `sanitizeText` | 3, 4 |
| `src/server.ts` | `TOOLS` (in call order) and `createMcpServer(deps)` | 3, 5, 6 |
| `src/main.ts` | the process entry and composition root | 3, 4 |
| `src/ports.ts` | `DevDigestApi`, the API view schemas, `ApiError` | 4 |
| `src/api-client.ts` | `HttpDevDigestApi implements DevDigestApi` | 4 |
| `src/mocks.ts` | `MockDevDigestApi implements DevDigestApi` | 4 |
| `src/resolve.ts` | `resolveRepo`, `resolvePull`, `resolveAgent` | 5 |
| `src/review-view.ts` | `toReviewView` (pure) | 5 |
| `src/tools/list-agents.ts` · `get-conventions.ts` · `get-findings.ts` · `run-agent-on-pr.ts` · `get-blast-radius.ts` | one `ToolDef` each | 5, 5, 5, 6, 3 |
| `test/*.test.ts` | the hermetic suite | 2–6 |

### Package files the implementer must match
```jsonc
// mcp/package.json — written by hand; the lock file comes from `npm install`
{
  "name": "@devdigest/mcp", "version": "0.0.0", "private": true, "type": "module",
  "description": "devdigest-mcp — a local stdio MCP server; an HTTP client of the DevDigest API.",
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.32.1", "tsx": "^4.19.2", "zod": "^3.25.76" },
  "devDependencies": { "@types/node": "^22.10.0", "typescript": "^5.7.2", "vitest": "^2.1.8" }
}
// No "start" script: `npm run` prints a banner on stdout. tsx is a runtime dependency: it is what runs the server.

// mcp/tsconfig.json — the compiler options of reviewer-core/tsconfig.json, with these paths
"paths": {
  "@devdigest/shared": ["../server/src/vendor/shared/index.ts"],
  "@devdigest/shared/*": ["../server/src/vendor/shared/*"],
  "zod": ["./node_modules/zod/index.js"]
},
"include": ["src/**/*.ts"]
```
- `mcp/vitest.config.ts`: `resolve.alias` as an array — `@devdigest/shared` → `../server/src/vendor/shared`, and the exact specifier `zod` (`find: /^zod$/`) → `node_modules/zod/index.js`; `test.include: ['test/**/*.test.ts']`, `environment: 'node'`, `globals: true`, `testTimeout: 30_000`.
- `mcp/.gitignore`: `node_modules/`, `dist/`, and the stray-output guards of `reviewer-core/.gitignore:5-7`.

### Shapes the implementer must match
```ts
// single-zod.ts
export function assertSingleZod(): void;   // throws when `Severity instanceof z.ZodType` is false; the message names --tsconfig mcp/tsconfig.json

// config.ts
export interface McpConfig { apiUrl: string; waitMs: number }
export function loadMcpConfig(env: NodeJS.ProcessEnv): McpConfig;
// DEVDIGEST_API_URL: http(s) URL, default 'http://127.0.0.1:3001', trailing slash removed.
// DEVDIGEST_MCP_WAIT_SECONDS: integer 1..600, default 120. Invalid value → throws an Error naming the variable.

// tool.ts
export class ToolFailure extends Error {}                 // message is written for the calling model
export interface ToolContext { signal?: AbortSignal; progress?: (message: string) => void }
export interface ToolDeps { api: DevDigestApi; config: McpConfig; log: (line: string) => void }  // `api` added in phase 4
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputShape: S;                                          // flat: scalars and enums only
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
  run(args: z.infer<z.ZodObject<S>>, deps: ToolDeps, ctx: ToolContext): Promise<Record<string, unknown>>;
}
export function executeTool(def: ToolDef, rawArgs: unknown, deps: ToolDeps, ctx?: ToolContext): Promise<CallToolResult>;
export function toolOk(payload: Record<string, unknown>): CallToolResult;   // one text block = JSON.stringify(payload); no structuredContent
export function toolError(err: unknown, deps: Pick<ToolDeps, 'config' | 'log'>, toolName: string): CallToolResult;  // isError: true
export function sanitizeText(text: string, max: number): string;

// ports.ts — every view is derived from a shared contract; schema and type share one name
export const ApiAgent = Agent.pick({ id: true, name: true, description: true, provider: true, model: true, enabled: true });
export const ApiRepo = Repo.pick({ id: true, full_name: true });
export const ApiPull = PrMeta.pick({ id: true, number: true });
export const ApiRun = RunSummary.pick({ run_id: true, agent_id: true, agent_name: true, status: true, error: true });
export const ApiFinding = FindingRecord.pick({ severity: true, title: true, file: true, start_line: true, end_line: true, rationale: true, dismissed_at: true });
export const ApiReview = ReviewRecord.pick({ run_id: true, agent_name: true, kind: true, verdict: true, summary: true, score: true, created_at: true })
  .extend({ findings: z.array(ApiFinding) });
export const ApiConvention = ConventionCandidate.pick({ category: true, rule: true, evidence_path: true, evidence_line_start: true, evidence_line_end: true, status: true });
export const ApiConventionList = ConventionList.extend({ candidates: z.array(ApiConvention) });

export type ApiErrorKind = 'unreachable' | 'timeout' | 'http' | 'invalid_response';
export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, readonly route: string, readonly status?: number, readonly code?: string, message?: string);
}   // `route` is the template with its method, e.g. 'GET /pulls/:id/reviews'

export interface DevDigestApi {
  listAgents(): Promise<ApiAgent[]>;                               // GET  /agents
  listRepos(): Promise<ApiRepo[]>;                                 // GET  /repos
  listPulls(repoId: string): Promise<ApiPull[]>;                   // GET  /repos/:id/pulls
  listRuns(prId: string): Promise<ApiRun[]>;                       // GET  /pulls/:id/runs      (newest first)
  listReviews(prId: string): Promise<ApiReview[]>;                 // GET  /pulls/:id/reviews   (newest first)
  getConventions(repoId: string): Promise<ApiConventionList>;      // GET  /repos/:id/conventions
  startReview(prId: string, agentId: string): Promise<{ run_id: string }>;   // POST /pulls/:id/review { agentId }
  waitForRun(runId: string, opts: { timeoutMs: number; signal?: AbortSignal; onEvent?: (message: string) => void }): Promise<'ended' | 'timeout'>;  // GET /runs/:id/events (SSE); never throws
}

// api-client.ts
export class HttpDevDigestApi implements DevDigestApi {
  constructor(opts: { baseUrl: string; fetch?: typeof fetch; requestTimeoutMs?: number });   // default timeout 30_000
}

// server.ts
export const TOOLS: readonly ToolDef[];        // final order: list_agents, run_agent_on_pr, get_findings, get_conventions, get_blast_radius
export function createMcpServer(deps: ToolDeps): McpServer;

// mocks.ts
export interface MockDevDigestApiState {
  agents: ApiAgent[]; repos: ApiRepo[];
  pulls: Record<string, ApiPull[]>;                 // by repo id
  runs: Record<string, ApiRun[]>;                   // by PR id, newest first
  reviews: Record<string, ApiReview[]>;             // by PR id, newest first
  conventions: Record<string, ApiConventionList>;   // by repo id
}
export interface MockDevDigestApiOptions {
  fail?: Partial<Record<keyof DevDigestApi, Error>>;                       // thrown by that method
  startedRunId?: string;                                                    // default 'run-new'
  onStart?: (state: Partial<MockDevDigestApiState>, prId: string, agentId: string, runId: string) => void;
  waitResult?: 'ended' | 'timeout';                                         // default 'ended'
  events?: string[];                                                        // passed to onEvent, in order, before resolving
  onWait?: (state: Partial<MockDevDigestApiState>, runId: string) => void;  // where a test finishes or fails the run
}
export class MockDevDigestApi implements DevDigestApi {
  readonly calls: { method: keyof DevDigestApi; args: unknown[] }[];
  constructor(state?: Partial<MockDevDigestApiState>, opts?: MockDevDigestApiOptions);
  readonly state: Partial<MockDevDigestApiState>;
}
```
- `executeTool` is the one path for every tool: parse `rawArgs` with `z.object(def.inputShape).strict()`, call `def.run`, wrap the payload with `toolOk`; any throw goes to `toolError`. Tests call it directly, with no SDK involved.
- `MockDevDigestApi`: a missing state key reads as empty (`[]`; for `getConventions`, `{ scan: { last_scan_at: null, sampled_files: null }, candidates: [] }`); every call is recorded in `calls`; `startReview` returns `{ run_id: startedRunId }` after `onStart`; `waitForRun` delivers `events`, calls `onWait`, resolves `waitResult`.
- `HttpDevDigestApi`: ids placed in a path come from API responses and go through `encodeURIComponent`. No tool argument is ever written into a URL.

### Limits (all in `constants.ts`)
`DEFAULT_LIMIT = 20`, `MAX_LIMIT = 50`, `MAX_TITLE = 120`, `MAX_RATIONALE = 240`, `MAX_SUMMARY = 600`, `MAX_DESCRIPTION = 200`, `MAX_CONVENTIONS = 50`, `MAX_AGENTS = 50`, `MAX_LISTED = 10` (names or numbers quoted in an error), `MAX_ERROR_TEXT = 300`, `REQUEST_TIMEOUT_MS = 30_000`, `DEFAULT_WAIT_SECONDS = 120`. Severity order is `Severity.options` from `@devdigest/shared` (`CRITICAL`, `WARNING`, `SUGGESTION`). A cut string ends with `…`. Worst case at `limit: 50` is about 32,000 characters (about 8,000 tokens): under Claude Code's 10,000-token warning, its 25,000-token limit and its 50,000-character spill.

### Server metadata
- `serverInfo.name`: `devdigest-mcp`.
- `instructions` (as shipped, at most 500 characters): `DevDigest reviews GitHub pull requests with configured reviewer agents. Arguments: repo is owner/name, pr is the pull request number. To review a pull request: list_agents, then run_agent_on_pr (it waits for the result and spends LLM credits). To read an existing review: get_findings. If run_agent_on_pr answers status "running", do not start it again; call get_findings with the run_id it returned. The DevDigest API must be running locally (./scripts/dev.sh).`

### The tools
Parameter names are identical wherever they recur (`repo`, `pr`, `run_id`). Every property is a scalar or an enum. Only `repo`, `pr`, `agent` and `run_id` carry a description.

**1. `list_agents`** — read-only (`readOnlyHint: true`)
- Description: `List the reviewer agents configured in DevDigest. Call it first: run_agent_on_pr needs an agent id from this list.`
- Input: none. Schema target: `{ "type": "object", "additionalProperties": false }`.
- Output: `{"agents":[{"id","name","description","model","enabled"}]}` sorted by `name`; `description` cut at 200; `model` is `<provider>/<model>`; at most 50, with a `note` when cut. Empty list: `agents: []` and `note: "No agents are configured. Create one in the DevDigest UI (Agents)."`.
- Dropped from `Agent`: `system_prompt`, `output_schema`, `version`, `strategy`, `ci_fail_on`, `repo_intel`, `skill_count`.
- Errors: the API errors below.

**2. `run_agent_on_pr`** — the only write tool (`readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true`)
- Description: `Run one reviewer agent on a pull request, wait for it to finish, and return its verdict and findings. Starts a paid LLM run; to read a review that already exists, call get_findings instead.`
- Input: `repo` (string, "owner/name") · `pr` (integer ≥ 1, "pull request number") · `agent` (string, "agent id from list_agents"). All required.
- Steps: resolve repo → PR → agent; `listRuns`: if a run of that agent is `running`, use its id (D9), else `startReview`; `waitForRun` with `config.waitMs`, `ctx.signal`, `ctx.progress`; `listRuns` again and branch on the run's status.
- Output, `done`: the review result below, plus `"attached": true` when it joined an in-flight run.
- Output, still `running` after the wait (not an error, so the caller does not retry the write): `{"status":"running","run_id","agent","waited_seconds","next":"The review is still running. Do not call run_agent_on_pr again. Call get_findings with repo \"<repo>\", pr <n>, run_id \"<id>\" in about 30 seconds."}`.
- Errors: E-REPO-FORMAT, E-REPO-UNKNOWN, E-PR-UNKNOWN, E-AGENT-UNKNOWN, E-AGENT-AMBIGUOUS, E-RUN-FAILED, E-RUN-CANCELLED, E-RUN-NO-REVIEW, the API errors.

**3. `get_findings`** — read-only
- Description: `Return the verdict and findings of a finished review of a pull request: the latest one, or the run given by run_id. Never starts a review.`
- Input: `repo`, `pr` (required, as above) · `run_id` (string, optional, "run to read; default: latest review") · `min_severity` (enum `CRITICAL` | `WARNING` | `SUGGESTION`, optional; default: all) · `limit` (integer 1–50, default 20).
- Selection: `listReviews`, keeping `kind === 'review'`. Without `run_id`: the newest. With `run_id`: the review whose `run_id` matches. When none is found, `listRuns` explains why.
- Output: the review result below.
- Errors: E-REPO-FORMAT, E-REPO-UNKNOWN, E-PR-UNKNOWN, E-NO-REVIEW, E-RUN-RUNNING, E-RUN-FAILED, E-RUN-CANCELLED, E-RUN-UNKNOWN, E-RUN-NO-REVIEW, the API errors.

**Review result** (tools 2 and 3):
```json
{"status":"done","run_id":"…","agent":"Security Reviewer","reviewed_at":"2026-10-10T09:00:00.000Z",
 "verdict":"request_changes","score":65,"summary":"…",
 "counts":{"CRITICAL":1,"WARNING":0,"SUGGESTION":0},
 "findings":[{"severity":"CRITICAL","title":"…","file":"src/config.ts","line":11,"rationale":"…"}]}
```
- `findings`: dismissed findings are left out (the product's "counted findings" rule, `server/README.md:113-115`); sorted by severity, then `file`, then `line` (code-unit comparison); `line` is `start_line`; `end_line` appears only when it differs; `title`, `rationale`, `summary` are cut at their caps.
- `counts`: every non-dismissed finding by severity, before `min_severity` and `limit`.
- When `limit` cut the list: `"truncated": true` and `"note": "Showing <k> of <n> findings, most severe first. Call get_findings with run_id \"<id>\" and min_severity \"WARNING\", or a higher limit (max 50)."`.
- `verdict` is the shared `Verdict` enum; `run_id`, `agent`, `verdict`, `score`, `summary` may be `null` (the seeded review has no agent).
- Dropped from `ReviewRecord` / `FindingRecord`: `id`, `pr_id`, `agent_id`, `model`, `grounding`, `review_id`, `category`, `suggestion`, `confidence`, `kind`, `scope`, `trifecta_components`, `evidence`, `accepted_at`, `dismissed_at`.

**4. `get_conventions`** — read-only
- Description: `Return the coding conventions DevDigest extracted from a repository and the user accepted. Call it before writing or reviewing code in that repository.`
- Input: `repo` (required) · `status` (enum `accepted` | `pending`, default `accepted`; derived from the shared `ConventionStatus`).
- Output: `{"repo","status","conventions":[{"category","rule","evidence"}],"last_scan_at"}` in the API's order; `evidence` is `path:start` or `path:start-end`; at most 50, with a `note` when cut.
- Notes instead of errors: nothing with the requested status but other candidates exist → `"No accepted conventions yet; <k> candidates are pending review in DevDigest (Skills Lab → Conventions). Call get_conventions with status \"pending\" to read them as unconfirmed proposals."`; never scanned → `"This repository has not been scanned for conventions. Run a scan in DevDigest (Skills Lab → Conventions), accept the rules that are right, then call get_conventions again."`.
- Dropped from `ConventionCandidate`: `id`, `evidence_snippet`, `evidence_url`, `confidence`, `status`.
- Errors: E-REPO-FORMAT, E-REPO-UNKNOWN, the API errors.

**5. `get_blast_radius`** — stub (`readOnlyHint: true`)
- Description: `Impact map of a pull request: the symbols and callers its changes reach. Not implemented yet: always returns an error, never data. Do not estimate the result.`
- Input: `repo`, `pr` (required, as above) — the signature the homework will keep.
- Output: always `isError: true` with E-BLAST. No API call, no lookup.

### Error catalogue
Every error is a tool result with `isError: true` and one text block. Tests pin the parts in bold.

| ID | Text |
|---|---|
| E-REPO-FORMAT | `repo must be **"owner/name"**, for example "acme/payments-api". Got "<input>".` |
| E-REPO-UNKNOWN | `Repository "<input>" is **not imported into DevDigest**. Imported repositories: **<up to 10 full names>**. Pass one of them exactly, or add the repository in the DevDigest UI first.` With none: `No repository is imported into DevDigest yet. Add one in the DevDigest UI, then retry.` |
| E-PR-UNKNOWN | `Pull request **#<n>** is not imported for <repo>. Imported pull requests: **<up to 10 numbers, highest first>**. If it is new, open <repo> in the DevDigest UI so it is imported, then retry.` |
| E-AGENT-UNKNOWN | `Agent "<input>" was not found. **Call list_agents** and pass one of its id values.` |
| E-AGENT-AMBIGUOUS | `"<input>" matches <k> agents. **Pass the id** instead: <id> (<name>), …` |
| E-NO-REVIEW | `<repo>#<n> has no finished review. Call list_agents, then **run_agent_on_pr** to create one.` |
| E-RUN-RUNNING | `Run <run_id> (<agent>) on <repo>#<n> is **still running**. Call **get_findings** again with the same arguments in about 30 seconds. Do not start another run.` |
| E-RUN-FAILED | `Run <run_id> (<agent>) **failed**: <run error, sanitized, ≤ 300; or "no error was recorded; the API may have restarted during the run">. Provider keys are set in DevDigest → Settings. After fixing the cause, call **run_agent_on_pr** again.` |
| E-RUN-CANCELLED | `Run <run_id> (<agent>) was **cancelled** in DevDigest. Call run_agent_on_pr to start a new one.` |
| E-RUN-UNKNOWN | `Run <run_id> does not belong to <repo>#<n>. **Omit run_id** to read the latest review of this pull request.` |
| E-RUN-NO-REVIEW | `Run <run_id> finished but its review is no longer stored (it may have been deleted in DevDigest). Call run_agent_on_pr to create a new one.` |
| E-API-UNREACHABLE | `The DevDigest API is **not reachable at <apiUrl>**. Start it from the repository root with **./scripts/dev.sh**, then call this tool again.` |
| E-API-TIMEOUT | `The DevDigest API did not answer <METHOD route> within 30 seconds. Check <apiUrl>/health, then retry.` |
| E-API-RATE (HTTP 429) | `The DevDigest API **rate limit** was reached (<METHOD route>). **Wait 60 seconds**, then retry once.` |
| E-API-HTTP | `The DevDigest API answered <status> <code> for <METHOD route>: <message, sanitized, ≤ 300>. If the message names a missing relation, run "cd server && pnpm db:migrate".` |
| E-API-SHAPE | `The DevDigest API returned an **unexpected response** for <METHOD route>. The API and devdigest-mcp may be on different versions: restart the API with ./scripts/dev.sh and retry.` |
| E-ARGS | `**Invalid arguments** for <tool>: <field>: <issue>; … Expected: <the tool's parameter names>.` |
| E-INTERNAL | `devdigest-mcp hit an unexpected error in <tool>. Details are in the server's stderr log; retry once, then report it to the user.` The original message and stack go to stderr only. |
| E-BLAST | `get_blast_radius is **not implemented** yet in this DevDigest build: no impact data exists. **Do not estimate or invent it**; tell the user it is unavailable. get_findings still returns the review findings of the pull request.` |

`sanitizeText` collapses whitespace to single spaces, masks token-like substrings (a run of 16 or more characters from `[A-Za-z0-9_-]` after one of the prefixes `sk-`, `sk_`, `ghp_`, `gho_`, `github_pat_`, `xox`) with `***`, and cuts at `max`. It is applied to every string that comes from the API into an error.

Lookup rules (`resolve.ts`): `repo` is trimmed, a leading `https://github.com/` and a trailing `.git` or `/` are removed, and it is compared case-insensitively with `full_name`; anything that is not two non-empty segments is E-REPO-FORMAT. `agent` matches an `id` exactly, else a `name` case-insensitively; no match is E-AGENT-UNKNOWN, several are E-AGENT-AMBIGUOUS. A disabled agent resolves like any other (the API runs it, `reviews/service.ts:51-54`).

### Requirement coverage
IDs are used in the `Done when` lines. R = slide principle, P = researched practice.

| ID | Requirement | Met by |
|---|---|---|
| R1 | Result, not operation | `run_agent_on_pr` creates, waits and fetches in one call (D4, D9) — phase 6; `get_findings` returns the verdict, not a run record — phase 5 |
| R2 | Flat arguments | Every `inputShape` holds scalars and enums only — phases 3, 5, 6; the stdio test rejects any nested object or array property — phase 6 |
| R3 | Concise structured response | The review result and the "Dropped" lists; `review-view.ts` — phase 5 |
| R4 | The error leads onward | The error catalogue: every text names the next step, and unknown repos and PRs list valid values — phases 3–6 |
| P1 | Small startup payload | Budget test: the `tools/list` result is at most 4,000 characters and `instructions` at most 500 — phase 6 |
| P2 | Names stand on their own; no reliance on deferral | The five fixed names; P1's budget covers clients that load everything — phase 6 |
| P3 | Short descriptions, no JSON examples, no schema restated; few parameters; enums; no descriptions on obvious fields | The five description strings (each at most 240 characters); descriptions only on `repo`, `pr`, `agent`, `run_id` — phases 3, 5, 6 |
| P4 | `outputSchema` decided per tool | D6: none on any of the five; the test asserts no tool lists one — phase 6 |
| P5 | Instructions of a few lines with the call order | "Server metadata" — phases 2, 3 |
| P6 | Signal only | "Dropped" lists; no internal id except `id` in `list_agents` and `run_id`, both needed for a follow-up call — phase 5 |
| P7 | Defaults that bound size; say when truncated and how to narrow | `limit` (20, max 50), `min_severity`, `truncated` + `note`, caps on every free text — phase 5 |
| P8 | `response_format` only if it earns its cost | Not added; `rationale` is included, cut at 240 (Open question 4) |
| P9 | Claude Code output thresholds | Worst-case size test: at most 36,000 characters at `limit: 50` — phase 5 |
| P10 | Bounded wait, clear timeout result, progress notifications | D4 (120 s); the `status: "running"` result; `ctx.progress` forwards run events as `notifications/progress` when the request carries a progress token — phases 3, 6 |
| P11 | Verb-first snake_case; identical parameter names | The five names; `repo`, `pr`, `run_id` reused — phases 3, 5, 6 |
| P12 | Annotations | `readOnlyHint: true` on four tools; `run_agent_on_pr` is `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true` — phases 3, 5, 6 |
| P13 | Execution errors as `isError` results; protocol errors only for malformed requests | `executeTool` + `toolError` — phases 3, 4 |
| P14 | Zod on every input; no secrets, no stack traces | `executeTool` (`.strict()`), `loadMcpConfig`, the API views, `sanitizeText`, E-INTERNAL — phases 3, 4 |
| P15 | Spec 2025-11-25: no-parameter schema; text copy of `structuredContent` | `list_agents` schema target; D6 returns no `structuredContent` — phases 3, 5 |
| P16 | stdout carries only MCP messages; anything imported is checked | `main.ts` logs to stderr only; `boundaries.test.ts` forbids `console.`, `process.stdout` and any runtime dependency beyond the SDK, `zod` and `tsx` (D12); the launch has no npm / pnpm wrapper (D8); the stdio test reads the stream — phase 3 |
| P17 | Thin adapter over existing services and contracts | D2 (existing routes only), `.pick()` views over the aliased contracts, one Zod (D15), no new route or contract — phases 2, 4–6 |
| P18 | Verified by driving it from `.mcp.json`; no secrets or machine paths there | `mcp/test/stdio.test.ts` (hermetic) and `server/test/mcp-stdio.it.test.ts` (real API) both spawn the entry read from `.mcp.json` — phases 3, 5, 6 |
| P19 | SDK compatibility check as an explicit early step | Phase 2, with stop rules, starting from the verified version and Zod range; runtime facts recorded in phase 3 |

## Phases

### 1 · Specs — root and `mcp/specs/`

The two specifications the later phases and the verifier read. First, so every phase has a requirement document to cite; it changes no code.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `specs/L04-devdigest-mcp.md` (new) | Umbrella spec, one level above the code: what the server is and why it is local and stdio-only; a flow diagram (MCP client → stdio → `devdigest-mcp` in `mcp/` → HTTP → API in `server/` → run executor → Postgres); the five tools in one table (name, purpose, read or write); the requirements R1–R4 and P1–P19 with the IDs of this plan's coverage table; the decisions D1–D15 in one line each; an ownership table (`mcp` owns the server; `server` owns the real-API driving test; `client`, `reviewer-core`, `e2e`: nothing); out of scope; cross-package acceptance (the `Done when` lines of phases 2–6, as a checklist). Copy from this plan's Design; invent nothing | — (`.md`) | — |
| `mcp/specs/L04-devdigest-mcp.md` (new) | Implementable detail: "What already exists" (the routes used, with their contracts); the layout of `mcp/`; the package files; how the shared contracts resolve; the shapes; the limits; server metadata; the per-tool section; the error catalogue; the lookup rules; the launch entry and the two environment variables; the test table (the test files of phases 2–6, in `mcp/test/` and `server/test/`, and what each pins); an acceptance checklist; an empty section "SDK compatibility record" with the fields phases 2 and 3 fill | — (`.md`) | — |
| `mcp/specs/README.md` (new) | The index, in the shape of `reviewer-core/specs/README.md`: one row for `L04-devdigest-mcp.md`, status `draft` | — | — |
| `specs/README.md` | Add the row `L04-devdigest-mcp.md` with status `draft`; add `mcp/specs` to the sentence that lists the per-module spec folders (`:29-34`) | — | — |

**Tests (test-writer):**
- None: this phase adds Markdown only. The main session may skip the `test-writer` run.
- Expected to change: none

**Verify (code):** `cd server && pnpm typecheck`
**Verify (phase):** `cd server && pnpm typecheck`
**Done when:**
- Both spec files exist, name all five tools with the exact names, and carry the IDs R1–R4, P1–P19 and D1–D15.
- `mcp/specs/L04-devdigest-mcp.md` has a section "SDK compatibility record" with empty fields.
- `specs/README.md` and `mcp/specs/README.md` list the new spec.

### 2 · Package scaffold, the SDK check and one Zod — `mcp`

The fifth package, its one new dependency checked against the repository's Zod, and the proof that the shared contracts resolve to a single Zod under both vitest and tsx. Early, so a failed check stops the work before any tool exists.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `mcp/package.json` (new), `mcp/package-lock.json` (new) | `package.json` exactly as in Design, written by hand. The lock file is the side effect of `cd mcp && npm install` and of nothing else. After installing, check in this order and **stop with status `blocked` on any failure, without changing the Zod major and without switching to another SDK package**: (a) `npm ls zod` shows one version, 3.25.x, with the SDK's copy deduped to it; (b) `mcp/` holds no `pnpm-lock.yaml` and no `pnpm-workspace.yaml`, and `git status --short` shows no change outside `mcp/` and `specs/`; (c) the installed SDK is 1.32.1 or a later 1.x and its `package.json` `exports` provide a server class with tool registration, a stdio server transport, a client, a stdio client transport and an in-memory transport | — | — |
| `mcp/tsconfig.json` (new) | As in Design | — | — |
| `mcp/vitest.config.ts` (new) | As in Design | — | — |
| `mcp/.gitignore` (new) | As in Design | — | — |
| `mcp/src/constants.ts` (new) | Server name, version, the instructions text and the limits of Design; `SEVERITY_ORDER` is `Severity.options` imported from `@devdigest/shared` | security | sec-hardcoded-secret |
| `mcp/src/single-zod.ts` (new) | `assertSingleZod()` as in Design. Then prove it under tsx and **stop with status `blocked` if it fails** (the alternative is described in Design and needs a plan revision): from `mcp/`, run a throwaway file that calls it through `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json <file>`, and once more from the repository root with `--tsconfig mcp/tsconfig.json` | security | — |
| `mcp/CLAUDE.md` (new) | In the shape of `reviewer-core/CLAUDE.md`. "Before answering": a tool's name, arguments, output or error text → `specs/L04-devdigest-mcp.md`; how the server is launched, its environment variables, a client that cannot connect → `README.md`; a route it calls or a response it parses → the spec, then `../server/README.md` — API map; a shared contract → `../server/src/vendor/shared` (never redeclare); any test → `../TESTING.md`; a familiar failure → `INSIGHTS.md`. "Commands": `npm test` · `npm run typecheck`; "npm, not pnpm". "Where things live": the layout table of Design. "Conventions": an HTTP client of the API and nothing else; stdout is the protocol — only `main.ts` touches `process.*`, everything else logs through `deps.log`; API views are `.pick()` / `.extend()` of shared contracts; one Zod (the two tsconfig paths); tool arguments are flat; every error text names the next step; the client and the transport are constructed only in `main.ts`. "Gotchas": never start it through `npm run`, `npx` or `pnpm`; the API must be running; the test against a real API is `../server/test/mcp-stdio.it.test.ts`; `get_blast_radius` is a stub | — (`.md`) | — |
| `mcp/README.md` (new) | Short and true at this phase: what the package is, that it is a client of the API, prerequisites (`cd mcp && npm ci`, the API running), the launch entry of D8, the two environment variables, a pointer to the spec for the tools. `doc-writer` completes it after phase 6 | — | — |
| `mcp/INSIGHTS.md` (new) | The header of `reviewer-core/INSIGHTS.md:1-7` for this package and no entries | — | — |
| `mcp/specs/L04-devdigest-mcp.md` | Fill the static half of "SDK compatibility record": installed SDK version and its Zod range; the single resolved `zod` version; the import paths of the five pieces of (c); the name and parameter types of the tool-registration call; whether the server options take `instructions`; whether a tool handler receives an abort signal, the request's progress token and a way to send a notification; the result of the two tsx runs of `assertSingleZod()` | — | — |

**Tests (test-writer):**
- Add `mcp/test/single-zod.test.ts` (hermetic) — under vitest `assertSingleZod()` does not throw and `Severity` from `@devdigest/shared` is an instance of the package's `z.ZodEnum`; `SEVERITY_ORDER` is `CRITICAL`, `WARNING`, `SUGGESTION`; a fixture entry in `mcp/test/fixtures/` that calls `assertSingleZod()` exits 0 when run as `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json <fixture>` from `mcp/`, and writes nothing to stdout; the same fixture run **without** `--tsconfig` from a directory that has no `tsconfig.json` exits non-zero (it shows the guard or the resolver catches a missing alias); the instructions text is at most 500 characters.
- Expected to change: none

**Verify (code):** `cd mcp && npm run typecheck` · `cd mcp && npm test`
**Verify (phase):** `cd mcp && npm run typecheck && npm test`
**Done when:**
- D14 — `mcp/` is installable with `npm ci` alone and holds `package-lock.json` and no pnpm file.
- P19 — the record names the installed SDK version (1.32.1 or a later 1.x), its Zod range and the import paths.
- D15 — `npm ls zod` shows one Zod, and `assertSingleZod()` passes under vitest and under tsx with `--tsconfig`.
- `npm run typecheck` passes with `@devdigest/shared` resolved from `../server/src/vendor/shared`.
- `mcp/CLAUDE.md` lists `npm test` and `npm run typecheck`.

### 3 · stdio skeleton, the honest stub, registration and CI

The smallest server that can be driven end to end: transport, metadata, the tool pipeline, one tool that needs no API, the `.mcp.json` entry, the package's CI workflow and the fresh-clone install. It proves the SDK, the launch command and a clean stdout before any tool depends on them.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `mcp/src/config.ts` (new) | `McpConfig` and `loadMcpConfig(env)` as in Design; a Zod schema; does not read `process.env` itself | security | sec-hardcoded-secret |
| `mcp/src/tool.ts` (new) | `ToolDef`, `ToolContext`, `ToolDeps` (`config`, `log`; `api` comes in phase 4), `ToolFailure`, `executeTool`, `toolOk`, `toolError` (here: `ToolFailure` → its message; Zod error → E-ARGS; anything else → E-INTERNAL plus one stderr line through `deps.log`), `sanitizeText` | security | sec-secret-exposure |
| `mcp/src/tools/get-blast-radius.ts` (new) | The stub `ToolDef`: the name, description, `repo` + `pr` shape and `readOnlyHint: true` of Design; `run` throws `ToolFailure` with E-BLAST and uses neither its arguments nor `deps` | security | — |
| `mcp/src/server.ts` (new) | `TOOLS` (one entry for now) and `createMcpServer(deps)`: creates the SDK server with the name, version and instructions; registers every `ToolDef` with its description, `inputShape` and annotations and no `outputSchema`; each handler calls `executeTool`, building `ToolContext` from the SDK's handler argument (`signal`; `progress` sends `notifications/progress` with an increasing counter and the message, only when the request carries a progress token). Writes to neither stdout nor stderr itself | security | — |
| `mcp/src/main.ts` (new) | The entry and composition root: `assertSingleZod()` and `loadMcpConfig(process.env)` (on failure of either: one stderr line, exit code 1); `log` writes a line to `process.stderr`; `createMcpServer`; connect the stdio transport; then one stderr line `devdigest-mcp ready (API <apiUrl>)`. Exits 0 when the transport closes, stdin ends, or on `SIGINT` / `SIGTERM`; an uncaught error is logged to stderr. The only file under `src/` that uses `process` | security | sec-secret-exposure |
| `.mcp.json` | Add `"devdigest-mcp": { "command": "node", "args": ["mcp/node_modules/tsx/dist/cli.mjs", "--tsconfig", "mcp/tsconfig.json", "mcp/src/main.ts"] }` next to `chrome-devtools`; no `env` key | — | — |
| `.github/workflows/mcp.yml` (new) | Modelled on `.github/workflows/reviewer-core.yml`: name `mcp`; `paths` for `push` and `pull_request`: `mcp/**`, `server/src/vendor/shared/**`, `.mcp.json`, `.github/workflows/mcp.yml`; one job in `working-directory: mcp`: checkout, Node 22 with the npm cache keyed on `mcp/package-lock.json`, `npm ci`, `npm run typecheck`, `npm test`. A header comment says why the two foreign paths are in the filter | — | — |
| `scripts/dev.sh` | After the `reviewer-core` install (`:85-87`), the same form for the new package: install with `npm ci` in `mcp/` when `mcp/node_modules` is missing, with a comment that an MCP client starts `devdigest-mcp` from `.mcp.json` and it needs its own dependencies | — | — |
| `.claude/skills/pr-self-review/routing.json` | `skills.security.include` gains `mcp/src/**/*.ts`; `skills.security.exclude` gains `mcp/src/mocks.ts`. Nothing else changes: `onion-architecture` and `arch_check` stay scoped to `server/` and `reviewer-core/` | — | — |
| `mcp/specs/L04-devdigest-mcp.md` | Fill the runtime half of "SDK compatibility record", observed by driving the skeleton: the `inputSchema` the SDK lists for a tool with no parameters (this decides whether `additionalProperties: false` is reachable for `list_agents`; if the registration call cannot produce it, record that as a known gap, do not hand-roll the protocol); whether a call with invalid arguments reaches the handler or is answered by the SDK, and in which form; whether a text-only result with `isError: true` passes; whether progress notifications reach a client | — | — |

**Tests (test-writer):**
- Add `mcp/test/config.test.ts` (hermetic) — defaults (`http://127.0.0.1:3001`, 120 s as milliseconds); a trailing slash is removed; a non-URL and a non-http scheme are rejected with an error naming `DEVDIGEST_API_URL`; wait seconds of `0`, `601` and `abc` are rejected naming `DEVDIGEST_MCP_WAIT_SECONDS`.
- Add `mcp/test/tool.test.ts` (hermetic) — `toolOk` returns exactly one text block whose text is the compact JSON of the payload, and no `structuredContent`; `executeTool` with a throwaway `ToolDef`: valid arguments reach `run`; a wrong type, a missing field and an unknown key each give `isError: true` with E-ARGS naming the field and listing the expected names, and `run` is not called; a thrown `ToolFailure` gives its message; a thrown `Error('boom at /Users/x')` gives E-INTERNAL without `boom`, without a path and without a stack, and `deps.log` received the detail; `sanitizeText` collapses whitespace, masks `sk-…`, `ghp_…` and `github_pat_…` strings, and cuts at `max` with `…`; the stub: any `repo` / `pr` gives `isError: true` with E-BLAST's bold parts and no file path, symbol name or figure.
- Add `mcp/test/stdio.test.ts` (hermetic; a helper in `mcp/test/helpers/` reads `mcpServers['devdigest-mcp']` from the root `.mcp.json` and spawns exactly that `command` + `args` with the repository root as working directory and the test's environment plus `DEVDIGEST_API_URL` pointing at a closed local port; the SDK's client and stdio client transport talk to it) — the `.mcp.json` entry has no argument that is absolute or contains a home directory, and no environment name containing `KEY`, `TOKEN` or `SECRET`; `initialize` answers server name `devdigest-mcp` and the instructions; `tools/list` contains `get_blast_radius` with `readOnlyHint: true` and no `outputSchema`; `tools/call get_blast_radius` answers `isError: true` with "not implemented"; during the whole session no transport or parse error is reported and stderr received the `devdigest-mcp ready` line; the process exits within 2 s after the client disconnects.
- Add `mcp/test/boundaries.test.ts` (hermetic; reads source files) — the five checks of D12: allowed import specifiers only; no `console.` and no `process.stdout` under `src/`; `process.` appears only in `src/main.ts`; the `paths` of `tsconfig.json` are exactly `@devdigest/shared`, `@devdigest/shared/*` and `zod`; the `dependencies` of `package.json` are exactly `@modelcontextprotocol/sdk`, `tsx` and `zod`.
- Expected to change: none

**Verify (code):** `cd mcp && npm run typecheck` · `cd mcp && npm test`
**Verify (phase):** `cd mcp && npm run typecheck && npm test`
**Done when:**
- P18 — the server started from the `.mcp.json` entry answers `initialize`, `tools/list` and a `tools/call` over stdio, with only `mcp/node_modules` needed.
- P16 — nothing but JSON-RPC messages appears on stdout during that session, the startup line is on stderr, and `boundaries.test.ts` passes.
- D10 — `get_blast_radius` answers `isError: true` with E-BLAST and makes no API call.
- P13, P14 — invalid arguments and an unexpected throw both come back as `isError` results, the latter with no message or stack of the original error.
- `.github/workflows/mcp.yml` filters on `mcp/**`, `server/src/vendor/shared/**` and `.mcp.json`, and runs `npm ci`, `npm run typecheck`, `npm test`.
- `scripts/dev.sh` installs `mcp/` when its `node_modules` is missing.
- `routing.json` routes `mcp/src/**/*.ts` to `security`.
- The "SDK compatibility record" has every field filled.

### 4 · The API port, its HTTP adapter and its mock

Everything that talks to the DevDigest API, behind one interface, with the mock the tool tests need. Before the tools, so they are written against the port.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `mcp/src/ports.ts` (new) | The API view schemas and types, `ApiErrorKind`, `ApiError` and `DevDigestApi`, exactly as in Design; imports only `zod` and `@devdigest/shared` | security | — |
| `mcp/src/api-client.ts` (new) | `HttpDevDigestApi`: one private request helper (method, route template, path, optional JSON body; `AbortSignal.timeout(requestTimeoutMs)`; a rejected `fetch` → `ApiError('unreachable')`, a timeout → `'timeout'`, a non-2xx → `'http'` with `status` and, when the body parses as `ApiErrorBody`, its `code` and `message`; a 2xx body that fails its view schema → `'invalid_response'`); the seven request methods (`startReview` parses `ReviewRunResponse.pick({ runs: true })` and returns the first run's id; an empty `runs` → `'invalid_response'`); `waitForRun`: reads the SSE body with a stream reader, splits frames on a blank line, parses each `data:` line as JSON and then with `RunEvent.pick({ msg: true })`, passes `msg` to `onEvent`, resolves `'ended'` when the stream ends or fails for any reason, `'timeout'` when `timeoutMs` passes, and stops when `signal` aborts; it never throws. Translates only: no retry, no choice between reviews, no error wording | security | sec-secret-exposure |
| `mcp/src/mocks.ts` (new) | `MockDevDigestApiState`, `MockDevDigestApiOptions` and `MockDevDigestApi implements DevDigestApi`, as in Design. Imported by tests only; `main.ts` does not import it | — (excluded from `security`) | — |
| `mcp/src/tool.ts` | `ToolDeps` gains `api: DevDigestApi`; `toolError` maps `ApiError` by kind to E-API-UNREACHABLE (with `config.apiUrl`), E-API-TIMEOUT, E-API-RATE (status 429), E-API-HTTP and E-API-SHAPE, passing the API's message through `sanitizeText` | security | sec-secret-exposure |
| `mcp/src/main.ts` | Construct `new HttpDevDigestApi({ baseUrl: config.apiUrl })` and pass it as `deps.api` | security | — |

**Tests (test-writer):**
- Add `mcp/test/api-client.test.ts` (hermetic; the client is built with a stub `fetch`, as `server/test/github-octokit.test.ts` does for Octokit) — each of the seven request methods sends the documented method and path under `baseUrl`; `listAgents` returns only the six picked fields when the body also carries `system_prompt`; `startReview` posts `{ "agentId": … }` as JSON and returns the first run id; a 404 with an `ApiErrorBody` gives `kind: 'http'`, `status: 404`, `code: 'not_found'` and the body's message; a 500 with a non-JSON body gives `kind: 'http'`, `status: 500`; a 429 with the rate-limit plugin's body gives `status: 429`; a rejected `fetch` gives `'unreachable'`; a body that fails the view schema gives `'invalid_response'` with the route template; a request slower than `requestTimeoutMs` gives `'timeout'`; an id containing `/` is percent-encoded in the path. `waitForRun`: three SSE frames split across chunk boundaries reach `onEvent` in order and the promise resolves `'ended'` when the stream closes; a stream that stays open resolves `'timeout'` after `timeoutMs`; a rejected `fetch` and a 500 both resolve `'ended'` without throwing; an aborted `signal` ends the wait; a frame whose `data` is not JSON is skipped.
- Extend `mcp/test/tool.test.ts` — `toolError` for each `ApiError` kind produces the bold parts of the matching catalogue entry; E-API-UNREACHABLE names the configured URL and `./scripts/dev.sh`; an API message containing a token-like string is masked; a 429 maps to E-API-RATE.
- Extend `mcp/test/boundaries.test.ts` — no file under `src/` other than tests' targets imports `./mocks`: `main.ts`, `server.ts` and the tool files do not.
- Expected to change: none

**Verify (code):** `cd mcp && npm run typecheck` · `cd mcp && npm test`
**Verify (phase):** `cd mcp && npm run typecheck && npm test`
**Done when:**
- P17 — every API response is parsed through a view derived from a shared contract with `.pick()` / `.extend()`; `mcp/src/` declares no object schema of its own for an API shape.
- `HttpDevDigestApi` and `MockDevDigestApi` both declare `implements DevDigestApi`, and the mock lives in `mcp/src/mocks.ts`.
- P14 — each failure mode of the HTTP boundary (unreachable, timeout, non-2xx, wrong shape) is an `ApiError` of the matching kind, and `waitForRun` never throws.
- R4 — every `ApiError` kind maps to a catalogue text that names the next step.

### 5 · The read tools — `list_agents`, `get_conventions`, `get_findings` — and the real-API test

The three tools that only read, with the lookups and the review projection they share, and the first run against a real API and a seeded database. Before the write tool, which reuses all of it.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `mcp/src/resolve.ts` (new) | `resolveRepo(api, repo)`, `resolvePull(api, repo, pr)`, `resolveAgent(api, agent)` with the lookup rules of Design; each throws `ToolFailure` with E-REPO-FORMAT, E-REPO-UNKNOWN, E-PR-UNKNOWN, E-AGENT-UNKNOWN or E-AGENT-AMBIGUOUS; listed names are sorted, listed PR numbers are highest first, both cut at `MAX_LISTED`; a pull without an `id` is ignored | security | — |
| `mcp/src/review-view.ts` (new) | Pure `toReviewView(review, { minSeverity?, limit })` returning the review result of Design: dismissed findings out, `counts`, the sort, `min_severity`, `limit`, `truncated` + `note`, the caps, `end_line` only when it differs | security | — |
| `mcp/src/tools/list-agents.ts` (new) | The `ToolDef` of Design; empty `inputShape`; maps `ApiAgent` to `{ id, name, description, model, enabled }` | security | sec-secret-exposure |
| `mcp/src/tools/get-conventions.ts` (new) | The `ToolDef` of Design; `status` derived from the shared `ConventionStatus` without `rejected`; filters by status, builds `evidence`, applies `MAX_CONVENTIONS` and the two notes | security | — |
| `mcp/src/tools/get-findings.ts` (new) | The `ToolDef` of Design; `min_severity` is the shared `Severity`; `pr` and `limit` accept a numeric string; selection as in Design, raising E-NO-REVIEW, E-RUN-RUNNING, E-RUN-FAILED, E-RUN-CANCELLED, E-RUN-UNKNOWN or E-RUN-NO-REVIEW from the run list when no review is found | security | sec-secret-exposure |
| `mcp/src/server.ts` | `TOOLS` becomes `list_agents`, `get_findings`, `get_conventions`, `get_blast_radius` | security | — |
| `.github/workflows/server-integration.yml` | Add `mcp/**` and `.mcp.json` to both `paths:` lists; add a step "Install mcp deps" (`working-directory: mcp`, `npm ci`) after the `reviewer-core` install (`:56-58`), with a comment that `test/mcp-stdio.it.test.ts` spawns the server from `.mcp.json` | — | — |

**Tests (test-writer):**
- Add `mcp/test/review-view.test.ts` (hermetic, no doubles) — sorting by severity, then file, then line, with three or more findings per key; a dismissed finding is absent and not counted, an accepted one stays; `counts` ignores `min_severity` and `limit`; `min_severity: 'WARNING'` drops suggestions; a limit below the count sets `truncated` and a `note` holding the shown and total numbers, the `run_id` and `min_severity`; no `truncated` key when nothing was cut; `end_line` is present only when it differs from `line`; title, rationale and summary are cut at their caps with `…`; a review with `null` verdict, score, summary, agent and `run_id` maps to `null` fields; 50 findings with maximum-length title, rationale and a 200-character path serialise to at most 36,000 characters; none of the dropped fields appears in the output.
- Add `mcp/test/read-tools.test.ts` (hermetic; `executeTool` with `MockDevDigestApi`) — `list_agents`: sorted by name, `model` is `provider/model`, a 400-character description is cut, an empty list gives the note; `get_conventions`: default returns only `accepted`, `status: 'pending'` only pending, `evidence` is `path:3` and `path:3-9`, none accepted with two pending gives the first note with the count, no candidates and a null scan gives the second note, more than 50 are cut with a note; `get_findings`: no `run_id` returns the newest review, `run_id` returns that review, `kind: 'summary'` reviews are ignored, and each of E-NO-REVIEW, E-RUN-RUNNING, E-RUN-FAILED (with the run's error, and with a null error), E-RUN-CANCELLED, E-RUN-UNKNOWN, E-RUN-NO-REVIEW is reached from the matching mock state; `pr: "482"` is accepted; lookups: `HTTPS://github.com/Acme/Payments-API.git` resolves `acme/payments-api`, `payments-api` gives E-REPO-FORMAT, an unknown repo lists the imported ones, an empty repo list gives its own text, an unknown PR lists numbers highest first and at most ten; an `ApiError('unreachable')` from the mock gives E-API-UNREACHABLE; `startReview` and `waitForRun` are never called by any of the three tools.
- Extend `mcp/test/stdio.test.ts` — against a local `node:http` stub that answers `GET /agents` with two agents, one carrying a 5,000-character `system_prompt`, `tools/call list_agents` over stdio returns both ids and names and the result text does not contain the prompt; against a closed port it answers `isError: true` with E-API-UNREACHABLE.
- Add `server/test/mcp-stdio.it.test.ts` with a helper in `server/test/helpers/` (real Postgres through `test/helpers/pg.ts`, `seed`, `buildApp` with `NODE_ENV: 'test'` and overrides `secrets: new MockSecretsProvider()`, `github: new MockGitHubClient({ pulls: [] })`, an `openai` `MockLLMProvider`; the app listens on `127.0.0.1` port `0`; the helper reads `mcpServers['devdigest-mcp']` from the root `.mcp.json`, spawns it with the repository root as working directory and `DEVDIGEST_API_URL` set to that address, and speaks newline-delimited JSON-RPC 2.0 to its stdin and stdout: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`; it fails with "run `cd mcp && npm ci`" when `mcp/node_modules` is missing, and never skips for that reason) — every line the server writes to stdout parses as a JSON-RPC message; `list_agents` returns the five seeded agent names and no result text contains "You are"; `get_findings` for `acme/payments-api`, `pr` 482 returns `verdict: "request_changes"`, two findings with the `CRITICAL` one first, its title `Hardcoded Stripe secret key in commit` and `line: 12`, and `counts` `{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }`; with `min_severity: "CRITICAL"` it returns one; `get_conventions` for the seeded repo returns no conventions and the note with `3`; with `status: "pending"` it returns three rules; an unknown repo answers E-REPO-UNKNOWN naming `acme/payments-api`; PR 9999 answers E-PR-UNKNOWN naming `#482`.
- Expected to change: none

**Verify (code):** `cd mcp && npm run typecheck` · `cd mcp && npm test` · `cd server && pnpm typecheck` · `cd server && pnpm test`
**Verify (phase):** `cd mcp && npm run typecheck && npm test` · `cd server && pnpm typecheck && pnpm test`
**Done when:**
- R3, P6 — a `get_findings` result holds only the fields of the review result in Design; `list_agents` never returns a system prompt.
- P7, P9 — `limit` and `min_severity` bound the result, a cut list says so and how to narrow it, and the worst case at `limit: 50` is at most 36,000 characters.
- R4 — every not-found and not-ready case of the three tools answers with its catalogue text; an unknown repo or PR lists valid values.
- D5 — `get_findings` works with `repo` and `pr` alone and with a `run_id`.
- D11 — `get_conventions` returns accepted candidates by default and explains an empty result.
- P18, D13 — the three tools return real data over stdio from a seeded database, with `server/test/mcp-stdio.it.test.ts` executed, not skipped.
- `server-integration.yml` installs `mcp/` and is triggered by `mcp/**` and `.mcp.json`; no file under `server/src/` changed.

### 6 · The write tool — `run_agent_on_pr` — and closing the feature

The tool that starts a review, waits and returns the result; then the whole-server checks that need all five tools.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `mcp/src/tools/run-agent-on-pr.ts` (new) | The `ToolDef` of Design: annotations `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true`; `pr` accepts a numeric string; the steps of Design in that order (resolve repo, PR, agent; attach or `startReview`; `waitForRun` with `config.waitMs`, `ctx.signal`, `ctx.progress`; `listRuns`; branch on status). `done` → `listReviews` → `toReviewView` with `DEFAULT_LIMIT` (plus `attached: true` when it joined a run); `running` → the `status: "running"` payload with `waited_seconds` from `config.waitMs`; `failed` → E-RUN-FAILED; `cancelled` → E-RUN-CANCELLED; `done` without a review, or a missing run row → E-RUN-NO-REVIEW. Nothing is started when a lookup fails. An aborted `ctx.signal` ends the call without cancelling the run | security | sec-secret-exposure |
| `mcp/src/server.ts` | `TOOLS` in its final order: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` | security | — |
| `specs/README.md`, `mcp/specs/README.md` | Status of the L04 rows becomes `implemented` | — | — |

**Tests (test-writer):**
- Add `mcp/test/run-agent.test.ts` (hermetic; `executeTool` with `MockDevDigestApi`) — happy path: the calls are `listRepos`, `listPulls`, `listAgents`, `listRuns`, `startReview`, `waitForRun`, `listRuns`, `listReviews` in that order, `startReview` got the resolved PR id and agent id, and the result is the review result with `status: "done"` for the started run; an agent given by exact name resolves to its id; a `running` run of the same agent exists: `startReview` is not called, the wait is on that run and the result has `attached: true`; a `running` run of another agent does not prevent a start; the wait times out with the run still `running`: the result is not an error, has `status: "running"`, the `run_id`, `waited_seconds` equal to the configured wait and a `next` text naming `get_findings`, the repo, the PR number and the run id, and `startReview` was called once; the run ends `failed` with an error holding a token-like string: E-RUN-FAILED with the string masked; `failed` with a null error; `cancelled`; `done` with no review; an unknown agent: E-AGENT-UNKNOWN naming `list_agents`, with neither `startReview` nor `waitForRun` called; two agents sharing a name: E-AGENT-AMBIGUOUS listing both ids; an unknown repo and an unknown PR: nothing started; `startReview` failing with a 429 `ApiError`: E-API-RATE; `ctx.progress` receives the mock's events in order; `waitForRun` receives `config.waitMs` and the context's signal; with the default config the wait passed is 120,000 ms.
- Extend `mcp/test/stdio.test.ts` — `tools/list` holds exactly the five names in the final order; its JSON is at most 4,000 characters and the instructions at most 500; every description is at most 240 characters and contains no `{`; no tool lists an `outputSchema`; every input property is a string, integer, number, boolean or enum, never an object or array; `list_agents` has no properties and no required names (and `additionalProperties: false` unless the compatibility record states the SDK cannot emit it); `readOnlyHint` is `true` on four tools and `false` on `run_agent_on_pr`, which also has `destructiveHint: false`; only `repo`, `pr`, `agent` and `run_id` carry a description.
- Extend `server/test/mcp-stdio.it.test.ts` — on a repo and PR inserted by the test (one `pr_files` row with a patch, a `MockGitClient` diff and a review fixture as in `test/reviews.it.test.ts`, an agent created through `POST /agents` with provider `openai`): `run_agent_on_pr` over stdio returns `status: "done"`, the fixture's verdict and exactly the one grounded finding with its file and line; `get_findings` with the returned `run_id` returns the same findings; `agent_runs` holds exactly one row for that PR; `run_agent_on_pr` with an unknown agent answers E-AGENT-UNKNOWN and creates no `agent_runs` row; when the compatibility record says progress is supported, a call sent with a progress token receives at least one `notifications/progress` line.
- Expected to change: none

**Verify (code):** `cd mcp && npm run typecheck` · `cd mcp && npm test` · `cd server && pnpm typecheck` · `cd server && pnpm test`
**Verify (phase):** `cd mcp && npm run typecheck && npm test` · `cd server && pnpm typecheck && pnpm test`
**Done when:**
- R1 — one `run_agent_on_pr` call creates the run, waits and returns `{ verdict, findings }`; the integration test proves it over stdio with one `agent_runs` row.
- P10, D4 — the default wait is 120 s; a wait that outlasts it returns a non-error `status: "running"` result that names `get_findings` and the run id; the run is not started twice.
- D9 — a second call while a run of that agent is in flight attaches to it.
- R2, P11, P12 — `tools/list` holds exactly the five tools, with flat inputs, shared parameter names and the annotations of Design.
- P1, P3, P4 — the `tools/list` and instructions budgets hold and no tool has an `outputSchema`.
- R4 — an unknown agent answers with "Call list_agents" and starts nothing.
- Both spec rows read `implemented`; `server/test/mcp-stdio.it.test.ts` ran (not skipped); `git status` shows no change under `server/src/`.

## Out of scope
- Implementing Blast Radius: no `blast` module, no route, no read of `repo-intel` from the MCP server. The stub's signature (`repo`, `pr`) is the only commitment.
- Any `client/` screen, any `e2e/` flow, any change to `reviewer-core/`, any file under `server/src/`.
- A remote or HTTP MCP transport, authentication, deployment, a published package, a build step or a `dist/` entry.
- A sixth tool (`list_repos`, `list_runs`, `cancel_run`, …), MCP resources or prompts.
- Any new or changed API route or shared contract — in particular `GET /runs/:id`, a no-sync PR lookup, or a guard on `completeAgentRun`.
- `outputSchema`, `structuredContent`, a `response_format` parameter, a `suggestion` field in findings.
- Cancelling a run when the MCP client cancels the call; retrying a failed run; running several agents in one call.
- A `start` script, a launcher script, Windows-specific launch handling.
- A dependency-cruiser setup for `mcp/`, a rule in `server/.dependency-cruiser.cjs`, routing `mcp/` to `onion-architecture`, or any edit to that skill.
- Adding the MCP SDK to `server/`; moving `server` test helpers; installing `mcp/` from `scripts/e2e.sh`.
- The edits listed under "For the main session": `implementer` and `doc-writer` do not make them.
- Documentation text beyond the specs and the three new package documents. After the last phase `doc-writer` updates: root `README.md` (the package table at `:12-18`, the architecture diagram, "Quick start" and "Manual steps" for the `mcp/` install, the "Testing & CI" table, the list of package READMEs, a short "MCP server" section); `TESTING.md` ("four independent packages" at `:3`, the suite map, "What each suite covers" — the new `mcp` suite and the driving test in the server integration lane —, "Running locally", and the path-filter convention at `:91-93`); `mcp/README.md` (completed, with a diagram); `server/README.md` (Testing: the integration lane also drives `devdigest-mcp`); `server/docs/architecture.md` (why an external MCP process is an HTTP client: the single-process run invariants).

## Risks
- **The default wait sits exactly on Claude Code's auto-background threshold.** Claude Code auto-backgrounds a main-conversation tool call at 2 minutes (120,000 ms); the wait is 120 s and the lookups before it add to that, so a review that uses the whole wait is backgrounded in a main conversation. The result still arrives, and the timeout result is designed for it. `DEVDIGEST_MCP_WAIT_SECONDS` lowers the wait (an `env` entry in a local `.mcp.json` copy, or the shell environment).
- **The contracts and the package see two Zod copies.** — D15: the two tsconfig paths, the vitest alias, `assertSingleZod()` at startup, and phase 2's test under both runtimes; phase 2 stops if it cannot pass, and Design names the alternative.
- **The path alias behaves differently in another tsx version.** — the resolver was read in 4.22.4 only; `mcp/package-lock.json` pins what is installed, and the startup guard fails loudly rather than degrading.
- **`mcp/node_modules` is missing, so the client cannot start the server or the server integration test cannot spawn it.** — `scripts/dev.sh` installs it; the test fails with the command to run instead of skipping; `server-integration.yml` installs it; the main session adds the gotcha to `server/CLAUDE.md`.
- **A pnpm command run in `mcp/` writes a pnpm lock file or rewrites `node_modules`** (root `INSIGHTS.md:340-355`). — npm only, one command at a time; phase 2 checks for stray pnpm files.
- **A stray stdout write breaks the protocol.** — `boundaries.test.ts` forbids `console.`, `process.stdout` and any new runtime dependency; the launch has no package-manager wrapper; both stdio tests read the stream.
- **The client does not start the server in the repository root, so the relative `args` fail.** — Open question 1; the manual check under Delivery is the first place it would show.
- **A change in `mcp/` now triggers `server`'s integration workflow.** — accepted: it is the lane that proves the two packages still fit, as `reviewer-core/**` triggers `server-unit`.
- **The hand-written JSON-RPC client in the server test drifts from the protocol.** — it sends four message kinds and reads one JSON object per line; `mcp/test/stdio.test.ts` covers the same server with the SDK's client.
- **The documents that list the packages go stale.** — the lists under Out of scope (for `doc-writer`) and "For the main session".
- **The `routing.json` edit is refused to the implementer because it is under `.claude/`.** — then the main session applies the two lines before `/pr-self-review`; nothing else depends on it.
- **The caller retries `run_agent_on_pr` after a timeout and pays twice.** — the timeout is a non-error result that says not to; D9 attaches to the in-flight run.
- **`get_findings` without `run_id` returns an older review while a new run is still going.** — the timeout text gives the exact arguments including `run_id`, and every result carries `run_id`, `agent` and `reviewed_at`.
- **Resolving a PR calls `GET /repos/:id/pulls`, which refreshes the PR list from GitHub when a token is set and can take seconds** (`pulls/service.ts:41-58`). — accepted (Open question 5); the request timeout is 30 s.
- **A run started in a previous API process never completes on the bus, so a wait on it lasts the full bound.** — the status read afterwards reports it as failed; E-RUN-FAILED covers a null error.
- **An API response row violates a shared enum and the whole response is rejected.** — the views pick only the fields used; the failure is E-API-SHAPE, not a crash.
- **Text from a review, a convention or a run error reaches the calling model and may carry instructions.** — inherent to the feature; every such string is capped and error text is sanitised; nothing from it is executed.
- **Spawned server processes outlive a test.** — `main.ts` exits when stdin ends, and the stdio test asserts the exit within 2 s.
- **Integration files skip silently and look green.** — a phase is not closed on a `skipped` `mcp-stdio.it.test.ts` (`server/INSIGHTS.md:187-208`).
- **The planner ran nothing.** — the SDK's API surface, the emitted schemas, the size estimates, the vitest alias and the launch command were derived by reading; phase 2's guard test, phase 3's driving test and phase 6's budget test catch a slip.

## Open questions
Each lists what was verified, what is assumed, and the answer this plan uses.

1. **What is the server's working directory?** Verified: the existing entry uses `npx` with a package name and so never depended on it (`.mcp.json:4-12`); tsx's `bin` and `--tsconfig` exist (D8). Assumed: Claude Code starts a project-scoped stdio server in the repository root. Options: (a) relative `args`, as planned; (b) a launcher that finds its own directory; (c) an environment-variable expansion in `.mcp.json`, if the client supports one. **Recommended: (a)**, confirmed by the manual check under Delivery; fall back to (b) only if it fails.
2. **Folder and package name.** Verified: the existing folders are role names (`server`, `client`, `reviewer-core`, `e2e`) and the packages are `@devdigest/api`, `@devdigest/web`, `@devdigest/reviewer-core`, `@devdigest/e2e`. Options: (a) `mcp/` and `@devdigest/mcp`, with `devdigest-mcp` as the server name clients see; (b) `devdigest-mcp/` and `@devdigest/mcp`. **Recommended: (a).** The choice changes paths in every phase, `.mcp.json`, both workflows and `routing.json`, so settle it before phase 1.
3. **How is an agent identified?** Verified: uuid primary key, no unique name, no slug (`db/schema/agents.ts:8-36`); the seed has five distinct names (`db/seed.ts:327-383`). Options: (a) id only; (b) id, or an exact name when it is unique. **Recommended: (b)** — the lookup against `GET /agents` is needed anyway, and the id stays the documented value.
4. **How much of a finding is returned?** Options: (a) `severity`, `title`, `file`, `line` only; (b) plus `rationale` cut at 240 characters, as planned; (c) a `response_format` parameter adding `suggestion`. **Recommended: (b)** — the reason is what lets the caller act; (c) costs a parameter in every `tools/list`.
5. **A read tool's PR lookup refreshes the PR list from GitHub.** Verified: `PullsService.listForRepo` syncs and upserts when a token is configured and serves stored rows otherwise (`pulls/service.ts:36-76`); it is the only number-to-id source. Options: (a) accept it and keep `readOnlyHint: true`, since nothing the user authored changes; (b) add a no-sync lookup route. **Recommended: (a).**
6. **What enforces the package's boundaries?** Verified: `arch:check` cruises `src` and `../reviewer-core/src` only (`server/package.json:15`), and no dependency-cruiser rule can see a stdout write (`enforcement-dependency-cruiser.md:37-41`). Options: (a) the in-package `boundaries.test.ts`, as planned; (b) also cruise `../mcp/src` from `server` with a rule shaped like `core-stays-pure`, which adds `mcp/**` to `server-unit`'s triggers and to `routing.json`'s `arch_check` paths. **Recommended: (a).**
7. **Which review skills cover `mcp/src`?** Verified: `routing.json` matches nothing under `mcp/`; `onion-architecture` names `server/` and `reviewer-core/` and words several blocking rules around the server's layout (the mock "in `mocks.ts`", `platform/config.ts` as the only reader of `process.env`). Options: (a) `security` only, as planned; (b) also `onion-architecture`, after adapting the skill's text to a client package. **Recommended: (a)** — (b) would produce blocking findings against rules that do not describe this package.

## Delivery

Not phases; done by the user and the main session.

### For the main session
`implementer` and `doc-writer` do not make these edits.

- **Before phase 2 — root `CLAUDE.md`:** line 3, "Four standalone packages" → five; the first row of "Before answering" gains `mcp/`; "Commands": `npm test` / `typecheck` also for `mcp`; "Map": a row `mcp/` · `@devdigest/mcp` · the local `devdigest-mcp` MCP server (stdio), an HTTP client of the API · npm; "Conventions" (`:61`): `reviewer-core` / `e2e` / `mcp` use npm; "Do not touch": add `mcp/package-lock.json` to the lock-file list. Optionally a "Gotchas" line: `devdigest-mcp` needs the API running and `cd mcp && npm ci`.
- **Before phase 2 — the agent files** that enumerate packages and managers: `.claude/agents/planner.md:98`, `.claude/agents/implementer.md:92`, `.claude/agents/test-writer.md:58` (add `mcp` to the npm side), `.claude/agents/plan-verifier.md:52` (add `mcp/test/**` to the test locations). Validate with `claude plugin validate .claude/agents/`.
- **Before recording insights — `.claude/skills/engineering-insights/SKILL.md:43-49`:** a routing row `mcp/**` → `mcp/INSIGHTS.md`.
- **After phase 5 — `server/CLAUDE.md`:** one gotcha line: `test/mcp-stdio.it.test.ts` spawns `devdigest-mcp` from the root `.mcp.json` and needs `cd mcp && npm ci`.
- **After phase 2 — review `mcp/CLAUDE.md`,** which the implementer creates from the content given in that phase.
- **If the implementer reports it could not edit `routing.json`:** apply the two `security` lines of phase 3 before `/pr-self-review`.

### The rest
- **Branch:** `feature/l04-devdigest-mcp`, cut from `origin/main`.
- **Workflow** (`.claude/agents/README.md:60-101`): resolve the open questions (question 2 first); save this plan verbatim as `specs/L04-devdigest-mcp-plan.md` with a row in `specs/README.md`; per phase run `implementer`, then `test-writer` (phase 1 has no tests), and commit the closed phase; then `plan-verifier` and `architecture-reviewer` in parallel — tell the reviewer that `mcp/` is outside the `onion-architecture` skill and follows the conventions in `mcp/CLAUDE.md`; then `doc-writer` with the list under Out of scope; record the insight candidates; run `/pr-self-review` and push only on a pass verdict.
- **Fresh-clone prerequisite:** `./scripts/dev.sh` installs `mcp/`; by hand it is `cd mcp && npm ci`.
- **Manual acceptance in a real client:** with `./scripts/dev.sh` running, reload Claude Code, approve the `devdigest-mcp` server, and check that it connects and lists five tools; ask for the agents, for the findings of `acme/payments-api` PR 482, for its conventions, and for its blast radius (which must come back as "not implemented"); with a provider key set, run one agent on a real imported PR and watch the same run appear in the DevDigest UI, noting whether the call was auto-backgrounded. Stop the API and repeat one call to see E-API-UNREACHABLE. In the VS Code extension the `claude` CLI is not on `PATH` (root `INSIGHTS.md:87-93`).
- **Insights to record afterwards:** the SDK compatibility record's surprises, the working-directory answer, how the shared contracts resolved under tsx and vitest, and whether the 120 s wait was backgrounded in practice.

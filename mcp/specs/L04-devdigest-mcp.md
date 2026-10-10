# L04 — `devdigest-mcp`: the package

**Status:** implemented · **Cross-package spec:** [`../../specs/L04-devdigest-mcp.md`](../../specs/L04-devdigest-mcp.md) · **Plan:** [`../../specs/L04-devdigest-mcp-plan.md`](../../specs/L04-devdigest-mcp-plan.md) (revision 3)

The implementable detail of `devdigest-mcp`: a local, stdio-only MCP server with exactly five
tools, a thin wrapper over the Fastify API. The cross-package spec holds the requirements
(R1–R4, P1–P19, L1–L3), the decisions (D1–D24), the lab conformance table and the ownership;
this file holds the shapes, the texts and the tests.

Paths below are relative to the repository root `/Users/yrazub/Projects/dev-digest` unless they
start with `mcp/` and are described as inside the package.

## Requirement and decision index

The IDs the sections below cite; the full tables are in the cross-package spec.

| IDs | Subject | Where it lands in this file |
|---|---|---|
| R1, D20 | Result, not operation: one `run_agent_on_pr` call creates, waits and returns the verdict | tool 2; Review result |
| R2, P11 | Flat arguments; verb-first snake_case names, identical parameter names | The tools |
| R3, P6, D21 | Concise response, signal only; finding fields and caps | Review result; "Dropped" lists |
| R4 | The error leads onward | Error catalogue |
| P1, P5 | Small startup payload; short instructions with the call order | Server metadata; Tests |
| P2, P3 | Names stand alone; short "when to call" descriptions, descriptions only on four parameters | The tools |
| P4, P15, D6 | No `outputSchema`, no `structuredContent`; no-parameter schema for `list_agents` | Shapes; tool 1 |
| P7, P9 | Bounded results, truncation notes, worst-case size | Limits; Review result |
| P8 | `response_format` not added (D21) | Review result |
| P10, D4 | Bounded wait (120 s), the `status: "running"` result, progress notifications | tool 2 |
| P12 | Annotations: `readOnlyHint: true` on four tools | The tools |
| P13, P14 | Errors as `isError` results; Zod on every input; no secrets or stack traces | Shapes (`executeTool`, `sanitizeText`); Error catalogue |
| P16 | stdout carries only MCP messages | Launch and prerequisites; Tests (`boundaries`) |
| P17, D2, D7, D8 | Thin adapter over the existing API; SDK and tsx with no build step | What already exists; Package files |
| P18, D13 | Driven from `.mcp.json`; the real-API test lives in `server` | Tests |
| P19 | SDK compatibility checked early | SDK compatibility record |
| L1, D16, D18 | A separate launch command, independent of the main scripts | Launch and prerequisites; Package files |
| L2, D17 | Verified with MCP Inspector before Claude Code | Inspector record |
| L3, D19 | Permissions limited by code: `API_ROUTES` | Shapes |
| D1, D14 | Fifth standalone package `mcp/`, npm | Layout of `mcp/` |
| D3, D5, D9 | Lookup by `owner/name`, PR number, agent id or exact name; `get_findings` by `repo` + `pr`; attach to an in-flight run | Lookup rules; tools 2, 3 |
| D10 | `get_blast_radius` is an honest stub | tool 5 |
| D11 | `get_conventions`: accepted by default, `pending` on request | tool 4 |
| D12, D15 | Boundary test; one Zod instance | Package conventions; How the shared contracts resolve |
| D22 | PR lookup may sync from GitHub; tools stay read-only | The routes of `API_ROUTES` |
| D23 | `security` is the only review skill routed to `mcp/src` | Cross-package spec |
| D24 | Missing `mcp/node_modules`: the integration test fails, it does not skip | Tests |

## Launch and prerequisites

| | |
|---|---|
| Prerequisite | `cd mcp && npm ci` — once. No main script installs this package (D18) |
| The API | Must be running (`./scripts/dev.sh`); the server calls it over HTTP, default `http://127.0.0.1:3001` |
| Launch command | `node mcp/bin/devdigest-mcp.mjs` from the repository root, or `node bin/devdigest-mcp.mjs` from `mcp/` (D16). The only way to start it: never wrap it in `npm run`, `npx` or `pnpm` |
| `.mcp.json` entry | `"devdigest-mcp": { "command": "node", "args": ["mcp/bin/devdigest-mcp.mjs"] }`, no `env` key |
| Missing install | The launcher writes `devdigest-mcp: dependencies are not installed. Run: cd mcp && npm ci` to stderr and exits 1 |

Environment variables (read by `main.ts` only, parsed by `loadMcpConfig`):

| Variable | Meaning | Default |
|---|---|---|
| `DEVDIGEST_API_URL` | http(s) URL of the API; a trailing slash is removed | `http://127.0.0.1:3001` |
| `DEVDIGEST_MCP_WAIT_SECONDS` | integer 1..600; how long `run_agent_on_pr` waits | `120` |

An invalid value makes `main.ts` write one stderr line naming the variable and exit with code 1.
stdout carries only MCP messages; all logging goes to stderr.

## What already exists

Every route is an existing route of the API; no route and no shared contract is added. Routes
declare no response schema, so a response is whatever the repository mapped, and the client
parses only the fields it uses (the views below).

### How a review runs today (verified)

1. `POST /pulls/:id/review` with `{ agentId }` → `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews: [] }`, returned before any model call (`server/src/modules/reviews/routes.ts:27-44`, `service.ts:103-138`). Rate limit 10 per minute on this route (`routes.ts:29`), 120 per minute globally (`server/src/app.ts:98-100`).
2. The executor loads the diff, derives the intent once, then runs the agents one after another (`run-executor.ts:105-148`). On success it inserts the review and findings (`:272-284`), writes `status: 'done'` (`:297-309`), saves the trace and completes the run on the bus (`:356-357`). On failure or cancel it writes `failed` / `cancelled` with the error text and completes the bus (`:360-383`).
3. Observation: `GET /runs/:id/events` is an SSE stream that replays the buffer, streams new events and ends when the run completes; it is exempt from rate limiting (`routes.ts:48-92`). `GET /pulls/:id/runs` lists a PR's runs with `status` and `error`, newest first (`routes.ts:101-104`, `run.repo.ts:41-71`). `GET /pulls/:id/reviews` lists reviews with findings, newest first, each carrying `run_id` (`routes.ts:129-132`, `review.repo.ts:59-75`).
4. No route addresses a run without its PR id (`routes.ts:10-17`, `:95-149`).

So a run is asynchronous: an id now, events over SSE, the result by a second read.

Architecture constraints this rests on: a review run executes inside the API process and nowhere
else; the run bus (`server/src/platform/sse.ts:19-25`, `:118`) is in memory and per process; on
boot the API marks every `running` row `failed` (`server/src/app.ts:79-86`,
`run.repo.ts:107-114`); `server/docs/architecture.md:127-134` states the single-instance
assumption. A failed run has zeroed counts and `null` score, cost and breakdown by design; a
cancelled single-pass run may still end `done`. The tools read the run's final status after the
event stream ends and never infer it.

### The routes of `API_ROUTES`

| Port method | Route | View (shared contract it is derived from) |
|---|---|---|
| `listAgents` | `GET /agents` | `ApiAgent` ← `Agent` |
| `listRepos` | `GET /repos` | `ApiRepo` ← `Repo` |
| `listPulls` | `GET /repos/:id/pulls` | `ApiPull` ← `PrMeta` (refreshes the PR list from GitHub when a token is configured, `server/src/modules/pulls/service.ts:36-76`; D22) |
| `listRuns` | `GET /pulls/:id/runs` | `ApiRun` ← `RunSummary` |
| `listReviews` | `GET /pulls/:id/reviews` | `ApiReview` ← `ReviewRecord`, with `ApiFinding` ← `FindingRecord` |
| `getConventions` | `GET /repos/:id/conventions` | `ApiConventionList` ← `ConventionList`, with `ApiConvention` ← `ConventionCandidate` |
| `startReview` | `POST /pulls/:id/review` (body `{ agentId }`) | `ReviewRunResponse.pick({ runs: true })` |
| `waitForRun` | `GET /runs/:id/events` (SSE) | `RunEvent.pick({ msg: true })` |

`repos` is unique on `(workspace_id, full_name)` (`server/src/db/schema/repos.ts:22`); agents
have a uuid and no unique name or slug (`server/src/db/schema/agents.ts:8-36`); the agent is
resolved against `GET /agents` because `RunRequest.agentId` is a plain string
(`contracts/platform.ts:275-278`) compared to a uuid column (`agents/repository.ts:65-71`).

## Layout of `mcp/`

| Path | Holds | Phase |
|---|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | the package | 2 |
| `CLAUDE.md`, `README.md`, `INSIGHTS.md`, `specs/` | the package's documents | 1, 2 |
| `bin/devdigest-mcp.mjs` | the launcher — the separate launch command | 2 |
| `src/constants.ts` | server name and version, the instructions text, every limit and cap | 2 |
| `src/single-zod.ts` | `assertSingleZod()` | 2 |
| `src/main.ts` | the process entry and composition root | 2, 3, 4 |
| `src/config.ts` | `McpConfig`, `loadMcpConfig(env)` | 3 |
| `src/tool.ts` | `ToolDef`, `ToolDeps`, `ToolContext`, `ToolFailure`, `executeTool`, `toolOk`, `toolError`, `sanitizeText` | 3, 4 |
| `src/server.ts` | `TOOLS` (in call order) and `createMcpServer(deps)` | 3, 5, 6 |
| `src/ports.ts` | `DevDigestApi`, `API_ROUTES`, the API view schemas, `ApiError` | 4 |
| `src/api-client.ts` | `HttpDevDigestApi implements DevDigestApi` | 4 |
| `src/mocks.ts` | `MockDevDigestApi implements DevDigestApi` | 4 |
| `src/resolve.ts` | `resolveRepo`, `resolvePull`, `resolveAgent` | 5 |
| `src/review-view.ts` | `toReviewView` (pure) | 5 |
| `src/tools/list-agents.ts` · `get-conventions.ts` · `get-findings.ts` · `run-agent-on-pr.ts` · `get-blast-radius.ts` | one `ToolDef` each | 5, 5, 5, 6, 3 |
| `test/*.test.ts` | the hermetic suite | 2–6 |

Package conventions (written in `mcp/CLAUDE.md`, checked by `mcp/test/boundaries.test.ts`, D12):

1. The HTTP client implements a port, `DevDigestApi`, and so does its mock.
2. `new` of the client and of the transport appears only in `mcp/src/main.ts`.
3. Every input is parsed where it enters — tool arguments, environment variables, every API response, every SSE frame.
4. Only `main.ts` (and the launcher) touches `process.*`.
5. `fetch` is called only in `api-client.ts`, through the routes of `API_ROUTES`.

## Package files

```jsonc
// mcp/package.json — written by hand; the lock file comes from `npm install`
{
  "name": "@devdigest/mcp", "version": "0.0.0", "private": true, "type": "module",
  "description": "devdigest-mcp — a local stdio MCP server; an HTTP client of the DevDigest API.",
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.32.1", "tsx": "^4.19.2", "zod": "^3.25.76" },
  "devDependencies": { "@types/node": "^22.10.0", "typescript": "^5.7.2", "vitest": "^2.1.8" }
}
// No "start" script (D16). tsx is a runtime dependency: it is what runs the server.

// mcp/tsconfig.json — the compiler options of reviewer-core/tsconfig.json, with these paths
"paths": {
  "@devdigest/shared": ["../server/src/vendor/shared/index.ts"],
  "@devdigest/shared/*": ["../server/src/vendor/shared/*"],
  "zod": ["./node_modules/zod"]
},
"include": ["src/**/*.ts"]
```

```js
// mcp/bin/devdigest-mcp.mjs — plain JavaScript, never compiled; the only launch path
// 1. dynamically import 'tsx/esm/api'. If that fails: one stderr line
//    "devdigest-mcp: dependencies are not installed. Run: cd mcp && npm ci" and exit code 1.
// 2. register({ tsconfig: <absolute path of ../tsconfig.json, from import.meta.url> })
// 3. await import(<file URL of ../src/main.ts, from import.meta.url>)
// It never writes to stdout and reads no argument and no environment variable.
```

- `mcp/vitest.config.ts`: `resolve.alias` as an array — `@devdigest/shared` → `../server/src/vendor/shared`, and the exact specifier `zod` (`find: /^zod$/`) → `node_modules/zod/index.js`; `test.include: ['test/**/*.test.ts']`, `environment: 'node'`, `globals: true`, `testTimeout: 30_000`.
- `mcp/.gitignore`: `node_modules/`, `dist/`, and the stray-output guards of `reviewer-core/.gitignore:5-7`.

## How the shared contracts resolve

The eleven files of `server/src/vendor/shared` import only the bare specifier `zod`. Left alone,
a runtime resolves that from the file's own location, `server/node_modules/zod` — a second copy.

- **Type-check (`tsc`):** `paths` apply to every file of the program, so `zod` in the contract files maps to the directory `mcp/node_modules/zod`, resolved through its `package.json` types. A mapping to the file `index.js` does not type-check: `tsc` takes a `paths` substitution that exists as a file literally and does not look for the sibling `index.d.ts` (TS7016 on every contract file). `reviewer-core/tsconfig.json:24-25` uses the directory target.
- **Runtime (the launcher, D16):** `register({ tsconfig })` loads tsx's ESM hooks with the package's tsconfig. tsx 4.22.4 applies tsconfig path aliases to every importer whose URL does not contain `/node_modules/` and tries each mapped path as a file URL. Checked by running it in phase 2: the directory target `./node_modules/zod` resolves under tsx as well, so the mapping is the directory, not the file `index.js` (see the compatibility record). The SDK's own imports come from inside `node_modules` and resolve normally to the same package.
- **Tests (`vitest`):** aliases for `@devdigest/shared` (as `reviewer-core/vitest.config.ts:9`) and for exactly `zod` to the same file.
- **Guard:** `assertSingleZod()` checks `Severity instanceof z.ZodType`, with `Severity` from `@devdigest/shared` and `z` from the package's `zod`. `main.ts` calls it first and exits 1 with a stderr line when it fails. Phase 2 proves it under vitest and through the launcher.
- **If the in-process form does not apply the aliases** (phase 2): the launcher may instead start tsx's CLI as a child — `tsx/cli` with `--tsconfig <absolute path>` and the entry, standard streams inherited, exit code and `SIGINT` / `SIGTERM` forwarded. Which form is used goes into the compatibility record; the tests do not depend on it.
- **If neither form passes the guard** (phase 2 stop rule): deriving views from a sibling package is not workable. The alternative that keeps one definition is type-only imports (`import type { Agent, … } from '@devdigest/shared'`, erased at runtime, the way `client/` consumes the contracts) with parsers declared in `mcp/src/ports.ts` and a compile-time check that each contract type is assignable to its parser's input. That changes `ports.ts` and goes back through `planner`.

## Shapes

```ts
// single-zod.ts
export function assertSingleZod(): void;   // throws when `Severity instanceof z.ZodType` is false; the message says to start through mcp/bin/devdigest-mcp.mjs

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
}   // `route` is an API_ROUTES value, e.g. 'GET /pulls/:id/reviews'

export interface DevDigestApi {
  listAgents(): Promise<ApiAgent[]>;
  listRepos(): Promise<ApiRepo[]>;
  listPulls(repoId: string): Promise<ApiPull[]>;
  listRuns(prId: string): Promise<ApiRun[]>;                       // newest first
  listReviews(prId: string): Promise<ApiReview[]>;                 // newest first
  getConventions(repoId: string): Promise<ApiConventionList>;
  startReview(prId: string, agentId: string): Promise<{ run_id: string }>;   // body { agentId }
  waitForRun(runId: string, opts: { timeoutMs: number; signal?: AbortSignal; onEvent?: (message: string) => void }): Promise<'ended' | 'timeout'>;  // SSE; never throws
}

// The allow-list (D19): everything the process can ask the API for.
export const API_ROUTES = {
  listAgents:     'GET /agents',
  listRepos:      'GET /repos',
  listPulls:      'GET /repos/:id/pulls',
  listRuns:       'GET /pulls/:id/runs',
  listReviews:    'GET /pulls/:id/reviews',
  getConventions: 'GET /repos/:id/conventions',
  startReview:    'POST /pulls/:id/review',
  waitForRun:     'GET /runs/:id/events',
} as const satisfies Record<keyof DevDigestApi, string>;

// api-client.ts
export class HttpDevDigestApi implements DevDigestApi {
  constructor(opts: { baseUrl: string; fetch?: typeof fetch; requestTimeoutMs?: number });   // default timeout 30_000
}   // public surface: the eight port methods and nothing else; the request helper is private and takes an API_ROUTES key

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
- `HttpDevDigestApi`: the `:id` of a route is filled with an id that came from an API response, through `encodeURIComponent`. No tool argument is ever written into a URL.
- Routes deliberately not in the allow-list, so no tool can reach them: `DELETE /runs/:id`, `POST /runs/:id/cancel`, `DELETE /reviews/:id`, `POST /findings/:id/(accept|dismiss)`, every `/agents` write, `/settings`, `POST /repos`, `DELETE /repos/:id`, `POST /pulls/:id/comments`, `POST /repos/:id/conventions/extract`, `PATCH /conventions/:id`, the skill routes.

## Limits

All in `src/constants.ts`: `DEFAULT_LIMIT = 20`, `MAX_LIMIT = 50`, `MAX_TITLE = 120`,
`MAX_RATIONALE = 240`, `MAX_SUMMARY = 600`, `MAX_DESCRIPTION = 200`, `MAX_CONVENTIONS = 50`,
`MAX_AGENTS = 50`, `MAX_LISTED = 10` (names or numbers quoted in an error), `MAX_ERROR_TEXT = 300`,
`REQUEST_TIMEOUT_MS = 30_000`, `DEFAULT_WAIT_SECONDS = 120`. Severity order is `Severity.options`
from `@devdigest/shared` (`CRITICAL`, `WARNING`, `SUGGESTION`). A cut string ends with `…`. Worst
case at `limit: 50` is about 32,000 characters (about 8,000 tokens): under Claude Code's
10,000-token warning, its 25,000-token limit and its 50,000-character spill.

## Server metadata

- `serverInfo.name`: `devdigest-mcp`.
- `instructions` (as shipped, at most 500 characters; if the exact count exceeds 500, shorten the first sentence, not the guidance):

  `DevDigest reviews GitHub pull requests with reviewer agents. repo is owner/name; pr is the PR number. To review, call run_agent_on_pr: it waits and returns the verdict and findings (spends LLM credits). Call list_agents first only when you do not know the agent's id or exact name. If it answers status "running", do not start it again: call get_findings with the returned run_id. To read an existing review, call get_findings. The DevDigest API must be running locally.`

## The tools

Parameter names are identical wherever they recur (`repo`, `pr`, `run_id`). Every property is a
scalar or an enum. Only `repo`, `pr`, `agent` and `run_id` carry a description.

### 1. `list_agents` — read-only (`readOnlyHint: true`)

- Description: `List the reviewer agents configured in DevDigest. Call it when you need an agent's id or exact name for run_agent_on_pr.`
- Input: none. Schema target: `{ "type": "object", "additionalProperties": false }`.
- Output: `{"agents":[{"id","name","description","model","enabled"}]}` sorted by `name`; `description` cut at 200; `model` is `<provider>/<model>`; at most 50, with a `note` when cut. Empty list: `agents: []` and `note: "No agents are configured. Create one in the DevDigest UI (Agents)."`.
- Dropped from `Agent`: `system_prompt`, `output_schema`, `version`, `strategy`, `ci_fail_on`, `repo_intel`, `skill_count`.
- Errors: the API errors below.

### 2. `run_agent_on_pr` — the only write tool (`readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true`)

- Description: `Run one reviewer agent on a pull request, wait for it to finish, and return its verdict and findings. Starts a paid LLM run; to read a review that already exists, call get_findings instead.`
- Input: `repo` (string, "owner/name") · `pr` (integer ≥ 1, "pull request number"; a numeric string is accepted) · `agent` (string, "agent id or exact name"). All required.
- Steps: resolve repo → PR → agent; `listRuns`: if a run of that agent is `running`, use its id (D9), else `startReview`; `waitForRun` with `config.waitMs`, `ctx.signal`, `ctx.progress`; `listRuns` again and branch on the run's status. `done` → `listReviews` → `toReviewView` with `DEFAULT_LIMIT` (plus `attached: true` when it joined a run); `running` → the `status: "running"` payload with `waited_seconds` from `config.waitMs`; `failed` → E-RUN-FAILED; `cancelled` → E-RUN-CANCELLED; `done` without a review, or a missing run row → E-RUN-NO-REVIEW. Nothing is started when a lookup fails. An aborted `ctx.signal` ends the call without cancelling the run.
- Output, `done`: the review result below, plus `"attached": true` when it joined an in-flight run.
- Output, still `running` after the wait (not an error, so the caller does not retry the write): `{"status":"running","run_id","agent","waited_seconds","next":"The review is still running. Do not call run_agent_on_pr again. Call get_findings with repo \"<repo>\", pr <n>, run_id \"<id>\" in about 30 seconds."}`.
- Errors: E-REPO-FORMAT, E-REPO-UNKNOWN, E-PR-UNKNOWN, E-AGENT-UNKNOWN, E-AGENT-AMBIGUOUS, E-RUN-FAILED, E-RUN-CANCELLED, E-RUN-NO-REVIEW, the API errors.

### 3. `get_findings` — read-only

- Description: `Return the verdict and findings of a finished review of a pull request: the latest one, or the run given by run_id. Never starts a review.`
- Input: `repo`, `pr` (required, as above) · `run_id` (string, optional, "run to read; default: latest review") · `min_severity` (enum `CRITICAL` | `WARNING` | `SUGGESTION`, optional; default: all) · `limit` (integer 1–50, default 20; a numeric string is accepted).
- Selection: `listReviews`, keeping `kind === 'review'`. Without `run_id`: the newest. With `run_id`: the review whose `run_id` matches. When none is found, `listRuns` explains why (E-NO-REVIEW, E-RUN-RUNNING, E-RUN-FAILED, E-RUN-CANCELLED, E-RUN-UNKNOWN or E-RUN-NO-REVIEW).
- Output: the review result below.
- Errors: E-REPO-FORMAT, E-REPO-UNKNOWN, E-PR-UNKNOWN, E-NO-REVIEW, E-RUN-RUNNING, E-RUN-FAILED, E-RUN-CANCELLED, E-RUN-UNKNOWN, E-RUN-NO-REVIEW, the API errors.

### Review result (tools 2 and 3)

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

### 4. `get_conventions` — read-only

- Description: `Return the coding conventions DevDigest extracted from a repository and the user accepted. Call it before writing or reviewing code in that repository.`
- Input: `repo` (required) · `status` (enum `accepted` | `pending`, default `accepted`; derived from the shared `ConventionStatus` without `rejected`).
- Output: `{"repo","status","conventions":[{"category","rule","evidence"}],"last_scan_at"}` in the API's order; `evidence` is `path:start` or `path:start-end`; at most 50, with a `note` when cut.
- Notes instead of errors: nothing with the requested status but other candidates exist → `"No accepted conventions yet; <k> candidates are pending review in DevDigest (Skills Lab → Conventions). Call get_conventions with status \"pending\" to read them as unconfirmed proposals."`; never scanned → `"This repository has not been scanned for conventions. Run a scan in DevDigest (Skills Lab → Conventions), accept the rules that are right, then call get_conventions again."`.
- Dropped from `ConventionCandidate`: `id`, `evidence_snippet`, `evidence_url`, `confidence`, `status`.
- Errors: E-REPO-FORMAT, E-REPO-UNKNOWN, the API errors.

### 5. `get_blast_radius` — stub (`readOnlyHint: true`)

- Description: `Impact map of a pull request: the symbols and callers its changes reach. Not implemented yet: always returns an error, never data. Do not estimate the result.`
- Input: `repo`, `pr` (required, as above) — the signature the homework will keep.
- Output: always `isError: true` with E-BLAST. No API call, no lookup.

## Error catalogue

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

E-API-UNREACHABLE names `./scripts/dev.sh` because that script starts the **API**; it does not
start or install the MCP server (D18). A missing install of the MCP server itself is reported by
the launcher, on stderr, before the protocol starts.

`sanitizeText` collapses whitespace to single spaces, masks token-like substrings (a run of 16 or
more characters from `[A-Za-z0-9_-]` after one of the prefixes `sk-`, `sk_`, `ghp_`, `gho_`,
`github_pat_`, `xox`) with `***`, and cuts at `max`. It is applied to every string that comes from
the API into an error.

## Lookup rules

`resolve.ts`: `repo` is trimmed, a leading `https://github.com/` and a trailing `.git` or `/` are
removed, and it is compared case-insensitively with `full_name`; anything that is not two
non-empty segments is E-REPO-FORMAT. `agent` matches an `id` exactly, else a `name`
case-insensitively; no match is E-AGENT-UNKNOWN, several are E-AGENT-AMBIGUOUS. A disabled agent
resolves like any other (the API runs it, `reviews/service.ts:51-54`). Listed names are sorted,
listed PR numbers are highest first, both cut at `MAX_LISTED`; a pull without an `id` is ignored.

## Tests

One suite per package. The hermetic suite is `mcp/test/**/*.test.ts` (`cd mcp && npm test`); the
real-API driving test is in `server`'s integration lane. Written by the `test-writer`, one phase
at a time; this table is what each file pins.

| File | Lane | Phase | Pins |
|---|---|---|---|
| `mcp/test/single-zod.test.ts` | hermetic | 2 | `assertSingleZod()` passes under vitest; `Severity` is an instance of the package's `z.ZodEnum`; `SEVERITY_ORDER`; the launcher exits 0, writes nothing to stdout and prints no guard failure from the repository root, from `mcp/` and by absolute path from the system temporary directory; a launcher copy with no `node_modules` exits 1 with `cd mcp && npm ci` on stderr; the instructions text (≤ 500 characters, names the three tools, contains "only when") |
| `mcp/test/config.test.ts` | hermetic | 3 | `loadMcpConfig` defaults, trailing slash, rejected URLs and wait values, errors naming the variable |
| `mcp/test/tool.test.ts` | hermetic | 3, 4 | `toolOk` (one text block, no `structuredContent`); `executeTool` valid / invalid arguments (E-ARGS), `ToolFailure`, unexpected throw (E-INTERNAL, no message, path or stack, detail to `deps.log`); `sanitizeText`; the stub (E-BLAST); phase 4: `toolError` for each `ApiError` kind, E-API-UNREACHABLE names the URL and `./scripts/dev.sh`, masking, 429 → E-API-RATE |
| `mcp/test/stdio.test.ts` | hermetic | 3, 5, 6 | the `.mcp.json` entry (`node`, the single argument `mcp/bin/devdigest-mcp.mjs`, no absolute path, no `KEY` / `TOKEN` / `SECRET` env name); `initialize`, `tools/list`, `tools/call get_blast_radius` over the SDK's client; a clean stdout and the `devdigest-mcp ready` stderr line; exit within 2 s after disconnect; phase 5: `list_agents` against a local `node:http` stub (no system prompt in the result, only `GET` requests) and against a closed port (E-API-UNREACHABLE); phase 6: exactly five tools in the final order, no `list_prs` / `list_repos`, the budgets (`tools/list` ≤ 4,000 characters, instructions ≤ 500, each description ≤ 240 and without `{`), no `outputSchema`, flat inputs, `list_agents` has no properties, annotations, descriptions only on `repo`, `pr`, `agent`, `run_id` |
| `mcp/test/boundaries.test.ts` | hermetic | 3, 4 | the checks of D12: allowed imports under `src/`; no `console.` or `process.stdout` under `src/` or `bin/`; `process.` only in `src/main.ts` and the launcher; the launcher imports only `node:` builtins and `tsx`; the three `paths` keys; the three runtime dependencies; no `start` script; phase 4: `fetch(` only in `src/api-client.ts`; `main.ts`, `server.ts` and the tool files do not import `./mocks` |
| `mcp/test/api-client.test.ts` | hermetic | 4 | each request method sends the method and path of its `API_ROUTES` entry; view projection; `startReview` body; every `ApiError` kind; id percent-encoding; `waitForRun` (frames across chunk boundaries, timeout, rejected fetch and 500 resolve `'ended'`, abort, non-JSON frame skipped); **L3**: exactly eight routes, one `POST` and it is `/pulls/:id/review`, no `DELETE` / `PUT` / `PATCH`, the stub `fetch` saw only those eight pairs, the prototype holds exactly the eight port names |
| `mcp/test/review-view.test.ts` | hermetic | 5 | sorting, dismissed findings, `counts`, `min_severity`, `limit` with `truncated` and `note`, `end_line`, caps, `null` fields, the 36,000-character worst case, no dropped field |
| `mcp/test/read-tools.test.ts` | hermetic | 5 | `list_agents`, `get_conventions` and `get_findings` through `executeTool` with `MockDevDigestApi`: ordering, notes, each run-state error, the lookup rules, `ApiError('unreachable')`; **L3**: no read tool calls `startReview` or `waitForRun` |
| `mcp/test/run-agent.test.ts` | hermetic | 6 | `run_agent_on_pr`: the call order, resolution by exact name with no prior `list_agents`, attach to a running run (D9), the `status: "running"` result, each failure text, nothing started on a failed lookup, progress events, the 120,000 ms default wait |
| `server/test/mcp-stdio.it.test.ts` (+ helper in `server/test/helpers/`) | server integration | 5, 6 | the real server spawned from `.mcp.json` against `buildApp` and a seeded Postgres, over newline-delimited JSON-RPC: clean stdout, `list_agents` (five seeded names, no prompt text), `get_findings` for `acme/payments-api` PR 482, `get_conventions`, E-REPO-UNKNOWN / E-PR-UNKNOWN, no new `agent_runs` row from the read tools; phase 6: `run_agent_on_pr` by agent name returns `done` with one grounded finding and one `agent_runs` row, `get_findings` with the returned `run_id`, E-AGENT-UNKNOWN creates no row, progress notifications when supported. When `mcp/node_modules` is missing it **fails** with "devdigest-mcp is not installed: run `cd mcp && npm ci`" and never skips for that reason (D24) |

A phase is not closed on a run that prints `skipped` for `mcp-stdio.it.test.ts`; rerun the lanes
separately: `pnpm exec vitest run --exclude '**/*.it.test.ts'` and
`pnpm exec vitest run .it.test --no-file-parallelism`.

## Acceptance

Package-level checklist; the cross-package one is in
[`../../specs/L04-devdigest-mcp.md`](../../specs/L04-devdigest-mcp.md).

- [ ] `cd mcp && npm ci && npm run typecheck && npm test` pass; `mcp/` holds `package-lock.json` and no pnpm file.
- [ ] `npm ls zod` shows one Zod (3.25.x), and `assertSingleZod()` passes under vitest and through the launcher.
- [ ] `node mcp/bin/devdigest-mcp.mjs` starts the server from the repository root, from `mcp/` and from an unrelated directory; without installed dependencies it exits 1 and says `cd mcp && npm ci`.
- [ ] `tools/list` holds exactly `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`, in that order, with flat inputs and no `outputSchema`; the `tools/list` result is at most 4,000 characters and `instructions` at most 500.
- [ ] `HttpDevDigestApi` and `MockDevDigestApi` both `implements DevDigestApi`; `API_ROUTES` has eight entries and one write; `fetch` is called in `src/api-client.ts` only.
- [ ] Nothing but JSON-RPC appears on stdout; logging goes to stderr.
- [ ] `get_blast_radius` answers E-BLAST and makes no API call.
- [ ] `server/test/mcp-stdio.it.test.ts` ran, not skipped.
- [ ] No file under `server/src/`, `scripts/`, `client/`, `reviewer-core/` or `e2e/` changed.
- [ ] The "SDK compatibility record" and the "Inspector record" below are filled.

## SDK compatibility record

Static half, filled in phase 2 (2026-10-10). The runtime half (what a client sees over the wire)
was filled in phase 3 (2026-10-10), see "Runtime half" below.

### Installed versions

| | |
|---|---|
| SDK | `@modelcontextprotocol/sdk` 1.32.1 (`^1.32.1` in `package.json`) |
| Zod range of the SDK | `^3.25 || ^4.0`, in both `peerDependencies` and `dependencies` |
| Resolved `zod` | one copy, 3.25.76: `npm ls zod` shows the SDK's `zod` and `zod-to-json-schema`'s `zod` both `deduped` to the package's own |
| Other tools | `tsx` 4.23.15, `typescript` 5.9.3, `vitest` 2.1.9 |
| Stray files | `mcp/` holds `package-lock.json` and no `pnpm-lock.yaml` or `pnpm-workspace.yaml`; no change outside `mcp/` |
| `npm audit` | 6 findings, all in the `vitest` 2 dev tree (`vite`, `esbuild`, `tinypool`); `npm audit --omit=dev` reports 0 |

### Import paths (the SDK's `exports` map has `./client`, `./server` and a `./*` wildcard onto `dist/esm/*`)

| Piece | Import |
|---|---|
| Server class with tool registration (`McpServer`) | `@modelcontextprotocol/sdk/server/mcp.js` |
| Stdio server transport (`StdioServerTransport`) | `@modelcontextprotocol/sdk/server/stdio.js` |
| Client (`Client`) | `@modelcontextprotocol/sdk/client/index.js` |
| Stdio client transport (`StdioClientTransport`) | `@modelcontextprotocol/sdk/client/stdio.js` |
| In-memory transport (`InMemoryTransport`) | `@modelcontextprotocol/sdk/inMemory.js` |

### API facts read from the installed typings

- Tool registration: `McpServer.registerTool(name, config, cb)`, where `config` is
  `{ title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }`; `inputSchema` is a Zod
  raw shape (or a schema) and `annotations` is `ToolAnnotations`. `server.tool(...)` is `@deprecated`.
  With an `inputSchema` the callback is `(args, extra)`; without one it is `(extra)`.
- `new McpServer(serverInfo: Implementation, options?: McpServerOptions)`; `McpServerOptions` extends
  `ServerOptions`, which takes `instructions?: string`. So the instructions text goes in the options.
- A tool callback's `extra` (`RequestHandlerExtra`) carries `signal: AbortSignal` (aborted when the
  sender cancels the request), `_meta?: RequestMeta` whose `progressToken?: string | number` is the
  request's progress token, `requestId`, and `sendNotification(notification)`. So all three are available.

### One Zod

`npm ls zod` shows one version. The proof that the contracts and the package use the same copy is
`assertSingleZod()` (`Severity instanceof z.ZodType`):

| Run | Result |
|---|---|
| through the launcher (alias applied) | passes |
| negative control: tsx CLI with a tsconfig that maps `@devdigest/shared` but not `zod` | exits 1, the guard message on stderr (the contracts resolve `server/node_modules/zod`) |

Deviation from the design text: the `zod` entry of `tsconfig.json` `paths` is the directory
`./node_modules/zod`, not the file `./node_modules/zod/index.js`. `tsc` does not look for a
sibling `.d.ts` of a mapped file (TS7016 on every contract file), while the directory form
type-checks and also resolves under tsx (guard passes). The `vitest` alias keeps the file target.

### Launcher form

The **in-process form** is used: `register({ tsconfig })` from `tsx/esm/api`, then `import()` of
`src/main.ts`. The path aliases apply; the child-process fallback is not needed.

| Run | Exit | stdout | stderr |
|---|---|---|---|
| `node mcp/bin/devdigest-mcp.mjs`, working directory = repository root | 0 | empty | `devdigest-mcp: no transport yet` |
| `node bin/devdigest-mcp.mjs`, working directory = `mcp/` | 0 | empty | `devdigest-mcp: no transport yet` |
| `node /…/mcp/bin/devdigest-mcp.mjs`, working directory = an unrelated temporary directory | 0 | empty | `devdigest-mcp: no transport yet` |
| a copy of the launcher in a directory with no `node_modules` | 1 | empty | `devdigest-mcp: dependencies are not installed. Run: cd mcp && npm ci` |

### Runtime half (phase 3, observed over stdio)

Driven with the SDK's `Client` and `StdioClientTransport`, spawning the `command` + `args` read out
of `.mcp.json` (`node mcp/bin/devdigest-mcp.mjs`, working directory = repository root, `DEVDIGEST_API_URL`
pointing at a closed port), plus an in-memory pair around `createMcpServer` with two throwaway tools.
The launcher rows above show the phase-2 placeholder line; since phase 3 the startup line is
`devdigest-mcp ready (API <apiUrl>)` and the process waits on stdin.

| Question | Observed |
|---|---|
| `initialize` | `serverInfo` = `{"name":"devdigest-mcp","version":"0.0.0"}`; `instructions` = the shipped text (verbatim); capabilities `{"tools":{"listChanged":true}}` |
| `tools/list` entry of `get_blast_radius` | `description` as in the spec; `inputSchema` = `{"type":"object","properties":{"repo":{"type":"string","description":"owner/name"},"pr":{"type":"integer","minimum":1,"description":"pull request number"}},"required":["repo","pr"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`; `annotations` = `{"readOnlyHint":true}`; no `outputSchema`; the SDK adds `"execution":{"taskSupport":"forbidden"}` |
| Input schema of a tool with no parameters | Registered with the bare shape `{}`: `{"type":"object","properties":{}}` — **no** `additionalProperties: false`. Registered with `z.object({}).strict()`: `{"type":"object","properties":{},"additionalProperties":false}`. `server.ts` therefore registers `z.object(def.inputShape).strict()` for every tool, so the `list_agents` target is reachable (checked with a throwaway no-argument tool; the real tool arrives in phase 5) |
| Invalid arguments (wrong type, missing field, unknown key) | Answered **by the SDK**, before the handler runs: a result with `isError: true` (not a JSON-RPC error) and the text `MCP error -32602: Input validation error: Invalid arguments for tool <name>: <zod message>` (e.g. `Expected number, received string at pr`, `Required at pr`, `Unrecognized key(s) in object: 'x'`). `executeTool`'s own E-ARGS text is reached only when `executeTool` is called directly, and is the second line of defence. With the bare shape (not strict) the SDK silently dropped an unknown key; with the strict object it rejects it |
| Text-only result with `isError: true` | Passes unchanged: `{"content":[{"type":"text","text":"<E-BLAST>"}],"isError":true}` |
| Unexpected throw | `isError: true`, E-INTERNAL text with no original message, path or stack; the detail (`Error: boom at /Users/x` + stack) went to `deps.log` |
| Progress notifications | Reach the client: with `onprogress` set, two `ctx.progress(...)` calls arrived as `{"progress":1,"message":"step one"}` and `{"progress":2,"message":"step two"}`; without a progress token nothing is sent. The handler's `ctx.signal` is present |
| stdin ends / client disconnects | The SDK's stdio transport does not report the end of stdin as a close; `main.ts` listens to stdin `end` / `close`, `SIGINT`, `SIGTERM` and the server's `onclose`, and exits 0. Measured: closed stdin (`</dev/null`) exits 0 at once, with empty stdout and the `ready` line on stderr; `Client.close()` ends the process within the 300 ms the script waited; `SIGTERM` exits 0 |
| Bad environment | `DEVDIGEST_MCP_WAIT_SECONDS=abc` and `DEVDIGEST_API_URL=ftp://x` each exit 1 with one stderr line naming the variable |

## Inspector record

Filled in by the main session after phase 3 and after phase 6 (D17).

### Phase 3 — one tool (2026-10-10)

- **Inspector:** `@modelcontextprotocol/inspector` 2.10.1, run through `npx` in CLI mode; not a
  dependency of this package. Options taken from `--cli --help`: the server command comes right
  after `--cli`, before `--method`.
- **Working directory:** the repository root.
- **List:** `npx -y @modelcontextprotocol/inspector@2.10.1 --cli node mcp/bin/devdigest-mcp.mjs --method tools/list --strict`
  — exit 0, no schema-portability problem reported. It listed one tool, `get_blast_radius`, with
  the shipped description, `annotations: { readOnlyHint: true }`, no `outputSchema`, and the input
  schema `{ type: "object", properties: { repo: { type: "string", description: "owner/name" },
  pr: { type: "integer", minimum: 1, description: "pull request number" } }, required: ["repo",
  "pr"], additionalProperties: false }` (draft-07). The SDK adds
  `execution: { taskSupport: "forbidden" }`.
- **Call:** `npx -y @modelcontextprotocol/inspector@2.10.1 --cli node mcp/bin/devdigest-mcp.mjs --method tools/call --tool-name get_blast_radius --tool-arg repo=acme/payments-api pr=482`
  — the result is `isError: true` with the E-BLAST text ("get_blast_radius is not implemented yet
  in this DevDigest build: no impact data exists. …"). Inspector exits 5 (`tool_is_error`) for an
  `isError` result, which is the expected outcome for the stub.
- **stderr of the server in both runs:** `devdigest-mcp ready (API http://127.0.0.1:3001)`.
- The API was not running; the stub calls nothing, so it is not needed for this check.

### Phase 6 — all five tools (2026-10-10)

- **Inspector:** `@modelcontextprotocol/inspector` 2.10.1 through `npx`, CLI mode, from the
  repository root, same invocation form as the phase 3 entry.
- **List:** `npx -y @modelcontextprotocol/inspector@2.10.1 --cli node mcp/bin/devdigest-mcp.mjs --method tools/list --strict`
  — exit 0, no schema-portability problem reported. Five tools, in this order, none with an
  `outputSchema`, every input schema closed (`additionalProperties: false`):

  | Tool | Annotations | Properties | Required |
  |---|---|---|---|
  | `list_agents` | `readOnlyHint: true` | none | none |
  | `run_agent_on_pr` | `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true` | `repo` string, `pr` integer, `agent` string | `repo`, `pr`, `agent` |
  | `get_findings` | `readOnlyHint: true` | `repo` string, `pr` integer, `run_id` string, `min_severity` enum `CRITICAL` / `WARNING` / `SUGGESTION`, `limit` integer | `repo`, `pr` |
  | `get_conventions` | `readOnlyHint: true` | `repo` string, `status` enum `pending` / `accepted` | `repo` |
  | `get_blast_radius` | `readOnlyHint: true` | `repo` string, `pr` integer | `repo`, `pr` |

- **Call, stub:** `--method tools/call --tool-name get_blast_radius --tool-arg repo=acme/payments-api pr=482`
  — `isError: true` with the E-BLAST text.
- **Calls that need the API — not verified in this run.** `list_agents`, and `run_agent_on_pr`
  with an unknown agent, both reached the developer API on `:3001`, which answered
  `500 internal_error … read ECONNRESET`: its database was down (the Docker daemon on the machine
  was unresponsive). The tools reported that as E-API-HTTP with the route and the API's message.
  Calls against a healthy API remain to be repeated.

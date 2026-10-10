# `@devdigest/mcp` — the local `devdigest-mcp` MCP server

## Before answering

**Read the matching document before you touch code.**

| If the task touches… | Read first |
|---|---|
| a tool's name, arguments, output or error text | `../specs/L04-devdigest-mcp.md`, then `specs/L04-devdigest-mcp.md` |
| how the server is launched, its environment variables, a client or Inspector that cannot connect | `README.md` |
| a route it calls or a response it parses | `specs/L04-devdigest-mcp.md`, then `../server/README.md` — API map |
| a shared contract | `../server/src/vendor/shared` — never redeclare a shape here |
| any test | `../TESTING.md` |
| a failure that smells familiar | `INSIGHTS.md` — and **append** to it through the `engineering-insights` skill |

If nothing matches, proceed.

## Commands

`npm ci` (the prerequisite — no main script installs this package) · `npm test` (vitest,
hermetic) · `npm run typecheck`

Start by hand: `node bin/devdigest-mcp.mjs` here, or `node mcp/bin/devdigest-mcp.mjs` from
the repository root.

Note: npm, not pnpm. The lockfile here is `package-lock.json`.

## Where things live

| | |
|---|---|
| `bin/devdigest-mcp.mjs` | the launcher — the only way to start the server |
| `src/constants.ts` | server name and version, the instructions text, every limit and cap |
| `src/single-zod.ts` | `assertSingleZod()` — the contracts and this package share one Zod |
| `src/main.ts` | the process entry and composition root |
| `src/config.ts` | `McpConfig`, `loadMcpConfig(env)` |
| `src/tool.ts` | `ToolDef`, `ToolDeps`, `ToolContext`, `ToolFailure`, `executeTool`, `toolOk`, `toolError`, `sanitizeText` |
| `src/server.ts` | `TOOLS` and `createMcpServer(deps)` |
| `src/ports.ts` | `DevDigestApi`, `API_ROUTES`, the API view schemas, `ApiError` |
| `src/api-client.ts` | `HttpDevDigestApi implements DevDigestApi` |
| `src/mocks.ts` | `MockDevDigestApi implements DevDigestApi` |
| `src/resolve.ts` | `resolveRepo`, `resolvePull`, `resolveAgent` |
| `src/review-view.ts` | `toReviewView` (pure) |
| `src/tools/` | one `ToolDef` per tool |
| `test/` | the hermetic suite |

Files are added phase by phase; see the layout table in `specs/L04-devdigest-mcp.md`.

## Conventions

- **An HTTP client of the API and nothing else**, through the eight routes of `API_ROUTES`.
  No database, no secret, no filesystem or subprocess import.
- **stdout is the protocol.** Only `src/main.ts` touches `process.*`; everything else logs
  through `deps.log` (stderr). No `console.*`.
- API views are `.pick()` / `.extend()` of shared contracts. Never redeclare a shape.
- **One Zod.** `tsconfig.json` `paths` and `vitest.config.ts` pin `@devdigest/shared` and
  `zod` so the contracts and this package see the same copy.
- Tool arguments are flat (scalars and enums). Every error text names the next step.
- The HTTP client and the transport are constructed only in `src/main.ts`.
- Input is parsed where it enters: tool arguments, environment variables, every API
  response, every SSE frame.

## Gotchas

- The launcher is the only way to start it. Never wrap it in `npm run`, `npx` or `pnpm`:
  a package-manager banner on stdout breaks the protocol.
- `scripts/dev.sh` neither installs nor starts this package. Run `cd mcp && npm ci` once.
- The API must be running (`./scripts/dev.sh`); the server calls it over HTTP.
- The test against a real API is `../server/test/mcp-stdio.it.test.ts`, in the server's
  integration lane.
- `get_blast_radius` is a stub: it returns an error and calls nothing.

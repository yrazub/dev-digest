# `@devdigest/mcp` — `devdigest-mcp`

A local, stdio-only MCP server: a thin wrapper over the DevDigest (Fastify) API. It holds no
copy of the business logic and does not start together with the application. Five tools:
`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`.

## Prerequisites

- `cd mcp && npm ci` — once. No main script installs this package.
- The DevDigest API running locally (`./scripts/dev.sh`), default `http://127.0.0.1:3001`.

## Launch

```bash
node mcp/bin/devdigest-mcp.mjs     # from the repository root
node bin/devdigest-mcp.mjs         # from mcp/
```

Do not wrap it in `npm run`, `npx` or `pnpm`: stdout carries only MCP messages. Logs go to
stderr. If dependencies are missing the launcher prints
`devdigest-mcp: dependencies are not installed. Run: cd mcp && npm ci` and exits 1.

## Environment

| Variable | Meaning | Default |
|---|---|---|
| `DEVDIGEST_API_URL` | http(s) URL of the API | `http://127.0.0.1:3001` |
| `DEVDIGEST_MCP_WAIT_SECONDS` | integer 1..600; how long `run_agent_on_pr` waits | `120` |

## More

The tools, their arguments and errors: [`specs/L04-devdigest-mcp.md`](specs/L04-devdigest-mcp.md).

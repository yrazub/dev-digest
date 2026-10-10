# Insights — `@devdigest/mcp`

Traps we have already hit in the local MCP server. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## What Doesn't Work

### A test pinned from an implementer's summary failed on its first run
**Date:** 2026-10-10
**Cause:** the implementer's report quoted a `get_conventions` note as "No accepted conventions yet. Review the extracted rules…"; the code says "No accepted conventions for this repository. …" for that branch, and "No accepted conventions yet; …" only when candidates are pending.
**Fix / rule:** pin wording from the plan's error catalogue or the spec; for text neither of them fixes, read the string in the source before asserting on it. A report is a summary, not a source.
**Evidence:** `src/tools/get-conventions.ts:42` (the pending-count note); the plan's catalogue has no entry for the other branch.

## Tool & Library Notes

- **2026-10-10** — a `tsc` `paths` target that is a file with a `.js` extension is taken literally: `"zod": ["./node_modules/zod/index.js"]` does not find the sibling `index.d.ts`, and every shared contract file fails with `TS7016`. Map the package directory instead; `tsc`, tsx and the launcher all resolve it (`"zod": ["./node_modules/zod"]`, `tsconfig.json:24`). `vitest.config.ts` keeps the file target.
- **2026-10-10** — tsx `register({ tsconfig })` applies the tsconfig `paths` to source that lives in a sibling package, including the bare `zod` import of `server/src/vendor/shared` (`register` in `bin/devdigest-mcp.mjs:15`). A run with the `zod` alias left out fails the `instanceof` guard, so `assertSingleZod()` is a real check, not a formality (`Severity instanceof z.ZodType`, `src/single-zod.ts:11`). Verified on tsx 4.23.15 only.
- **2026-10-10** — SDK 1.32.1 `StdioServerTransport` does not report the end of stdin as a close, so a client that goes away leaves the process alive unless the entry listens itself (`process.stdin.on('end', shutdown)`, `src/main.ts:45-46`).
- **2026-10-10** — the SDK validates tool arguments before the handler runs. Over the wire an argument error is an `isError` result whose text is the SDK's (`MCP error -32602: Input validation error: Invalid arguments for tool …`), not a JSON-RPC error and not the catalogue's E-ARGS; E-ARGS is reached only when `executeTool` is called directly (`safeParse` in `src/tool.ts:114`). So R4 "the error leads onward" is weaker for malformed arguments than the spec's catalogue suggests.
- **2026-10-10** — registering a bare Zod raw shape lists a no-parameter tool as `{"type":"object","properties":{}}` and silently strips unknown keys; registering `z.object(shape).strict()` lists `additionalProperties: false` and rejects them (`inputSchema` in `src/server.ts:33`).
- **2026-10-10** — the SDK adds `$schema` and `execution: { taskSupport: "forbidden" }` to every listed tool, about 100 characters each, which counts toward the `tools/list` budget; the five tools came to 2,938 characters of the 4,000 allowed. Nothing in the repository sets those fields.
- **2026-10-10** — a 429 from the API is the raw `@fastify/rate-limit` body (`{ statusCode, error, message }`), which does not parse as the shared `ApiErrorBody`, so it arrives as kind `http` with no `code`. E-API-RATE is therefore keyed on the status (`err.status === 429`, `src/tool.ts:79`).
- **2026-10-10** — `AbortSignal.timeout()` rejects with an error named `TimeoutError` and also covers reading the body; any other rejection means the API is not there (`src/api-client.ts:27-29`). `waitForRun` races `reader.read()` against an abort promise because a stream may ignore the signal (`Promise.race`, `src/api-client.ts:200`). A stub `fetch` in a test must reject when `init.signal` is already aborted, or a pre-aborted wait still delivers events.
- **2026-10-10** — `tsconfig.json` includes `src/**` only (`:27`) and vitest does not type-check, so nothing type-checks `test/**`: a `ToolDeps` literal without the required `api` passed silently after phase 4.
- **2026-10-10** — `StdioClientTransport` given an `env` merges it over a small safe default (PATH and the like), not over the real environment; a test that needs the real one copies `process.env` explicitly (`test/helpers/stdio-server.ts:69`). A server shared through `beforeAll` is stopped in `afterAll` (`test/stdio.test.ts:48`); a file-level `afterEach` leaves the second test with `Not connected`.
- **2026-10-10** — MCP Inspector 2.10.1 in CLI mode wants the server command right after `--cli`, before the method options: `npx -y @modelcontextprotocol/inspector@2.10.1 --cli node mcp/bin/devdigest-mcp.mjs --method tools/list --strict`. With the command last it answers `No servers found in config file`, or `--tool-arg` swallows it (`Invalid parameter format: node. Use key=value format.`). It exits 5 (`tool_is_error`) for an `isError` result, which is the expected outcome for the stub. `MCP_CATALOG_PATH` keeps its catalog out of `~/.mcp-inspector`. The launch command it drives is the `.mcp.json` entry (`../.mcp.json:14-17`).

## Decisions

- **2026-10-10** — `run_agent_on_pr` returns the full review result (verdict and findings). The lab's `list_agents → run_agent_on_pr → get_findings` is the generic path, not a required one: `list_agents` is skipped when the agent is known, `get_findings` when the review finishes inside the wait. Rejected: returning only verdict, counts and `run_id` so that the third call always happens. Decided by the user (plan D20, `../specs/L04-devdigest-mcp-plan.md`).
- **2026-10-10** — the server is its own package and not `server/src/mcp/`, by user decision; the cost is that one Zod instance has to be forced by the two tsconfig `paths` and proved at startup, and that the test against a real API lives in `../server/test/mcp-stdio.it.test.ts`. **See also:** `../server/INSIGHTS.md`.

## Session Notes

- **2026-10-10** — L04 part 1, `devdigest-mcp`, through the full agent chain: plan revision 3 after the lab page was read, six phases, two Inspector checks, architecture review with three suggestions and a fix round. 271 hermetic tests. Not done at this point: the real-API test never executed (Docker down) — see `../server/INSIGHTS.md`, Open Questions.
- **2026-10-10** — later the same day: Docker was restarted and the real-API test ran and passed (18 tests); `plan-verifier` then found three tool texts that differed from the spec's catalogue without being recorded (the E-PR-UNKNOWN variant with no stored PR, the adaptive truncation note, a third `get_conventions` note). The code was kept and the spec now states them.

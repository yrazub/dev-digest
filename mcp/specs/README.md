# `mcp/specs/` — MCP server specifications

One file per feature or course lesson: the tools the server exposes, their inputs, outputs and
error texts, how the package is launched, and the acceptance criteria. Written before the
change, read before implementing it.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

| Spec | Scope | Status |
|---|---|---|
| [`L04-devdigest-mcp.md`](L04-devdigest-mcp.md) | the `devdigest-mcp` stdio server — five tools, the API port, the launcher | implemented |
| [`L04-blast-radius.md`](L04-blast-radius.md) | `get_blast_radius` — the working tool, the ninth API route, the compact view | draft |

The cross-package specs are [`../../specs/L04-devdigest-mcp.md`](../../specs/L04-devdigest-mcp.md) and
[`../../specs/L04-blast-radius.md`](../../specs/L04-blast-radius.md).

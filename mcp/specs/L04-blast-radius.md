# L04 — Blast Radius (`devdigest-mcp`)

**Status:** implemented · **Cross-package spec:** [`../../specs/L04-blast-radius.md`](../../specs/L04-blast-radius.md)

The MCP part of Blast Radius: `get_blast_radius` stops being a stub. It resolves the pull
request, reads `GET /pulls/:id/blast` and returns that map in a compact form. It computes
nothing: the symbols, the callers, their order and the four numbers are the route's.

This file changes tool 5, the port and the error catalogue of
[`L04-devdigest-mcp.md`](L04-devdigest-mcp.md); everything else in that spec stands, including
its rules for shapes, sanitizing and budgets. When this is implemented, that spec's tool 5
section and its E-BLAST row are replaced by a pointer to this file.

## The port (`src/ports.ts`, `src/api-client.ts`, `src/mocks.ts`)

- `API_ROUTES` gains a ninth entry: `getBlastRadius: 'GET /pulls/:id/blast'`. The allow-list
  becomes eight reads and one write.
- `DevDigestApi` gains `getBlastRadius(prId: string): Promise<ApiBlastRadius>`.
- `ApiBlastRadius` is the shared `BlastRadiusResponse`, used whole (every field is read); it is
  imported, never redeclared. The response is parsed where it enters; a body that does not
  parse is E-API-SHAPE, as for every other route.
- `HttpDevDigestApi` and `MockDevDigestApi` implement the method the same way as the existing
  reads. No new timeout, header or retry.

## The tool (`src/tools/get-blast-radius.ts`)

`readOnlyHint: true`, as today. Name and input are unchanged, so a client that already lists
the stub needs no change.

- **Description** (at most 240 characters, no `{`):
  `Impact map of a pull request: the symbols declared in its changed files, who calls them (file:line) and the HTTP endpoints and cron jobs in those callers. Call it to see what a change can break. Reads a ready index; no LLM call.`
- **Input:** `repo` (string, "owner/name") · `pr` (integer ≥ 1, "pull request number"; a numeric
  string is accepted). Both required. No other argument: no `limit`, no `response_format`.
- **Steps:** `resolvePull(deps.api, repo, pr)` → `deps.api.getBlastRadius(pull.id)` →
  `toBlastView(...)` → `toolOk`. Three API reads, no write.
- **Errors:** E-REPO-FORMAT, E-REPO-UNKNOWN, E-PR-UNKNOWN (the existing texts, which already
  name the next step for an unknown PR — B8) and the API errors. A `404` from the blast route
  after a successful lookup (the PR was removed in between) is E-API-HTTP.
- E-BLAST is deleted, with its constant and its test.

### Result (`src/blast-view.ts`, pure)

```json
{"repo":"acme/payments-api","pr":482,
 "summary":"4 changed symbols, 5 callers, 3 endpoints, 1 cron job.",
 "totals":{"symbols":4,"callers":5,"endpoints":3,"crons":1},
 "impact":[{"symbol":"rateLimit","declared_in":"src/middleware/ratelimit.ts",
            "callers":["src/api/public/index.ts:23 publicRouter","src/server.ts:88 app"],
            "endpoints":["GET /api/public/items"],"crons":[]}],
 "symbols_without_callers":2}
```

| Field | Rule |
|---|---|
| `repo`, `pr` | the resolved repository name, cut at `MAX_REPO`, and the PR number |
| `summary` | the route's value, unchanged |
| `totals` | the route's four numbers `symbols`, `callers`, `endpoints`, `crons`, unchanged; `symbols_without_callers` is not repeated inside it |
| `impact` | one entry per `downstream` entry, **in the route's order** |
| `declared_in` | the `file` of the first `changed_symbols` entry with that name; left out when there is none |
| `callers` | `"<file>:<line> <name>"`, in the route's order |
| `endpoints`, `crons` | the route's `endpoints_affected` and `crons_affected` |
| `symbols_without_callers` | the route's `totals.symbols_without_callers`; left out when 0 |
| `degraded`, `reason`, `note` | present only when the route answered `degraded: true` (below) |

Dropped from the route's answer: the flat `changed_symbols` list (it can be long and its
callers-less entries carry no impact), `indexed_sha`, `caller_limit`.

**Caps** (new constants in `src/constants.ts`, next to the existing ones):

| Constant | Value | When cut |
|---|---|---|
| `MAX_BLAST_SYMBOLS` | 15 | `impact` keeps the first 15; `"more_symbols": <k>` is added |
| `MAX_BLAST_CALLERS` | 10 | a symbol keeps its first 10 callers; `"more_callers": <k>` is added to that entry |
| `MAX_BLAST_FACTS` | 10 | per symbol, for `endpoints` and for `crons`; `"more_endpoints"` / `"more_crons"` |

`totals` always states the full numbers, so a cut list never understates the impact. When
anything was cut, a top-level `note` is added:
`Showing the first <k> symbols and up to 10 callers each, highest-ranked first; totals count everything. The full map is on the pull request's Overview tab in DevDigest.`

**Sanitizing.** Every string that comes from the repository — symbol and caller names, file
paths, endpoints, crons — passes through `sanitizeText` (paths at `MAX_PATH`, names at
`MAX_TITLE`), like finding text. `summary` is server-built from numbers and is cut with
`cutText` at `MAX_SUMMARY`.

**Notes instead of errors (D11).** A degraded or empty map is a normal result. The `note`
names the next step, and when both a degraded note and a cut note apply they are joined with a
space, degraded first.

| Case | `note` |
|---|---|
| `pr_files_missing` | `The changed files of <repo>#<n> are not stored yet. Open the pull request in the DevDigest UI once so they are imported, then call get_blast_radius again.` |
| `index_partial` | `The repository index is partial, so callers may be missing. Resync the repository in DevDigest (the Resync button on the pull request's Blast radius block) and call again for a complete map.` |
| `index_failed`, `no_data` | `The repository index is not available (<reason>), so this map is a best effort and may be incomplete. Resync the repository in DevDigest, then call again.` |
| `flag_off` | `The repository index is switched off on this API (REPO_INTEL_ENABLED=false), so this map is a best effort.` |
| `repo_too_large` | `The repository is too large to index fully, so callers may be missing.` |
| not degraded, no changed symbols | `No symbols are declared in the changed files of <repo>#<n>, so there is nothing to map.` |
| not degraded, symbols but no callers | `Nothing in the indexed repository references the changed symbols.` |

## Server metadata

- `TOOLS` keeps its order; `get_blast_radius` stays last.
- `SERVER_INSTRUCTIONS` gains one short sentence — `For what a PR's changes can reach, call
  get_blast_radius.` — and must stay at or below 500 characters; shorten the first sentence if
  needed, not the guidance.
- The budgets of the first spec still hold and are still tested: the `tools/list` result at
  most 4,000 characters, each description at most 240 and without `{`, no `outputSchema`.

## Tests

| File | Change |
|---|---|
| `test/blast-view.test.ts` (new) | the view of a full map; the route's order kept; `declared_in`; each cap with its `more_*` field and the cut note; `totals` untouched by a cut; every note of the table, and the degraded-plus-cut join; `degraded` and `reason` absent when not degraded; sanitizing of a token-like string in a path and of a multi-line name |
| `test/read-tools.test.ts` | `get_blast_radius` on `MockDevDigestApi`: the happy path; E-REPO-UNKNOWN and E-PR-UNKNOWN make no blast request; an `ApiError` of each kind maps to its catalogue text; a numeric-string `pr` |
| `test/tool.test.ts` | the stub's E-BLAST case is removed |
| `test/api-client.test.ts` | the allow-list tests count nine routes; `getBlastRadius` requests `GET /pulls/<id>/blast` and rejects a body that does not parse |
| `test/stdio.test.ts` | `tools/call get_blast_radius` over the SDK client against the local `node:http` stub returns a map, not an error; the budgets with the new description and instructions |
| `test/boundaries.test.ts` | unchanged, and still green: no new import outside the package's allowed set |
| `../server/test/mcp-stdio.it.test.ts` | against the real API on seeded data: the tool's `totals` and the first symbol equal the body of `GET /pulls/:id/blast` (A7) |

## Documentation

`README.md` — the tool table row, the stub paragraph and the Inspector example. `CLAUDE.md` —
"eight routes" becomes nine and the stub gotcha is removed (edited by the main session;
`doc-writer` does not edit `CLAUDE.md`). `../specs/L04-devdigest-mcp.md` and
`L04-devdigest-mcp.md` — the stub rows point here.

## Acceptance

- [ ] `tools/list` still holds the same five tools in the same order; `get_blast_radius` has
      `readOnlyHint: true`, the two flat arguments and the new description (B8).
- [ ] On seeded data, `get_blast_radius` for `acme/payments-api` #482 returns the same symbols,
      callers and totals as `GET /pulls/:id/blast` and as the block (A7).
- [ ] An unknown repository or PR returns the existing error with its next step and makes no
      blast request (B8).
- [ ] A degraded map is a normal result with `degraded`, `reason` and a note that names the
      next step; no case returns invented data.
- [ ] The process can send exactly the nine requests of `API_ROUTES`; the tool sends three
      reads and no write.
- [ ] The budgets hold: `tools/list` ≤ 4,000 characters, instructions ≤ 500, description ≤ 240.
- [ ] `npm run typecheck` and `npm test` are green; the server's `mcp-stdio.it.test.ts` is green.

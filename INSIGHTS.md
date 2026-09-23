# Insights — cross-package

Traps we have already hit, so nobody hits them twice. Append-only: add an entry the
moment something costs you more than a few minutes, and **do not** delete an entry
just because the code moved on — note the date it stopped applying instead.

Module-specific traps go in that module's own `INSIGHTS.md`. Only things that span
packages, or that belong to no single package, live here.

An agent fills these files through the `engineering-insights` skill
([`.claude/skills/engineering-insights/SKILL.md`](.claude/skills/engineering-insights/SKILL.md)),
which owns the routing and the quality bar. This file owns the **format**.

## Sections

Every `INSIGHTS.md` uses the same eight headings, in this order. A file carries only the
ones it has entries for.

| Section | What belongs there |
|---|---|
| What Works | an approach that held up, specific enough to repeat deliberately |
| What Doesn't Work | an approach that failed or was abandoned, and why |
| Codebase Patterns | a convention or architectural rule discovered by reading the code |
| Tool & Library Notes | a quirk of a dependency, the toolchain or the environment |
| Decisions | a choice, its reason, and the alternative that was rejected |
| Recurring Errors & Fixes | symptom → real cause → rule |
| Open Questions | left unresolved, with what was already ruled out |
| Session Notes | dated one-line summary of a session that produced entries |

## Format

**Recurring Errors & Fixes** and **What Doesn't Work** — one `###` heading per trap. The
three fields are separate because the symptom is what you will search for, the cause is what
you could not have guessed, and the rule is the only part that helps next time:

```markdown
### <symptom, as you actually saw it>
**Date:** YYYY-MM-DD
**Cause:** what was really wrong (not what it looked like).
**Fix / rule:** what to do instead, phrased so it applies next time.
```

Everywhere else — one line, dated, carrying its own evidence:

```markdown
- **YYYY-MM-DD** — <claim, with the path, symbol, command or error string that proves it>
```

An entry is never reworded or deleted. Everything goes *beneath* it, dated:

| Line | When |
|---|---|
| `**Superseded YYYY-MM-DD:** <what changed>` | it stopped being true |
| `**Disputed YYYY-MM-DD:** <the other entry, and why>` | a later finding contradicts it and neither could be proved |
| `**See also:** <path>` | the general rule lives at the root and the mechanics in a module file, or the reverse |

The file must never carry two entries that disagree without one of those lines. The next
session believes whichever it reads first.

Every entry must be actionable read cold, by someone who was not in the session. If it would
be obvious to anyone reading the code, it does not belong here.

---

## What Works

- **2026-09-20** — verify a newly configured MCP server by *driving* it, not by handshaking it.
  An `initialize` + `tools/list` exchange over stdio succeeds even when the server cannot launch
  its browser, so it proves only that the process starts. For `chrome-devtools`, a real
  `navigate_page` followed by `take_screenshot` is the first step that would actually fail.
  Script the check by spawning `command` + `args` read out of `.mcp.json` itself, so it exercises
  exactly what the client will run rather than a hand-retyped command line.

## Tool & Library Notes

- **2026-09-20** — the `claude` CLI is not on `PATH` in a VS Code extension install; `which claude`
  returns nothing even though Claude Code is running. The bundled binary is at
  `~/.vscode/extensions/anthropic.claude-code-*-darwin-arm64/resources/native-binary/claude`.
  Use that path for `claude mcp ...` subcommands instead of concluding the CLI is absent.
- **2026-09-20** — `chrome-devtools-mcp` opts *in* to telemetry by default: `--usageStatistics`
  defaults to `true` (usage data to Google), and its performance tools separately send trace URLs
  to the CrUX API unless `--no-performance-crux` is passed. Our `.mcp.json` sets
  `--usageStatistics=false`; the `CI` and `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` env vars
  disable it too.
- **2026-09-20** — `chrome-devtools` `wait_for` takes `text` as an **array**
  (`{"type":"array","minItems":1}`); a bare string fails with
  `Expected array, received string at text`. It also matches the **DOM** text, while
  `take_snapshot` renders text after CSS `text-transform`. DevDigest's section labels are
  uppercased in CSS, so the snapshot shows `StaticText "REVIEW RUNS"` while the DOM holds
  `Review runs` — copying the label out of the snapshot into `wait_for` times out after 10s for a
  reason that looks like a missing element. Match the DOM casing, or pass both variants.
- **2026-09-20** — a `click` issued straight after `navigate_page` on the DevDigest root fails with
  `the element did not become interactive within the configured timeout`: `/` renders a
  "Taking you to your repository…" interstitial and client-side redirects to the repo's `/pulls`,
  so the element the snapshot just described is torn out from under the click. Settle after the
  navigation, or `wait_for` a text that only the destination page has, before clicking.
  **See also:** `client/INSIGHTS.md` — the `<main>`-scrolls-not-the-document rule that governs
  screenshots of this app.
- **2026-09-22** — `docs/DevDigest Design (standalone).html` is not readable as text: it is a
  self-executing bundled React app, and `grep`/`Read` against the raw file finds nothing (0
  matches for terms confirmed present in the design, e.g. `CRITICAL`, `finding`). The real
  source lives inside `<script type="__bundler/manifest">` as a JSON map of
  `{mime, compressed, data}` entries, where `data` is base64 gzip (`H4sI…`). Decode it:
  base64-decode `data`, `gzip.decompress` when `compressed: true`, write out the `.js`/`.txt`
  results, then grep those. Each decoded `.js` file opens with a `/* filename.jsx —
  description */` comment naming the screen/module it mocks (e.g. `screen_dashboard.jsx`,
  `findings.jsx`, `primitives.jsx`) — the fastest way to map mockup back to app screen.
- **2026-09-22** — the `chrome-devtools` MCP server's Chrome profile is a persistent
  singleton across sessions and days: `ps aux` showed roughly 8 orphaned
  `chrome-devtools-mcp` + `npm exec chrome-devtools-mcp@1.9.0` process pairs still alive
  from days earlier, none belonging to the current session. Any later session's first
  `new_page`/`list_pages` call then fails outright with "The browser is already running
  for `<profile dir>`. Use --isolated to run multiple browser instances." — not transient,
  and not fixable from inside a tool call: `new_page`'s `isolatedContext` param only
  creates an isolated *browser context* inside an already-running browser, so it can't
  help when the failure happens at browser-launch time before any context exists. Real
  fixes are (a) killing the stale process pair holding the profile lock, or (b) passing
  `--isolated` to the `chrome-devtools-mcp` CLI in `.mcp.json` — both outside any single
  tool call. Different failure mode than the pageId-routing trap already recorded below.
  When it happens, verify server-side behavior via curl/API calls and component/
  integration tests instead of blocking on browser automation, and say so rather than
  silently skipping browser verification.

## Decisions

- **2026-09-20** — session knowledge is recorded in the per-module `INSIGHTS.md` files, not in
  a separate `LEARNINGS.md`. `docs/engineering-insights-research.md` and every source it cites
  prescribe `LEARNINGS.md`, so the temptation to add one recurs; it was rejected because each
  module's `CLAUDE.md` gate already routes to `INSIGHTS.md`, and a second knowledge file per
  module means the agent must read both and guess which one owns a finding. The research doc's
  module paths (`apps/client`, `packages/reviewer-core`) are from a different layout — the real
  targets are `client/` `server/` `reviewer-core/` `e2e/` and the root.

- **2026-09-20** — the `chrome-devtools` MCP server is configured in a project `.mcp.json`, not
  with `claude mcp add --scope local`. Local scope is stored inside `~/.claude.json`, which the
  *running* Claude Code session rewrites on exit, so a server added mid-session can be lost to
  that write-back. A standalone `.mcp.json` is immune to it, shows up in a diff, and is reversible
  with `rm`. The cost is that it is a tracked project file — every clone is prompted to trust the
  server — so it is a team-wide choice, not a personal one; `--scope user` remains the right home
  for a browser server you want in unrelated projects.

## Recurring Errors & Fixes

### CI passes on an already-migrated database and fails on a fresh one
**Date:** 2026-08-05
**Cause:** a merge copied a whole generated directory over upstream's instead of merging
with it. The lane that reuses an existing database never replays the broken history, so
only the fresh-database lane fails.
**Fix / rule:** when a merge touches generated artefacts (migrations, journals,
snapshots, lockfiles), resolve them by regenerating or by appending — never by taking
one side wholesale. Check the fresh-install lane before trusting a green run.
**See also:** `server/INSIGHTS.md` — the Drizzle journal and snapshot mechanics behind this
rule, and how to relink the chain.

### A `pnpm` script run against `server/` installed `reviewer-core`'s dependencies instead
**Date:** 2026-09-20
**Cause:** two things at once. Parallel Bash calls share one shell, so its working directory is
shared mutable state — `cd server && pnpm typecheck` issued alongside
`cd reviewer-core && npm run typecheck` ran with the *other* call's cwd. And pnpm ≥10 (here
12.4.2) verifies dependencies before running a script and installs when they do not match, so it
did not just fail: it wrote `pnpm-lock.yaml` + `pnpm-workspace.yaml` into `reviewer-core/` and
replaced its npm `node_modules` with a pnpm tree — breaking the repo's per-package package-manager
rule silently, with a green type-check as the only visible output.
**Fix / rule:** run per-package commands **one at a time**, never two `cd <pkg> && …` calls in
the same parallel batch. If they must be batched, use the package-manager's own directory flag
(`pnpm -C <dir> …`, `npm --prefix <dir> …`) so no `cd` is involved. Recovery is
`rm pnpm-lock.yaml pnpm-workspace.yaml && rm -rf node_modules && npm ci` in the package that was
clobbered; check `git status --untracked-files=all` for a stray lockfile before trusting a run.

### Every `chrome-devtools` page tool fails with `MCP error -32602: ... Required at pageId`
**Date:** 2026-09-20
**Cause:** `chrome-devtools-mcp` v1.9.0 defaults `--pageIdRouting` to `true`, so every
page-scoped tool (`navigate_page`, `take_screenshot`, `click`, `fill`, `press_key`, ...) requires
an explicit `pageId`. The value is a **number** — the index `list_pages` prints, e.g.
`1: about:blank [selected]` -> `pageId: 1` — not a string and not an opaque handle. Guessing the
shape costs a second round trip: passing `"1"` fails again with
`Expected number, received string at pageId`.
**Fix / rule:** call `list_pages` (or `new_page`) first and pass its integer index as `pageId` on
every page tool that follows. Do not pattern-match the human-readable text output for a token —
read the tool's own `inputSchema.properties.pageId`, which states `{"type":"number"}`. Pass
`--no-page-id-routing` only if single-page use makes the extra call not worth it; the default
exists to keep concurrent agent sessions from stealing each other's tab.

## Session Notes

- **2026-09-20** — added the `engineering-insights` skill and restructured all five
  `INSIGHTS.md` files onto the eight-rubric format; recorded the `LEARNINGS.md` decision above.
- **2026-09-20** — installed and verified the `chrome-devtools` MCP server
  (`chrome-devtools-mcp@1.9.0`) through a project `.mcp.json`; captured the `pageId` routing trap,
  the telemetry defaults, and the drive-it-don't-handshake-it smoke-test rule.
- **2026-09-20** — verified the `chrome-devtools` server by driving the real click-through
  (root → PR #482 → Agent runs) and screenshotting it; captured the `wait_for` array/casing trap,
  the post-redirect click trap, and the `<main>`-scroller rule in `client/INSIGHTS.md`.
- **2026-09-22** — scoped and speced the findings-counter feature (`specs/L01-findings-counter.md`
  + module specs); decoded the bundled design mockup to find the CRITICAL/WARNING/SUGGESTION
  badge pattern and confirmed a ready-made `SeverityBadge` primitive already supports `count`.
- **2026-09-22** — implemented the findings-counter feature end to end (server: `agent_runs`
  migration 0011, `rollupSeverities` casing fix, `PrMeta`/`RunSummary` contract additions,
  the PR-list query, seed-data backfill; client: `FindingsPanel` counter+filter,
  `RunHistory` per-severity badges, the new `FindingsPopover`); server (104 hermetic + 30
  integration) and client (55) tests green, both typecheck clean, and the live dev server
  verified end-to-end via curl against real backfilled data. Browser-based interaction
  verification (hover popover, filter clicks) was skipped due to the chrome-devtools
  profile-lock issue recorded above.

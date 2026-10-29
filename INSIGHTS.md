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
**Evidence:** `path:line` it was verified against (+ the exact error string, if any).
```

Everywhere else — one line, dated, carrying its own evidence:

```markdown
- **YYYY-MM-DD** — <claim, with the symbol, command or error string that proves it> (`path:line`)
```

**Every entry names at least one `path:line`** that you opened and that shows the claim. Pair it
with the symbol name (`tableCard`, `dockerAvailable`): the line is where it was on the entry's
date, and the symbol is how to find it after the code moves. When a finding is about an external
tool rather than repo code, cite the line of the repo config that governs that tool
(`.mcp.json:10`), say so if that file is local-only, and keep the exact error string. Never invent
a line: if nothing in the repo shows it, say that instead.

An entry is never reworded or deleted. Everything goes *beneath* it, dated:

| Line | When |
|---|---|
| `**Superseded YYYY-MM-DD:** <what changed>` | it stopped being true |
| `**Disputed YYYY-MM-DD:** <the other entry, and why>` | a later finding contradicts it and neither could be proved |
| `**See also:** <path>` | the general rule lives at the root and the mechanics in a module file, or the reverse |
| `**Evidence YYYY-MM-DD:** <path:line — what it shows>` | the entry was written without a `path:line`, or its anchor has moved |
| ``**Skill:** `<name>` `` | the entry is about how a skill under `.claude/skills/` behaves; root file only, `<name>` is the skill's folder |

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
  **Evidence 2026-09-26:** `.mcp.json:4-11` — the `command` + `args` to spawn.
- **2026-10-16** — run `spec-creator`'s `write` pass by *resuming* the discovery subagent with
  `SendMessage` (its agent id), not by spawning a fresh one. The resumed agent still holds its
  own Discovery report and everything it read, so the message carries only the answers and the
  pass name; a second `SendMessage` amended the draft for its open questions in about a minute.
  On L05 Project Context the discovery report ran to 14 questions, 21 design gaps and 7 UX
  proposals — pasting that back into a cold spawn, as "Feature workflow" step 0.4 reads, would
  have duplicated it in the main session and re-read the code. A fresh spawn is still needed
  when the discovery agent is gone (new session).
  **Evidence 2026-10-16:** `.claude/agents/README.md:86` — step 0.4, "the Discovery report and
  the answers".
  **2026-10-16:** the same holds for `implementation-planner`: on L05 the `plan` pass was a
  `SendMessage` to the agent that ran `review`. The message carried only the outcomes and pointed
  to the saved review (`.devdigest/sdd/<feature>/review.md`) instead of pasting it back.
  **Superseded 2026-10-19:** resuming cost more than it saved. In L05 PR Brief the resumed
  `spec-creator` and `implementation-planner` re-read a history that had grown to 38.4M and 49.2M
  cache tokens — $38 and $44, the two most expensive agents of the run
  (`docs/retros/l05-pr-brief.md`, "Per agent type"). Each pass now starts a fresh agent that reads
  the saved report and answers — see the 2026-10-19 Decisions entry and
  `.claude/agents/README.md:86` (step 0.4).
- **2026-10-16** — to change an approved spec that nothing has been built from yet (the review
  pass found gaps), reopen it: set `Status: draft` in the umbrella and every module spec, and in
  every index row (`specs/README.md` and each `<package>/specs/README.md`). Then run `spec-creator`
  `write` with the changes. It edits in place, keeps the criterion IDs, defers items to a
  "Deferred" table instead of deleting them, and leaves the status alone. Set `approved` again
  after the user agrees. Asked to amend an `approved` spec directly, `spec-creator` stops and
  writes nothing, because it may only add a `Superseded by` line to an approved spec
  (`.claude/agents/spec-creator.md:316`). "Feature workflow" step 2 names only "a `write` pass on
  the draft, or a new spec that supersedes an approved one" (`.claude/agents/README.md:94-95`), so
  the reopen route is not written down there. Superseding needs new file names, because the
  umbrella and module specs share one name.
  **2026-10-17:** the reopen route is now step 2 of "Feature workflow" (`.claude/agents/README.md:96-98`).
- **2026-10-18** — a review of the finished implementation plan by a model of another family (the L05 homework's "cross-model review"), done before `/execute-plan`, found four real gaps that spec-creator, implementation-planner's own review pass and the main session had all missed: findings taken from an unfinished review run, the completion log written before the validation that produces its counts, a rate-limit test that asserted only an exported constant, and an unescaped `wrapUntrusted` label. Each was checked against the code before it was accepted, and all four went into the plan as an `amend` pass with no fix phase, because nothing was built yet (`specs/plans/L05-pr-brief.md:7`, `:178`, `:209`, `:249-252`, commit "amend the L05 PR Brief plan after a cross-model review"). Run it on every plan of a multi-package feature, and check each claim before amending.
- **2026-10-18** — A plan's "Expected to change: none" should count typecheck-only breaks. A new required prop (`onOpenFocus: (file: string, line: number) => void`, `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:15`) fails the client's `pnpm typecheck` at test call sites while `pnpm test` stays green, because vitest does not type-check; that is where the L05 PR Brief phase 7 deviation came from. **See also:** `client/INSIGHTS.md` (client `typecheck` covers test files).

## What Doesn't Work

### A skill eval whose fixture already shows the pattern: the with-skill and baseline runs tie
**Date:** 2026-10-29
**Cause:** the no-skill agent reads the fixture and copies what it finds there. In the `onion-architecture` evals the fixture carried `server/CLAUDE.md`, a dependency-cruiser config named with the skill's own rule IDs, a lazy getter already in `container.ts`, and a legacy file marked as legacy, so the first round tied on 3 of 4 cases (36/37 vs 36/37) and three replacement cases tied again (`adapter-secret-lazy`, `pure-rule-placement`, `touch-legacy-shrink-baseline`). The only case that separated the runs was `transaction-owned-by-use-case` (8/8 vs 3/8), because no fixture file states its rule. The same happened to two of four `engineering-insights` cases (routing and the trivial session), where the repo's own `INSIGHTS.md` header already documents the entry format.
**Fix / rule:** build an eval around a rule that only the skill's text states: before keeping a case, grep the fixture for the rule's name and for an example of the pattern, and remove what it finds. Run each case once with and once without the skill and delete the ties. Drop an assertion that both runs fail for a reason unrelated to the skill (such as "a test was written" when the prompt did not ask for one).
**Evidence:** `.claude/skills/onion-architecture/references/drizzle-persistence.md:42` (`db-tx-owned-by-use-case`, the one rule no fixture restated); the surviving case is `.claude/skills/onion-architecture/evals/transaction-owned-by-use-case/case.yaml`.

## Tool & Library Notes

- **2026-09-20** — the `claude` CLI is not on `PATH` in a VS Code extension install; `which claude`
  returns nothing even though Claude Code is running. The bundled binary is at
  `~/.vscode/extensions/anthropic.claude-code-*-darwin-arm64/resources/native-binary/claude`.
  Use that path for `claude mcp ...` subcommands instead of concluding the CLI is absent.
  **Evidence 2026-09-26:** nothing in the repo shows this — it is a fact about the extension install, and
  `which claude` returning nothing is the proof. The config those subcommands manage is
  `.mcp.json:3`.
- **2026-09-20** — `chrome-devtools-mcp` opts *in* to telemetry by default: `--usageStatistics`
  defaults to `true` (usage data to Google), and its performance tools separately send trace URLs
  to the CrUX API unless `--no-performance-crux` is passed. Our `.mcp.json` sets
  `--usageStatistics=false`; the `CI` and `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` env vars
  disable it too.
  **Evidence 2026-09-26:** `.mcp.json:10` — `--usageStatistics=false`.
- **2026-09-20** — `chrome-devtools` `wait_for` takes `text` as an **array**
  (`{"type":"array","minItems":1}`); a bare string fails with
  `Expected array, received string at text`. It also matches the **DOM** text, while
  `take_snapshot` renders text after CSS `text-transform`. DevDigest's section labels are
  uppercased in CSS, so the snapshot shows `StaticText "REVIEW RUNS"` while the DOM holds
  `Review runs` — copying the label out of the snapshot into `wait_for` times out after 10s for a
  reason that looks like a missing element. Match the DOM casing, or pass both variants.
  **Evidence 2026-09-26:** `client/src/vendor/ui/primitives/SectionLabel.tsx:22` — `textTransform: "uppercase"`,
  the reason snapshot text and DOM text differ. The array shape is the tool's own input schema,
  not repo code.
- **2026-09-20** — a `click` issued straight after `navigate_page` on the DevDigest root fails with
  `the element did not become interactive within the configured timeout`: `/` renders a
  "Taking you to your repository…" interstitial and client-side redirects to the repo's `/pulls`,
  so the element the snapshot just described is torn out from under the click. Settle after the
  navigation, or `wait_for` a text that only the destination page has, before clicking.
  **See also:** `client/INSIGHTS.md` — the `<main>`-scrolls-not-the-document rule that governs
  screenshots of this app.
  **Evidence 2026-09-26:** `client/src/app/page.tsx:40` — the "Taking you to your repository…" interstitial;
  `e2e/specs/04-pr-findings.flow.json:6` waits for `/pulls` for the same reason.
- **2026-09-22** — `docs/DevDigest Design (standalone).html` is not readable as text: it is a
  self-executing bundled React app, and `grep`/`Read` against the raw file finds nothing (0
  matches for terms confirmed present in the design, e.g. `CRITICAL`, `finding`). The real
  source lives inside `<script type="__bundler/manifest">` as a JSON map of
  `{mime, compressed, data}` entries, where `data` is base64 gzip (`H4sI…`). Decode it:
  base64-decode `data`, `gzip.decompress` when `compressed: true`, write out the `.js`/`.txt`
  results, then grep those. Each decoded `.js` file opens with a `/* filename.jsx —
  description */` comment naming the screen/module it mocks (e.g. `screen_dashboard.jsx`,
  `findings.jsx`, `primitives.jsx`) — the fastest way to map mockup back to app screen.
  **Evidence 2026-09-26:** `docs/DevDigest Design (standalone).html:169` — `<script type="__bundler/manifest">`,
  where the encoded source starts.
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
  **2026-09-26:** a narrower, fixable cause of the same "already running" error. After a reboot
  (no stale processes left), the first `new_page` launched Chrome but failed with
  `Protocol error (Browser.setContentsSize): Restore window to normal state before setting
  content size`; the MCP server then lost its handle on its own Chrome child, so every later
  call hit the profile lock. Cause: `browser.window_placement` in the profile's
  `Default/Preferences` spanned the whole screen work area (0–2560 × 30–1351), which macOS Chrome
  treats as a zoomed window, so the server's `--viewport=1280x800` resize is refused. Fix: kill
  the Chrome child (`pkill -f "user-data-dir=$HOME/.cache/chrome-devtools-mcp/chrome-profile"`),
  shrink `window_placement` in `Default/Preferences` to a normal rect (e.g. left 40, top 60,
  right 1360, bottom 960), retry `new_page`. Try this before falling back to curl-only checks.
  **Evidence 2026-09-26:** `.mcp.json:5-11` — the `args` where `--isolated` would go. The
  window-placement fix lives outside the repo, in
  `~/.cache/chrome-devtools-mcp/chrome-profile/Default/Preferences` → `browser.window_placement`.

- **2026-09-27** — the local `next-best-practices` skill was installed from `vercel-labs/next-skills`,
  which Vercel has since retired: framework knowledge now ships as version-matched docs bundled
  with Next.js plus a generated `AGENTS.md`/`CLAUDE.md` (Next 16.3+, or `npx @next/codemod@canary
  agents-md` on older versions), because "always-available context outperforms on-demand
  retrieval". Our copy will receive no updates and describes Next 16 behaviour while the client
  runs Next 15; treat it as a snapshot, and prefer `nextjs.org/docs` when they disagree. Not yet
  diffed against the last upstream version.
  **Evidence 2026-09-27:** `skills-lock.json:28-29` — `"source": "vercel-labs/next-skills"`. The
  retirement itself is external; see `.claude/skills/frontend-ui-architecture/research/notes/tooling_and_ai_skills.md`.
  **Skill:** `next-best-practices`

- **2026-09-27** — Node's `path.matchesGlob` never lets `*` or `**` match a path segment that
  starts with a dot, so `**/*.md` does **not** match `.claude/skills/x/SKILL.md`, and
  `.github/…` or `.claude/…` files slip past any `**` exclusion. It takes no `dot` option. Match
  through a wrapper that neutralises leading dots on both the path and the pattern
  (`undot` in `.claude/skills/pr-self-review/scripts/lib/glob.mjs:5`).
- **2026-09-27** — the local pnpm (12.4.2) rejects the silent flag before a script name:
  `pnpm -s arch:check` fails with `error: unexpected argument '-s' found`. Run the script plainly;
  extra args after it are appended to the script's command, so `pnpm arch:check --output-type json`
  works, and the `$ depcruise …` echo goes to stderr, leaving stdout parseable
  (`.claude/skills/pr-self-review/scripts/arch-check.mjs:28`, the `spawnSync('pnpm', …)` call).
- **2026-09-27** — in auto mode the agent cannot register a hook: writing `hooks` into
  `.claude/settings.json` (or loading `update-config` to do it) is denied as
  `[Self-Modification]`. Build the hook script, then hand the user the settings snippet to add;
  do not look for another way in. Nothing in the repo shows the denial; the snippet the user
  must add is in `specs/L02-pr-self-review.md` ("Registering the hook").

- **2026-09-28** — `chrome-devtools` `upload_file` only reads files under the MCP's workspace roots.
  With no `--workspace` flag, that is the OS temp directory (`$TMPDIR`, `/var/folders/...`), not
  `/tmp` or the session scratchpad. Copy a fixture into `$TMPDIR` before uploading. It also
  cannot reach an `<input type="file" hidden>`: the `hidden` attribute removes the input from
  the accessibility tree. Keep upload inputs visually hidden instead
  (`client/src/app/skills/_components/ImportSkillModal/styles.ts`, `fileInput`). The config that
  sets the roots is `.mcp.json:3`. Error seen: `Access denied: path … is not within any of the
  configured workspace roots.`
- **2026-10-07** — to stop a dev stack started with `scripts/dev.sh` from another shell, signal its
  process group, as Ctrl-C does: `kill -INT -<pgid>` (the group id is the script's own pid,
  `ps -o pgid= -p <pid>`). `kill -INT <pid>` alone did nothing: the script sits in `wait` on its
  children and the servers kept `:3000` and `:3001` (`scripts/dev.sh:109` `trap cleanup EXIT INT TERM`,
  `:120` `wait`). Postgres stays up. Needed before `npm run e2e:hermetic`, which writes into the
  same `client/.next`. **See also:** `e2e/INSIGHTS.md` (the `:3101` entry).
- **2026-10-10** — Docker Desktop's daemon can stop answering while its containers' ports stay open: `docker ps` and `docker info` return `request returned 500 Internal Server Error for API route and version …, check if the server supports the requested API version` or hang past 120 s, `:5432` is still held by `com.docker.backend`, and the API answers `/health` with `ok` but every database route with `500 internal_error … read ECONNRESET`. The server's integration files then skip without failing. `osascript -e 'quit app "Docker"'` did not stop `com.docker.backend` (same pid afterwards); it was not recovered in the session. Check `docker info` before trusting a green server run. Nothing in the repository governs the daemon. **See also:** `server/INSIGHTS.md` (the `dockerAvailable()` entry).
- **2026-10-10** — `chrome-devtools` lost the user's Chrome in the middle of a call: `new_page` failed with `Target.createTarget timed out`, the next call still listed 71 pages, and after that Chrome was not running at all. Once Chrome was started again the MCP server kept answering `Could not find DevToolsActivePort` although the file existed and `:9222` was listening; reading the page over raw CDP from that file worked (the `--autoConnect` entry, `.mcp.json:8`). Chrome came back with one tab, so the user's earlier tabs had to be restored by hand.
- **2026-10-11** — with Tool Search on, a request to list open pull requests went to `gh pr list` first (`command not found: gh`, exit 127) and only then to the GitHub MCP tool `list_pull_requests`: a deferred tool is cheaper in context and less visible to the model. Naming the server in the request avoids the detour. Nothing in the repository shows this; it was observed in a session.
- **2026-10-16** — Claude Code subagents never get `AskUserQuestion` (removed even when listed in `tools`), so a subagent cannot ask the user mid-run — that is why `spec-creator` and `implementation-planner` work in two passes (`.claude/agents/spec-creator.md`, the pass table). Subagents *can* spawn subagents, up to three layers by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); ours have no `Agent` tool by project choice, not by a platform limit. Frontmatter `hooks` (the `spec-creator` guard) are skipped until the folder is trusted. Source: code.claude.com/docs/en/sub-agents, read through a WebFetch summary.
- **2026-10-16** — where the tokens of the agent chain go, measured from the local transcripts (`~/.claude/projects/<project>/<session>/subagents/*.jsonl` + `.meta.json`, `message.usage`) of the L03 Intent Layer and Smart Diff runs: the **orchestrating main session** read 318M and 268M cache tokens (600 turns, context up to 848k), against 34M for all 12 `implementer` runs of Intent Layer. Per run, `architecture-reviewer` averaged 11.6M cumulative input (91 turns), `plan-verifier` 8.7M, `test-writer` 2.3M, `implementer` 2.1M. Inside `implementer`, test output is small (≈6 KB per run, every command piped through `tail`); its cost is turns × context, and the context is the plan read whole (`.claude/agents/implementer.md:24` "The plan, in full." — `specs/plans/L03-intent-layer.md` is 877 lines / 165 KB and was read twice because one `Read` truncated), `cat`/`grep` exploration (~20k tokens per run) and skill bodies (`next-best-practices` and `fastify-best-practices` ≈13k tokens each). Cut the orchestrator's context and the plan size before trimming test commands.
- **2026-10-16** — Claude in Chrome (`mcp__claude-in-chrome__*`, the user's own Chrome with its
  logins) asks for approval on every new tool, which the user found spammy. One server-level rule
  — `"mcp__claude-in-chrome"` with no tool suffix in `permissions.allow` — covers all of its tools.
  It lives in `.claude/settings.local.json`, which the user's global git ignore excludes, so it is
  per-machine. With it, `navigate` + `get_page_text` read an edu.goit.global task page; the first
  `get_page_text` straight after `navigate` returned `No text content found. Page may contain only
  images, videos, or canvas-based content.` because the page had not rendered yet — a retry after a
  screenshot returned the text. **See also:** the `chrome-devtools` `--autoConnect` entries above.
  **Evidence 2026-10-16:** `.claude/settings.local.json:5` (local-only, not in git).
- **2026-10-16** — a subagent's final report that contains a literal tag-like string such as
  `<total_tokens>` (here, a UI string template in a plan's file table) is flagged by the Claude
  Code harness as a "harness-signal tag". Every such `<` is rewritten to `<\`, and a banner line
  is prepended to the report. When a report is saved verbatim (an Implementation Plan to
  `specs/plans/`), drop the banner and undo the escape (`sed 's/<\\total_tokens>/<total_tokens>/g'`),
  then check that no `<\` is left. Evidence: `specs/plans/L05-project-context.md:217`, the
  `ProjectContextView` row, footer `"<documents.length> files · <total_tokens> tokens total"`.
- **2026-10-18** — The `chrome-devtools` MCP runs with `--autoConnect` (`.mcp.json:8`) and drives the user's own Chrome window, so `resize_page` does not change `innerWidth`. For a narrow-width check use `emulate` with viewport `<w>x<h>x1`, and reset it with an empty viewport before closing the tab.
- **2026-10-18** — BSD `sed` on macOS reads the argument after `-i` as the backup suffix, so `sed -i 's/a/b/' file` fails with `unterminated substitute pattern`. Use `sed -i '' …`, `perl -pi -e`, or the Edit tool. No line in the repo shows it.
- **2026-10-29** — the `skill-creator` viewer `eval-viewer/generate_review.py` needs Python 3.10 or newer: on macOS system Python 3.9.6 it stops at `def build_run(root: Path, run_dir: Path, budget: dict) -> dict | None:` (line 192) with `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`, and `from __future__ import annotations` fixes it. Copy the script out of the installed skill, add that import after the module docstring (before it is a `SyntaxError`), and run the copy; do not edit the installed skill. No repo file shows this: the script lives in the local, synced `skill-creator` skill folder.

## Decisions

- **2026-09-20** — session knowledge is recorded in the per-module `INSIGHTS.md` files, not in
  a separate `LEARNINGS.md`. `docs/engineering-insights-research.md` and every source it cites
  prescribe `LEARNINGS.md`, so the temptation to add one recurs; it was rejected because each
  module's `CLAUDE.md` gate already routes to `INSIGHTS.md`, and a second knowledge file per
  module means the agent must read both and guess which one owns a finding. The research doc's
  module paths (`apps/client`, `packages/reviewer-core`) are from a different layout — the real
  targets are `client/` `server/` `reviewer-core/` `e2e/` and the root.
  **Evidence 2026-09-26:** `.claude/skills/engineering-insights/SKILL.md:43-49` — the routing table that sends
  each finding to a module `INSIGHTS.md` or the root; `docs/engineering-insights-research.md:47`
  — the `LEARNINGS.md` session protocol that was rejected.

- **2026-09-20** — the `chrome-devtools` MCP server is configured in a project `.mcp.json`, not
  with `claude mcp add --scope local`. Local scope is stored inside `~/.claude.json`, which the
  *running* Claude Code session rewrites on exit, so a server added mid-session can be lost to
  that write-back. A standalone `.mcp.json` is immune to it, shows up in a diff, and is reversible
  with `rm`. The cost is that it is a tracked project file — every clone is prompted to trust the
  server — so it is a team-wide choice, not a personal one; `--scope user` remains the right home
  for a browser server you want in unrelated projects.
  **2026-09-26:** from commit `642ae2d` ("Update gitignore, new insights") until today, `.mcp.json`
  was listed in `.gitignore`. That quietly undid this decision: other clones got no server and
  were never prompted. The ignore rule has been removed and the file is tracked again, so the
  decision stands. Keep `.mcp.json` free of secrets and machine paths — it ships to every clone.
  **Evidence 2026-09-26:** `.mcp.json:1-14` — `npx chrome-devtools-mcp@1.9.0` and its flags only.

- **2026-09-27** — the `frontend-ui-architecture` skill (code organization: where components,
  constants, helpers, types and business logic live) is deliberately **project-agnostic**, and
  focuses on organization only so it does not duplicate `react-best-practices`. DevDigest's own
  layout (`_components/<Name>/`, `styles.ts` → `s`, `lib/hooks/<resource>.ts`) stays in
  `client/CLAUDE.md`, which the skill defers to ("the project's own documents win"). Rejected:
  baking DevDigest conventions into the skill, which would duplicate `client/CLAUDE.md` and
  present house rules as universal. The research the skill was built from lives inside it, in
  `research/`, rather than at the repo root.
  **Evidence 2026-09-27:** `.claude/skills/frontend-ui-architecture/SKILL.md:14` — the
  "project's own documents win" clause.

- **2026-09-27** — `pr-self-review` keys its verdicts by a **content hash** of the reviewable
  diff (`path → blob id` from merge-base, `diffHash` in
  `.claude/skills/pr-self-review/scripts/lib/git.mjs:84`), not by the HEAD SHA. The gate hashes
  merge-base..HEAD and looks the verdict up by that hash (`scripts/gate.mjs:27`). Reviewing
  uncommitted work and then committing exactly that work keeps the verdict valid, and any other
  edit, including one that follows a waiver, makes it stale. Rejected: keying by SHA, which
  forces a full re-review after every commit of already-reviewed work.

- **2026-09-27** — the `pr-self-review` gate decides "is this a push / PR" by tokenizing the Bash
  line (`isGatedCommand`, `.claude/skills/pr-self-review/scripts/lib/command.mjs:115`), not by regex. A
  plain `\bgit\s+push\b` search blocked any command that merely *mentioned* the words: an `echo`, a
  `grep`, a commit message, or a heredoc that writes a test file. It also missed `git -C server push`.
  Quoted text and heredoc bodies are data; `&&` `;` `|` and subshells split commands; env assignments
  and git global options are skipped. Rejected: keeping the regex and adding exceptions, which cannot
  tell a quoted mention from a real command. Accepted limit: `eval` and scripts that push are not seen.

- **2026-10-04** — a finding about how a skill behaves goes to the root file with a
  ``**Skill:** `<name>` `` line beneath it, not into a per-skill insights file. Rejected: an
  `INSIGHTS.md` inside each `.claude/skills/<name>/` folder. A file next to `SKILL.md` is read
  only if `SKILL.md` links to it, six of the folders are installed from upstream
  (`skills-lock.json`) so that link would fork them, and whether `npx skills update` keeps an
  extra file there was not verified. A grep before writing found one skill-level entry in all
  five files, too few to justify fourteen new ones. The tag is a line beneath the entry because
  entries are never reworded. Review subagents read it through the grep in their prompt
  (`{skill_name}`, `.claude/skills/pr-self-review/scripts/prepare.mjs:45`). Revisit with a tree
  outside the skill folders if tagged entries pile up here.
  **Evidence 2026-10-04:** `.claude/skills/engineering-insights/SKILL.md:50` — the routing row;
  `.claude/skills/pr-self-review/references/reviewer-prompt.md:15` — the grep step.
  **Skill:** `engineering-insights`

- **2026-10-04** — the `planner` and `implementer` agents (`.claude/agents/`) share skills
  through the plan, not through the `skills:` frontmatter field. `skills:` injects each listed
  skill's full body into every run and is not an allowlist, so both leave it empty: the planner
  maps each planned file to skills through the globs in
  `.claude/skills/pr-self-review/routing.json` and copies the matching `critical_rules` IDs into
  the plan's "Rules to respect" column, and the implementer loads the named skills per phase
  with the Skill tool. Both set an explicit `tools` allowlist, because omitting `tools` inherits
  every tool. The planner has `Read, Grep, Glob` only and returns the plan as text; the main
  session saves it to `specs/<feature>-plan.md` after the user approves it. The implementer has
  no Agent tool and does not commit, push or review. Rejected: `Write` for the planner
  (read-only would then rest on prose); a `PreToolUse` path-guard hook on the implementer (user
  chose prompt-only protection of migrations, lock files and `client/src/vendor/**` — revisit
  if it ever edits one); `model: inherit` for the implementer.
  **Evidence 2026-10-04:** `.claude/agents/planner.md:61` — "Step 3 — map the files to skills";
  `.claude/agents/implementer.md:33` — "Load skills per phase". The `skills:` and `tools`
  behaviour is from code.claude.com/docs/en/sub-agents, read through a WebFetch summary, not
  verified against the raw page.
  **Evidence 2026-10-04 (anchors moved):** `.claude/agents/planner.md:67` — "Step 3 — map the
  files to skills"; `.claude/agents/implementer.md:62` — "Load skills per phase".
  **Superseded 2026-10-04 in part:** "one implementer run builds the plan and writes its tests"
  no longer holds — see the next entry. The skills-through-the-plan rule and the tool sets stand.
  **Superseded 2026-10-15 in part:** `planner` is now `implementation-planner` (`.claude/agents/implementation-planner.md`) and its output is an "Implementation Plan"; the skills-through-the-plan rule and the tool set stand — see the 2026-10-15 entry below.

- **2026-10-04** — `test-writer` owns every test; `implementer` writes none and builds one phase
  per run. User decision, against the planner's recommendation to leave planned tests with the
  implementer. The order per phase is implementer → `test-writer`, and the phase is closed (and
  committed) only when `test-writer`'s `Verify (phase)` run is green, so the tree is red on
  purpose in between. `test-writer` may change an existing test's expectation only when it can
  quote a plan or spec item that changes that behaviour; a failure no item explains is left
  failing and reported as a suspected regression (`repair the existing tests`,
  `.claude/agents/test-writer.md:89`). `plan-verifier` traces every edited or deleted existing
  test back to such an item. The implementer runs `typecheck` and `test` once before the first
  phase and stops on a red baseline (`establish the baseline`, `.claude/agents/implementer.md:31`);
  a baseline with skipped integration files is `incomplete`, not a stop, because those files skip
  by design without Docker. Two consequences found in the repo: the client's `typecheck` covers
  its test files, so an implementer phase can end with `typecheck` red inside `*.test.tsx` — its
  bar is "clean outside test files"; and testability seams (`server/src/adapters/mocks.ts`,
  accessible names, seed data) are production code, planned as implementer work. Rejected:
  test-first for planned features (phases would start red and the plan would have to pin every
  signature); `test-writer` forbidden to touch existing tests (nobody would own the tests a
  planned behaviour change breaks).
  **See also:** `specs/plans/agents-lab.md` — the plan, with sources.

- **2026-10-04** — `architecture-reviewer` (`tools: Read, Grep, Glob`) is advisory and gates
  nothing; `/pr-self-review` stays the only push gate and `pnpm arch:check` stays the owner of
  import-graph facts. The agent reuses the rule IDs and the CRITICAL bar from
  `.claude/skills/pr-self-review/routing.json`, so it cannot introduce a second severity scale.
  It has no `Bash`, so the main session hands it the file list, a patch file and the `arch:check`
  result. `plan-verifier` has `Bash` to re-run `Verify` commands, so its read-only behaviour is
  prompt-level, like `researcher`'s. Both are required for a plan with more than one phase.
  Rejected: `Bash` for the reviewer (read-only would rest on prose).
  **Evidence 2026-10-04:** `.claude/agents/architecture-reviewer.md:4`, `.claude/agents/plan-verifier.md:4` — the `tools:` lines.

- **2026-10-05** — review findings go back into the plan as an amendment, not as loose fix instructions: `planner` returns a numbered list of exact replacements for the existing plan text plus one new "review fixes" phase, the main session applies the list with a script (line-prefix asserts, bottom-up inserts) and `implementer` / `test-writer` / `plan-verifier` then work from the revised file. Used for `specs/plans/L03-intent-layer.md` revision 3 (45 replacements, phase 10). Rejected: asking `planner` to re-emit a 650-line plan, and telling `implementer` what to fix without changing the plan — `plan-verifier` would then report every fix as a deviation.
- **2026-10-05** — when a feature is uncommitted on a branch that already carries unrelated commits, the reviewers get `git diff HEAD` and base ref `HEAD`; the `git merge-base origin/main HEAD` patch of `.claude/agents/README.md` step 5 would have added 18 unrelated files (3192 lines) to the change. And when `test-writer` is skipped for an iteration, every later `implementer` run is told the baseline in full (which tests are known red and why): it has no Test report to start from, and `plan-verifier` returns `FAIL` by construction until the tests exist.
- **2026-10-10** — a phase whose integration test could not run was committed with that stated in the commit body, instead of being left uncommitted until green, because the next phase edits the same files and the two would otherwise merge into one commit. The phase stays open in the main session's tracking and the gap is recorded as an Open Question in the owning module. This departs from step 4.5 of the feature workflow ("Commit the closed phase", `.claude/agents/README.md:84`); rejected: stopping all work until the environment recovers.
- **2026-10-15** — the `spec-creator` agent's write scope is enforced by a `PreToolUse` hook in its own frontmatter (`hooks:` → `matcher: "Write|Edit"`, `.claude/agents/spec-creator.md:8`), running `.claude/agents/scripts/specs-only-guard.mjs` (`SPEC_DIRS`, line 9): only `*.md` under `specs/`, `server/specs/`, `client/specs/`, `reviewer-core/specs/`, `mcp/specs/`; `..` and symlinks resolved, unparseable input blocked (exit 2). `e2e/specs/` is excluded because its flow JSON and index belong to `test-writer`. This departs from the 2026-10-04 choice of prompt-only protection for `implementer` because `spec-creator`'s allowed set is small and fixed, so a guard cannot get in the way of legitimate work. The agent runs in two passes — `discovery` writes nothing and returns Questions / Design gaps / UX proposals, `write` applies the user's answers — because a subagent cannot ask the user mid-run. Rejected: a skill in the main session (could ask directly, but no hard tool boundary); prompt-only scope. Unverified: the guard was tested by piping hook JSON into the script; that a frontmatter hook fires inside a live subagent run has not been observed yet.
  **Evidence 2026-10-16:** the "Unverified" point is settled — in a live `spec-creator` subagent run, `Write` to `client/src/hook-test.md` returned `PreToolUse:Write hook error: [node "$CLAUDE_PROJECT_DIR"/.claude/agents/scripts/specs-only-guard.mjs]: specs-only-guard: client/src/hook-test.md is not in a spec folder. …`, `specs/plans/hook-test.md` was blocked with `… is a plan; plans are saved by the main session.`, and `specs/hook-test.md` was written (then deleted). The frontmatter hook fires inside subagents in this trusted folder (`.claude/agents/spec-creator.md:8`).
- **2026-10-15** — `planner` was renamed `implementation-planner` and stripped of requirement work: it never writes, extends or rewords a requirement ("Requirements are not yours", `.claude/agents/implementation-planner.md:13`; review pass at `:130`), every `Done when` cites an `AC-n` / `R-XXX-n`, and a feature with no `approved` spec is sent back to `spec-creator` (bugs and small technical changes are still planned from their description). It runs in two passes — `review` (requirement findings, clarifications, recommendations marked "changes the spec", and the execution-mode question) and `plan` — and a recommendation that changes the spec goes through `spec-creator` and a fresh approval before the plan is written. The execution mode is chosen by the user per plan: **multi-agent** (implementer → test-writer per phase, then plan-verifier and architecture-reviewer) or **single-agent** (the main session builds code and tests from the same plan template, `plan-verifier` optional) — `.claude/agents/README.md`, "Feature workflow". Rejected: one implementer run doing code and tests in single-agent mode (would break the T1 split); recording spec-changing recommendations only in the plan's Assumptions (spec and code would drift). Old plan files under `specs/` keep the title "Development Plan" and the name `planner`; they were not rewritten.
- **2026-10-16** — approved plans live in `specs/plans/<feature>.md`, under the same name as the umbrella spec they build, instead of `specs/<feature>-plan.md` next to the specs (`specs/README.md`, under "Naming"). The seven existing plans were moved with `git mv` and every reference updated, including the paths cited in existing `INSIGHTS.md` entries, edited in place at the user's request. The `spec-creator` guard now rejects anything under `specs/plans/` (`.claude/agents/scripts/specs-only-guard.mjs`, the `specs/plans/` check), so a plan is never written by the spec agent — before, only its prompt said so. Rejected the same day: moving every artifact into `specs/<feature>/` folders — tried, then dropped from history; the umbrella in `specs/` plus detail in `<package>/specs/` stays.
- **2026-10-16** — plan execution is orchestrated by the `execute-plan` skill with a state file, and `implementer` / `test-writer` read a one-phase slice of the plan, because the cost measurements under Tool & Library Notes put the orchestrating chat (318M cache tokens) and the whole-plan read far above the test runs. `node .claude/agents/scripts/plan-phase.mjs <plan> <n>` keeps every `##` section and narrows `## Phases` to `### <n> · …` (`slicePhase`, `.claude/agents/scripts/lib/plan.mjs`) — no heuristic about which sections matter, so a legacy plan keeps its `## Design`. `state.mjs` (`.claude/skills/execute-plan/scripts/state.mjs`, `nextAction`) records phases, closing lines, declared deviations and insight candidates in `.devdigest/sdd/<feature>/state.json` (git-ignored) and prints a `CHECKPOINT` asking for a new chat after `per_chat` (default 3) committed phases. Side fix: `plan-verifier` now gets the implementer's declared deviations, which no step passed before. Rejected (user decision): committing the state next to the plan (a noise commit per phase); a forced new chat every 2 phases or never.
- **2026-10-16** — `implementation-planner` gained an `amend` pass and `implementer` now reads the spec. `amend` takes a saved plan and the gaps (plan-verifier rows, architecture findings, live-run defects), triages each as code / test / plan defect / spec / not a gap, and returns exact-quote replacements plus one new fix phase in the normal template; spec gaps go back to `spec-creator` (`.claude/agents/implementation-planner.md`, "Amend pass"). It formalises the L03 revision-3 practice above and is what `execute-plan`'s fix round calls (`nextAction` in `.claude/skills/execute-plan/scripts/state.mjs`). The implementer reads the module spec of each package its phase touches and the umbrella rows its `Done when` cites, because the planner may not restate the spec and the implementer otherwise never saw the exact requirement text; a spec / plan mismatch is reported as Blocked (`.claude/agents/implementer.md`, Step 1 item 2 and "A real conflict is not"). Rejected: `plan-phase.mjs` appending the cited spec rows (breaks on older specs without `R-` IDs and misses contract sections, which are not table rows); a per-phase "Spec sections" list written by the planner.
- **2026-10-19** — applied recommendations 1–5 of the L05 PR Brief retro (`docs/retros/l05-pr-brief.md`), whose two review-fix rounds (≈ $41) came from misplacements that only the final architecture review saw. (1) `implementer` runs a layer and placement self-check before `complete` — rules in `service.ts`, `domain.ts` importing ports, single-consumer code in a shared folder, a ref read during render — and reports it as a Verification row (`.claude/agents/implementer.md:131`). (2) `/execute-plan` runs `architecture-reviewer` on the last original phase that touches `server/`/`reviewer-core/` and on the last that touches `client/`, after green and before the commit; `state.mjs` reads the area from each file-table row (`AREAS`, `gateAreas` at `.claude/skills/execute-plan/scripts/state.mjs:24`, `:93`) and refuses `committed` until `state.mjs gate <plan> <n> pass|skipped`. On the L05 plan without its fix phases that lands on phases 5 and 8. Phases added by an amendment skip it, because the final checks run again right after them. (3) The spec `write` and planner `plan` passes start a fresh agent that reads `.devdigest/sdd/<feature>/discovery.md` / `review.md`, saved by the main session (spec-creator's guard and the planner's tool list stop the agents saving them) — `.claude/agents/README.md:86`, `:104`. (4) The `Verify (manual, screenshots)` line runs in a short-lived `general-purpose` sub-agent that saves screenshots to files and returns a row per item, so images stay out of the orchestrating chat (`.claude/skills/execute-plan/SKILL.md:69`). (5) `scripts/e2e.sh` resolves `AGENT_BROWSER_BIN` and exits instead of warning (`resolve_agent_browser`, `scripts/e2e.sh:58`). Rejected: driving the architecture check from the skill text only (the orchestrator follows `NEXT`, which would never mention it); a dedicated `ui-checker` agent (more upkeep for one step); the check after every phase (≈ $6 a run, and earlier phases are re-read by the last one anyway).
  **Skill:** `execute-plan`

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
**Evidence 2026-09-26:** `.github/workflows/server-integration.yml:3-5` — every test file starts a fresh
testcontainer Postgres and migrates from zero, the lane that catches a broken history; the
history itself is `server/src/db/migrations/meta/_journal.json:4`.

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
**Evidence 2026-09-26:** `CLAUDE.md:59` — `reviewer-core`/`e2e` use npm; `CLAUDE.md:92-96` — lock files are
do-not-touch, including `reviewer-core/package-lock.json`, the one this clobbered.

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
**Evidence 2026-09-26:** `.mcp.json:5-11` — the `args` carry no `--no-page-id-routing`, so routing is on.
The error string above is the proof; the `pageId` type is the tool's input
schema.

### A shell command that only writes a Markdown file starts the dev stack and never returns
**Date:** 2026-10-07
**Cause:** the file's text was passed to `python3 - <<E` with an unquoted delimiter. In an unquoted
heredoc the shell still expands `$VAR`, `$(…)` and backticks, so every inline-code span of the
Markdown ran as a command: `./scripts/dev.sh` started a second stack (migrate and seed
included) and blocked the call until its timeout; an `npm i …` span further down would have
installed into the repository root.
**Fix / rule:** quote the delimiter (`<<'PYEOF'`) whenever a heredoc body holds prose, Markdown or
code, or write the file with the editor tool instead of the shell. After such a slip, look for
the processes it left (`ps -o pid,pgid,command`) and stop that process group before anything else.
**Evidence:** no repo line shows it; the stray `bash ./scripts/dev.sh` and its `tsx watch` child
were found in the process list and stopped, and `docs/hw3-video-script.md` was then written with
the editor tool.
### `/context` and `/mcp` showed no change after an MCP server's environment was edited
**Date:** 2026-10-11
**Cause:** an open Claude Code session keeps the server process it already started. Adding or removing a server showed up in open sessions, but changing the `env` of an existing entry did not restart that server: three sessions kept running the old, unrestricted GitHub container for ten minutes after the entry was changed.
**Fix / rule:** after changing an existing MCP entry, reconnect that server in `/mcp` or reload the window before reading `/context`; check the running process (for a Docker server, `docker inspect` its environment and start time) before concluding the change did not work. Do not rewrite the entry a second time to "fix" it.
**Evidence:** nothing in the repository shows it — the entry is in the user-scope config. The project-scoped equivalent is the `devdigest-mcp` entry, `.mcp.json:14-17`, where an `env` edit needs the same reconnect.

### plan-verifier flags a test-writer's `e2e/specs/README.md` row as a "Do not touch" breach
**Date:** 2026-10-17
**Cause:** the L05 plan's Constraints said "Do not touch … every `CLAUDE.md`, `README.md` and `docs/**` (doc-writer)", but the test-writer brief requires a new flow's row in the flow index.
**Fix / rule:** a plan's "do not touch every README.md" constraint exempts `e2e/specs/README.md`, and an e2e phase names that row in its Tests line.
**Evidence:** `.claude/agents/test-writer.md:73` ("add its row to `e2e/specs/README.md`"); `specs/plans/L05-project-context.md` Constraints, as amended.

### A feature passes every check and still looks nothing like the design
**Date:** 2026-10-17
**Cause:** the L05 Project Context page shipped with no horizontal padding, a wrapping title and loose placeholder text, although plan-verifier, architecture-reviewer, 20 `/pr-self-review` reviewers and e2e all passed. The spec described the layout only structurally ("two columns, like N6"); the implementer built from that text, never from the bundled design; every check reads code, accessibility trees or text, none looks at pixels. The user found it from a screenshot.
**Fix / rule:** a plan phase that builds a new screen carries a `Verify (manual, screenshots)` line naming the design screen and what to compare, run by the main session in one browser tab; give the implementer the decoded design values (padding, widths, panels), not just the screen name.
**Evidence:** `specs/plans/L05-project-context.md:399` (the screenshot Verify added in the phase-14 fix); decoding the design: see the 2026-09-22 Tool & Library Notes entry on `__bundler/manifest`.
**2026-10-19:** the screenshot line is now run by a short-lived sub-agent, not the main session, and it returns rows instead of images (`.claude/skills/execute-plan/SKILL.md:69`); the rule above still holds.


## Open Questions

- **2026-10-29** — `onion-architecture` says two different things about a baselined legacy service that a task touches: `SKILL.md:132` ("Do not refactor unrelated leaks in a feature PR"; run `pnpm arch:baseline` only if the task fixes one) and `references/composition-root-di.md:57` ("Existing services are migrated only when a task already touches them. When one is, run `pnpm arch:baseline` in the same PR"). In a fixture eval (add one endpoint to a `ReviewsService` that takes the whole `Container`) the with-skill run left the service as it was and flagged a follow-up, so it took the `SKILL.md` reading. Open: does "touches" mean any edit to the file or a change to that service's behaviour? Settling it means editing the skill's text, which is the user's decision. (`.claude/skills/onion-architecture/SKILL.md:132`, `.claude/skills/onion-architecture/references/composition-root-di.md:57`)
  **Skill:** `onion-architecture`
  **Resolved 2026-10-29:** the user asked for it fixed; "touches" now means the task edits the service or its repository (one new method counts), so that file is migrated and the baseline shrunk in the same PR, while files the task does not open stay as they are. Edited `SKILL.md:132` and `references/composition-root-di.md:57`, skill version 1.1.0. A re-run of the fixture case migrated the service and removed its two baseline entries; before the edit the same run left it alone.

## Session Notes

- **2026-09-20** — added the `engineering-insights` skill and restructured all five
  `INSIGHTS.md` files onto the eight-rubric format; recorded the `LEARNINGS.md` decision above.
  **Evidence 2026-09-26:** commit `d345e57`; `.claude/skills/engineering-insights/SKILL.md:1`.
- **2026-09-20** — installed and verified the `chrome-devtools` MCP server
  (`chrome-devtools-mcp@1.9.0`) through a project `.mcp.json`; captured the `pageId` routing trap,
  the telemetry defaults, and the drive-it-don't-handshake-it smoke-test rule.
  **Evidence 2026-09-26:** commit `642ae2d`; `.mcp.json:1-14`.
- **2026-09-20** — verified the `chrome-devtools` server by driving the real click-through
  (root → PR #482 → Agent runs) and screenshotting it; captured the `wait_for` array/casing trap,
  the post-redirect click trap, and the `<main>`-scroller rule in `client/INSIGHTS.md`.
  **Evidence 2026-09-26:** commit `642ae2d`; `client/src/vendor/ui/shell/AppFrame.tsx:29`.
- **2026-09-22** — scoped and speced the findings-counter feature (`specs/L01-findings-counter.md`
  + module specs); decoded the bundled design mockup to find the CRITICAL/WARNING/SUGGESTION
  badge pattern and confirmed a ready-made `SeverityBadge` primitive already supports `count`.
  **Evidence 2026-09-26:** commit `6c962c9`; `specs/L01-findings-counter.md:1`;
  `client/src/vendor/ui/primitives/Badge.tsx:52` (`SeverityBadge`).
- **2026-09-22** — implemented the findings-counter feature end to end (server: `agent_runs`
  migration 0011, `rollupSeverities` casing fix, `PrMeta`/`RunSummary` contract additions,
  the PR-list query, seed-data backfill; client: `FindingsPanel` counter+filter,
  `RunHistory` per-severity badges, the new `FindingsPopover`); server (104 hermetic + 30
  integration) and client (55) tests green, both typecheck clean, and the live dev server
  verified end-to-end via curl against real backfilled data. Browser-based interaction
  verification (hover popover, filter clicks) was skipped due to the chrome-devtools
  profile-lock issue recorded above.
  **Evidence 2026-09-26:** commit `6c962c9`; `server/src/db/migrations/0011_ambiguous_slyde.sql:1`.
- **2026-09-26** — fixed the clipped PR-list findings popover (portaled to `<body>`) and added the
  same popover to Agent-runs Timeline tiles; unblocked the chrome-devtools browser (window-placement
  cause, recorded above) and checked both popovers in a real browser. Recorded the table-card
  clipping rule in `client/INSIGHTS.md`.
  **Evidence 2026-09-26:** uncommitted on `feature/finding-counter`;
  `client/src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx:101`
  (`createPortal`).
- **2026-09-27** — researched React/Next.js code-organization practice (~110 graded sources) and
  built the `frontend-ui-architecture` skill (v1.0.0) from it; recorded the retired
  `next-best-practices` source here and the missing client linter in `client/INSIGHTS.md`.
  **Evidence 2026-09-27:** uncommitted on `feature/finding-counter`;
  `.claude/skills/frontend-ui-architecture/SKILL.md:1`.
- **2026-09-27** — built the `pr-self-review` skill (manifest routing of changed files to skills, `arch:check`, subagent reviewers, a CRITICAL gate on `gh pr create`). Recorded the dot-segment glob quirk, pnpm `-s`, the hook self-modification denial and the content-hash decision.
- **2026-09-27** — pr-self-review now gates `git push` as well as `gh pr create`, and the hook is registered in `.claude/settings.json`. The command check is a tokenizer (entry under Decisions). Architecture refactor S1/C1 reviewed over `f108012..HEAD` and pushed. **See also:** `server/INSIGHTS.md`.
- **2026-10-04** — added skill-level routing to `engineering-insights`: a `**Skill:**` line on root entries, read by `pr-self-review` reviewers through a grep step in their prompt and by a new row in the root `CLAUDE.md` gate. Tagged the existing `next-best-practices` entry. Decision recorded above.
- **2026-10-04** — added the `planner` and `implementer` agents under `.claude/agents/` after a `researcher` pass over the Claude Code sub-agent and skill docs; recorded how they share skills under Decisions. Neither agent has been run on a real feature yet.
- **2026-10-04** — added `test-writer`, `architecture-reviewer`, `plan-verifier` and `doc-writer` from `specs/plans/agents-lab.md` (planner → implementer → plan-verifier, the first real run of that chain) and moved test ownership to `test-writer`; decisions recorded above. A subagent type added mid-session is not available to the `Agent` tool until the session reloads it — `plan-verifier` was run by pointing a general-purpose agent at its file. Its verdict was FAIL on one item: the overlap paragraph in `architecture-reviewer.md` is longer than the "two or three sentences" the plan asked for.

- **2026-10-05** — L03 Intent Layer through the full agent chain: phases 1–8, first review, plan revision 3, phase 10, tests for every phase, second review. Module findings are in `server/`, `client/` and `reviewer-core/` `INSIGHTS.md`.
- **2026-10-07** — L03 Smart Diff through the full agent chain: nine phases, plan-verifier FAIL on one gap (two diff bodies rendered together), fix round, hermetic e2e 11/11. Module findings are in `server/`, `client/` and `e2e/` `INSIGHTS.md`.
- **2026-10-07** — HW3 delivery: demo PRs #13 and #15, PR #14 description with screenshots, the demo video recorded with `agent-browser` (script in `docs/hw3-video-script.md`); recorded the unquoted-heredoc slip above and the reviewer line-number question in `reviewer-core/INSIGHTS.md`.
- **2026-10-10** — L04 part 1, `devdigest-mcp`, a fifth package: research, plan revisions 1–3 (the lab page read in the third), six phases, architecture review, docs. Module findings are in `mcp/` and `server/`; the Docker and Chrome failures and the commit-with-a-gap decision are above.
- **2026-10-11** — L04 follow-up: `devdigest-mcp` connected in Claude Code and driven by hand; the lab's token audit done manually with a local GitHub MCP server (figures and the stale-session trap above). No code changed.
- **2026-10-15** — added the `spec-creator` agent (spec-driven development, EARS acceptance criteria, discovery → write passes, hook-enforced `specs/` scope) after a Q&A with the user on its design; decision recorded above. Not run on a real feature yet.
- **2026-10-15** — renamed `planner` to `implementation-planner`, removed its requirement work, added the review pass and the multi-agent / single-agent execution mode; decision recorded above. Not run on a real feature yet.
- **2026-10-16** — renamed `specreator` to `spec-creator`; moved plans into `specs/plans/` and blocked that folder for `spec-creator`; decision recorded above.
- **2026-10-16** — compared `spec-creator` with the course's reference agent: adopted a self-check, date-based Spec IDs, vague-to-EARS examples, the named reviewer-core invariants; tool note above.
- **2026-10-16** — audited the SDD agent chain (spec-creator → implementation-planner → implementer / test-writer → plan-verifier, architecture-reviewer) for workflow and token cost; cost measurements under Tool & Library Notes. No agent file changed.
- **2026-10-16** — later the same session: built plan slicing (`plan-phase.mjs`) and the `execute-plan` skill with its state file; decision recorded above. Neither has run on a real feature yet.
- **2026-10-16** — `implementer` reads the spec, `implementation-planner` has an `amend` pass, and the `spec-creator` write guard was observed blocking in a live subagent run; decision and evidence recorded above.
- **2026-10-16** — first real `spec-creator` run: L05 Project Context, discovery → write → amend,
  approved as `specs/L05-project-context.md` + server, client, reviewer-core module specs; tips above.
- **2026-10-16** — L05 Project Context planned: the `implementation-planner` review (19 findings), a
  reopen-as-draft amendment through `spec-creator` (P3 deferred to fit the lab's scope), and the
  plan saved as `specs/plans/L05-project-context.md` (11 phases, multi-agent); entries above.
  **See also:** `server/INSIGHTS.md` (tokenizer).
- **2026-10-17** — L05 Project Context executed: phases 7–11, a fix round (plan amended twice, R-WEB-44 reopened and re-approved), phases 12–13, docs, e2e 13/13. **See also:** `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/INSIGHTS.md`.
- **2026-10-17** — L05 follow-up: design gaps found by the user after push → phase 14 (N6/N2b/N2c styling, style-collision warning), final checks re-run, e2e 13/13. Deferred: `SafeMarkdown` has no `img` rule (`![x](javascript:…)` renders `<img src="">`).
- **2026-10-17** — the deferred `SafeMarkdown` image follow-up is closed: no `<img>` is rendered at all, only the alt text (a remote image would call out from the viewer's browser; `javascript:` gave `src=""`). See `client/src/components/safe-markdown/SafeMarkdown.tsx` (`img` renderer).
- **2026-10-18** — L05 PR Brief specified and planned, no code: specs approved (AC-19 reworded once after the planner's review), plan amended after a cross-model review; `/execute-plan` to run with `--per-chat 5` (phases 1–5 are server-only, no screenshots). **See also:** `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`.
- **2026-10-18** — L05 PR Brief built with `/execute-plan` (11 phases, two of them review fixes); final checks: plan-verifier and architecture-reviewer pass (round 3), docs, hermetic e2e 14/14. Entries in `server/`, `client/` and `e2e/` INSIGHTS.
- **2026-10-19** — applied the L05 PR Brief retro recommendations 1–5 on `chore/workflow-retro-fixes`: implementer self-check, per-area architecture check in `state.mjs` (17/17 tests), file handoff between spec and plan passes, sub-agent screenshot check, `e2e.sh` agent-browser resolver; superseded the 2026-10-16 "resume with SendMessage" entry.
- **2026-10-29** — evals for the `engineering-insights` and `onion-architecture` skills (fixture repos, with/without-skill runs, 33 + 8 assertions): only the transaction-ownership case separated the runs; entries above. Cases and fixtures are in each skill's `evals/` folder.

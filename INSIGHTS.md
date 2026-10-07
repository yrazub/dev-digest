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
  **See also:** `specs/agents-lab-plan.md` — the plan, with sources.

- **2026-10-04** — `architecture-reviewer` (`tools: Read, Grep, Glob`) is advisory and gates
  nothing; `/pr-self-review` stays the only push gate and `pnpm arch:check` stays the owner of
  import-graph facts. The agent reuses the rule IDs and the CRITICAL bar from
  `.claude/skills/pr-self-review/routing.json`, so it cannot introduce a second severity scale.
  It has no `Bash`, so the main session hands it the file list, a patch file and the `arch:check`
  result. `plan-verifier` has `Bash` to re-run `Verify` commands, so its read-only behaviour is
  prompt-level, like `researcher`'s. Both are required for a plan with more than one phase.
  Rejected: `Bash` for the reviewer (read-only would rest on prose).
  **Evidence 2026-10-04:** `.claude/agents/architecture-reviewer.md:4`, `.claude/agents/plan-verifier.md:4` — the `tools:` lines.

- **2026-10-05** — review findings go back into the plan as an amendment, not as loose fix instructions: `planner` returns a numbered list of exact replacements for the existing plan text plus one new "review fixes" phase, the main session applies the list with a script (line-prefix asserts, bottom-up inserts) and `implementer` / `test-writer` / `plan-verifier` then work from the revised file. Used for `specs/L03-intent-layer-plan.md` revision 3 (45 replacements, phase 10). Rejected: asking `planner` to re-emit a 650-line plan, and telling `implementer` what to fix without changing the plan — `plan-verifier` would then report every fix as a deviation.
- **2026-10-05** — when a feature is uncommitted on a branch that already carries unrelated commits, the reviewers get `git diff HEAD` and base ref `HEAD`; the `git merge-base origin/main HEAD` patch of `.claude/agents/README.md` step 5 would have added 18 unrelated files (3192 lines) to the change. And when `test-writer` is skipped for an iteration, every later `implementer` run is told the baseline in full (which tests are known red and why): it has no Test report to start from, and `plan-verifier` returns `FAIL` by construction until the tests exist.

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
- **2026-10-04** — added `test-writer`, `architecture-reviewer`, `plan-verifier` and `doc-writer` from `specs/agents-lab-plan.md` (planner → implementer → plan-verifier, the first real run of that chain) and moved test ownership to `test-writer`; decisions recorded above. A subagent type added mid-session is not available to the `Agent` tool until the session reloads it — `plan-verifier` was run by pointing a general-purpose agent at its file. Its verdict was FAIL on one item: the overlap paragraph in `architecture-reviewer.md` is longer than the "two or three sentences" the plan asked for.

- **2026-10-05** — L03 Intent Layer through the full agent chain: phases 1–8, first review, plan revision 3, phase 10, tests for every phase, second review. Module findings are in `server/`, `client/` and `reviewer-core/` `INSIGHTS.md`.
- **2026-10-07** — L03 Smart Diff through the full agent chain: nine phases, plan-verifier FAIL on one gap (two diff bodies rendered together), fix round, hermetic e2e 11/11. Module findings are in `server/`, `client/` and `e2e/` `INSIGHTS.md`.
- **2026-10-07** — HW3 delivery: demo PRs #13 and #15, PR #14 description with screenshots, the demo video recorded with `agent-browser` (script in `docs/hw3-video-script.md`); recorded the unquoted-heredoc slip above and the reviewer line-number question in `reviewer-core/INSIGHTS.md`.

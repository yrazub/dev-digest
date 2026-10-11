# Insights — `@devdigest/e2e`

Traps we have already hit in the browser suite. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## Tool & Library Notes

- **2026-10-02** — `agent-browser record start <file.mp4> --cursor` records a demo video but needs
  ffmpeg with libx264/libvpx on PATH (`agent-browser doctor` checks it). With no Homebrew, `npm i
  ffmpeg-static` in a scratch dir and symlinking its binary onto PATH works; that build also has
  libass, so `-vf subtitles=x.srt` burns captions in. To leave LLM waits out of the video, `record
  stop` before the wait and `record start` a new segment after, then concat the segments and shift
  each caption by the summed segment durations. No repo line governs this; the suite's browser
  config is `agent-browser.json:3` (`"headed": false`).
- **2026-10-02** — `agent-browser set viewport 1440 900` sent before any page is open does not stick:
  a session launched by the next `open` records at its default 1280×578. Run `open about:blank`
  first, then `set viewport`. Also `fill <sel> ''` does not fire React's `onChange` (the filter keeps
  its old text); clear with `press Backspace` instead. External-tool behaviour, no repo line;
  browser config is `agent-browser.json:3`.
- **2026-10-07** — `agent-browser find role <role> --name <text>` matches the accessible name as a
  case-insensitive substring unless `--exact` is passed (`agent-browser find --help`), so
  `--name "Boilerplate"` finds the group header button whose full name is the label, the hint and
  the file count (`specs/11-pr-smart-diff.flow.json`). Pick a substring no other button shares.
- **2026-10-07** — a `SectionLabel` is uppercased by CSS. Flow `11` asserts it with
  `wait --fn "document.body.innerText.toLowerCase().includes('…')"` (`specs/11-pr-smart-diff.flow.json:14`),
  which passed in the hermetic run. Whether `wait --text` with the authored casing would also
  pass was not tried; the test-writer chose `--fn` because the binary's text check reads
  `innerText`, which carries the transformed casing. Every other flow uses `--text` on text that
  no CSS transforms.
- **2026-10-11** — `agent-browser find` does not wait: when nothing matches it exits non-zero in
  about 50 ms (`✗ No element found by label '…'`, or `✗ N elements have role "link", but none match
  name "…"`), and when several elements match it takes the first without an error
  (`find role button click --name e` answered `✓ Done`). `runStep()` therefore retries a `find` step
  for up to `E2E_FIND_WAIT`, only while `isNoMatch()` recognises one of those two wordings
  (`run.ts:64`, `lib/assert.ts:60`); a new CLI wording would silently disable the retry.
- **2026-10-11** — flows `08` and `09` write to the database, so a second `npm test` against the same
  seeded stack fails at "the new skill's page opens" and "the three seeded candidates are listed".
  `pnpm db:seed` does not reset anything, and after dropping and re-seeding the schema the running
  API answered `GET /repos` with `[]` until it was restarted. Rerun on a fresh stack
  (`../scripts/e2e.sh` starts an ephemeral Postgres each time).


## Recurring Errors & Fixes

### Flows `02`, `04` and `05` fail locally but pass in CI
**Date:** starter
**Cause:** the flows follow the home redirect to the *first* repo, so they assume the
seeded demo repo is the only one. CI seeds an empty database; your dev DB usually has
other repos you imported, so the redirect lands somewhere else.
**Fix / rule:** run `npm run e2e:hermetic`, which boots its own freshly-seeded stack on
alternate ports and leaves your dev DB alone. Never "fix" this by resetting your dev
database — and never with `docker compose down -v`, which deletes the volume and every
repo and review in it.
**Evidence 2026-09-26:** first recorded 2026-09-19, in commit `7aca026` (its **Date** field says "starter").
`specs/04-pr-findings.flow.json:5-6` — the flow opens `/` and follows the redirect to `/pulls`,
which lands on the *first* repo; `../scripts/e2e.sh:3-5` — the hermetic stack on alternate ports.

### Flows `04` and `05` fail intermittently at "open the PR row", even on the hermetic stack
**Date:** 2026-09-30
**Cause:** not the multi-repo precondition above: it happened on a freshly seeded stack. Both
flows clicked the PR row right after `wait --url /pulls`, which passes as soon as the route
changes, before the PR list has fetched and rendered. `02` never flaked, because it waits for
the row's text first. `04` failed on one run and `05` on the other.
**Fix / rule:** in a flow, `wait --text` for the element before any `find … click` on it.
`wait --url` only proves navigation, not that the data has rendered.
**Evidence:** `specs/04-pr-findings.flow.json` and `specs/05-pr-diff.flow.json` now carry the
"seeded PR title row is visible" wait step, copied from `specs/02-repo-pulls-detail.flow.json:7`.
Hermetic runs before the fix: 7/8, then 6/8. After: 8/8.
**Evidence 2026-10-01:** the same race hit `08-skills` at "switch to the Skills tab": it clicked
the tab right after `wait --url /agents/`, before the editor rendered (the failure screenshot
shows the tab present). Fixed with a `wait --text Configuration` step first
(`specs/08-skills.flow.json`). Hermetic run before: 7/9; after: 9/9.

### `wait --text` times out on text that is plainly visible inside a form field
**Date:** 2026-10-01
**Cause:** the text was an `<input>`'s value (the Create-skill modal's pre-filled description),
and `wait --text` matches rendered text content, which does not include input values.
**Fix / rule:** assert on static text near the field (a label, an intro line), never on a
pre-filled input's value. `09-conventions` waits for the modal's intro line instead.
**Evidence:** `specs/09-conventions.flow.json` step "the draft is merged from the two accepted
candidates" (`wait --text "Merged from 2 accepted conventions"`); the failing version waited for
`2 house conventions extracted from acme/payments-api`, the description input's value.

### After `npm run e2e:hermetic`, the dev app on :3000 says "Cannot reach the DevDigest engine at http://localhost:3101"
**Date:** 2026-10-01
**Cause:** the hermetic stack starts its own `next dev` in `client/` with
`NEXT_PUBLIC_API_BASE=http://localhost:3101`, and it writes to the same `client/.next` as the
developer's running dev server. `NEXT_PUBLIC_*` values are inlined into compiled bundles, so the
dev server on :3000 went on serving pages built for the e2e API. After teardown, :3101 is gone
and every request fails. The e2e runs themselves pass, so nothing flags it until someone opens
the app. Seen after three hermetic runs in one session; `grep -rl 3101 client/.next` listed
compiled pages.
**Fix / rule:** after a hermetic run with the dev server up, stop the dev server,
`rm -rf client/.next`, and `pnpm dev` again. Better, stop the dev server before running the
hermetic suite. A lasting fix would give the hermetic web its own build dir (a `distDir` set from
an env var in `next.config`), which has not been done.
**Evidence:** `../scripts/e2e.sh:146-148` — `(cd client && pnpm exec next dev -p "$WEB_PORT")`, no
separate dist dir. **See also:** `../client/INSIGHTS.md` — the same shared-`.next` clobbering by
`next build`.

### Flows `08`, `09` and `11` fail in CI with `Element not found` on elements the screenshot shows
**Date:** 2026-10-11
**Cause:** not established. The CI log said `✗ Element not found. Verify the selector is correct
and the element exists in the DOM.` and `✗ Wait timed out after 30000ms`; neither string is in the
0.38.2 or 0.39.0 binaries, which say `No element found by …` and time out after 25000 ms, so the
runner was not executing the `agent-browser` the workflow had just installed with an unpinned
`npm i -g agent-browser`. Which binary it was executing is unknown: the unpinned runs printed no
version, and `which -a agent-browser` in the fixed run lists only the toolcache one. The failure
did not reproduce locally with 0.39.0 and Chrome 155 on `next dev`, on a production build with
no secrets, under a 6x CPU throttle, or with the linux-x64 binary in a container.
**Fix / rule:** the workflow pins `agent-browser@0.39.0` and passes its absolute path as
`AGENT_BROWSER_BIN`; with both in place `09` and `11` passed and the timeout read 25000 ms. Both
changes landed in one commit, so which one mattered was not separated. The install step prints
the version — read it first when the CI errors differ from the local wording.
**Evidence:** `../.github/workflows/e2e-web.yml:116-120` (pin, `AGENT_BROWSER_BIN`, version print).

### A flow's "persisted after reload" check fails: the reloaded page shows the old value
**Date:** 2026-10-11
**Cause:** the mutation is optimistic. `useSetAgentSkills` and the conventions patch hook update
the cache in `onMutate`, so "3 of 7 enabled" is on screen before the request has reached the
server; a `reload` sent right after the `wait --text` aborts it. In CI the reloaded Skills tab
showed `2 of 7 enabled` with `e2e-rule` unchecked. It passed locally only because the request won.
**Fix / rule:** before a `reload` that checks persistence, add `wait --load networkidle`. Text on
screen proves the optimistic update, not the save.
**Evidence:** `specs/08-skills.flow.json:25`, `specs/09-conventions.flow.json:16`;
`../client/src/lib/hooks/agents.ts:129` and `../client/src/lib/hooks/conventions.ts:46` (`onMutate`).

## Session Notes

- **2026-09-30** — added `08-skills` (create skill → link to agent → persists) and fixed the `04`/`05` click race.
- **2026-10-01** — added `09-conventions` (reject/accept seeded candidates → reload → create skill) and three seeded convention candidates; fixed the `08` tab-click race.
- **2026-10-02** — recorded the HW2 demo video with `agent-browser record` + `ffmpeg-static` and burned-in SRT subtitles; noted the ffmpeg, viewport and `fill ''` quirks.
- **2026-10-07** — added `11-pr-smart-diff` (grouped Files changed tab on the nine seeded files); hermetic run 11/11 with the dev stack stopped first.
- **2026-10-11** — fixed the PR #16 `e2e web` failure: pinned agent-browser and its path in the workflow, added the `find` retry and failure output to the runner, and made `08`/`09` wait for the save before reloading.

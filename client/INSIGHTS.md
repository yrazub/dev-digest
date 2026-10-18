# Insights — `@devdigest/web`

Traps we have already hit in the web app. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## Codebase Patterns

- **2026-09-20** — the app shell does not scroll the document: `document.documentElement.scrollHeight`
  equals its `clientHeight` (both 800 at a 1280x800 viewport), and the only overflow container is
  `<main>` (e.g. `scrollHeight` 907 vs `clientHeight` 748 on PR #482 → Agent runs). Anything that
  assumes page-level scrolling breaks silently — a browser tool's `fullPage` screenshot returns
  just the viewport, and `window.scrollTo` does nothing. Scroll `document.querySelector('main')`
  instead, or size the viewport to the content.
  **See also:** `../INSIGHTS.md` — the browser-driving mechanics this rule exists for.
  **Evidence 2026-09-26:** `src/vendor/ui/shell/AppFrame.tsx:29` —
  `<main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>`, the only scroll container.
- **2026-09-26** — the PR-list table card clips its rows: `tableCard` in
  `src/app/repos/[repoId]/pulls/styles.ts` sets `overflow: hidden` (so rows respect the rounded
  corners), so any `position: absolute` overlay rendered inside a `PRRow` cell is cut off at the
  card's bottom edge (the first FINDINGS popover was). Render overlays through
  `createPortal(…, document.body)` with `position: fixed` from the trigger's
  `getBoundingClientRect()`, as `pulls/_components/FindingsPopover/FindingsPopover.tsx` does.
  Close it on scroll with a *capture* listener (only `<main>` scrolls, see above) and on resize, and
  delay the mouse-leave close (~120 ms) so the pointer can cross the gap onto the popover.
  jsdom can't show the clipping, so component tests pass either way; check in a browser.
  **Evidence 2026-09-26:** `src/app/repos/[repoId]/pulls/styles.ts:88` (`tableCard`);
  `src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx:101`
  (`createPortal`).

- **2026-09-27** — a *capture* `scroll` listener on `window` also fires for scrolls **inside** the
  element it guards: `scroll` does not bubble, but capture still sees every element's scroll. The
  first FINDINGS popover closed itself whenever its own list was wheeled or its scrollbar dragged.
  Ignore events whose `target` is inside the popover, and set `overscrollBehavior: "contain"` so a
  wheel at the list's end doesn't chain into `<main>` and close it that way.
  **Evidence 2026-09-27:** `src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx:72`
  (`onScroll` target check).
- **2026-10-07** — TanStack Query v5 keeps `data` when a refetch fails and sets `isError` at the
  same time, so "error" and "has data" are not exclusive. `DiffTab` chose its body from four
  independent booleans and drew the flat list and the groups together in that state. A component
  that renders one of several bodies from a query takes the choice from one pure function that
  returns a single mode, and the label, the notice and the body all read that value
  (`diffBodyMode` in `src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts:55`).
  A test with `{ data: undefined, isError: true }` alone does not cover it.


- **2026-10-11** — when a component starts reading the URL or the query client, every existing
  test that renders it needs the matching setup, and the failure names the cause: `invariant
  expected app router to be mounted` → `vi.mock("next/navigation")` with one stable `router`
  object and a mutable search value; `No QueryClient set` → a `QueryClientProvider`. A test that
  mocks a hooks module which also exports key factories must spread `vi.importActual` and
  override only the hook, or the component's `blastKeys` import is undefined
  (`src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastRadiusCard.test.tsx`).
- **2026-10-11** — a wait that counts polled answers reads the query's `dataUpdatedAt` and
  `errorUpdatedAt`, so a failing request still ends the wait; a mocked query without
  `errorUpdatedAt` turns `Math.max` into `NaN` and the wait silently never starts
  (`useResyncWait` in `.../BlastRadiusCard/_components/DegradedNote/use-resync-wait.ts`).
- **2026-10-17** — The vendored `Checkbox` takes no `disabled` prop and gets its accessible name only from its `label` child (`src/vendor/ui/kit/Checkbox.tsx:5-15`), so a row that must be disabled or carry an `aria-label` such as "Attach <path>" uses a native `<input type="checkbox">` (`src/components/context-attach-list/ContextRow.tsx:55-59`).
- **2026-10-17** — The vendored `Tabs` renders plain `<button>`s with no `tablist`/`tab` roles (`src/vendor/ui/kit/Tabs.tsx:25`): a test clicks a tab with `getByRole("button", { name })` and checks tab order by comparing the buttons' `textContent` with the known labels.
- **2026-10-17** — react-markdown v9's default URL transform keeps `mailto:` and relative hrefs as live anchors, and the vendored `Markdown` adds no filter. Text that comes from a repository (Project Context documents) goes through `SafeMarkdown`, whose module-level `a` renderer links only `http:`/`https:` (`src/components/safe-markdown/SafeMarkdown.tsx:9` `isWebUrl`, `:40`).
- **2026-10-18** — The Files changed jump keeps "already jumped" in `DiffTab` state, not in a ref and not in the card: `const [jumpedKey, setJumpedKey] = React.useState<string | null>(null)` with `pending: jumpedKey !== jumpKey` (`src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:58`, `:63`). A ref read in render does not re-render children when it changes, so a still-mounted `FileCard` kept `pending: true` and scrolled again after a collapse and reopen; and a `RoleGroup` header click unmounts its `DiffViewer` (`{open ? (`, `RoleGroup.tsx:62`), so state held in the card is lost. A same-value `setState` is skipped, and `FileCard` returns early once `pending` is false (`src/components/diff-viewer/FileCard/FileCard.tsx:94`), so nothing loops.
- **2026-10-18** — `setTab` in `usePrDetailNav` (`src/app/repos/[repoId]/pulls/[number]/_lib/use-pr-detail-nav.ts:31`) replaced `setParam('tab', …)`, so every tab change — including the automatic switch to findings when a run starts — clears `file` and `line` (R-WEB-41). A deep link that must survive a tab change pushes `focusSearch` instead.
- **2026-10-18** — The vendored primitives fix their own type and spacing: `SectionLabel` is `fontSize: 12` (`src/vendor/ui/primitives/SectionLabel.tsx:19`) and `Card` pads with `var(--card-pad)` (`Card.tsx:26`), not the 11/12 px the L05 client spec Layout gives. An exact match needs a local wrapper; otherwise the spec should accept the vendored values.
- **2026-10-18** — `OverviewTab` now renders `PrBriefSection`, which needs `NextIntlClientProvider`, a query client and a `matchMedia` stub; `OverviewTab.test.tsx` mocks `../PrBriefSection` (`:7`), and any other test that renders `OverviewTab` unmocked needs all three.

## What Works

- **2026-10-17** — A save queue is tested without timers by having the mocked `fetch` return a PUT promise the test holds, then settling it with `await act(async () => resolve(res))`; the test decides what is in flight, so "three quick saves give exactly two PUTs" is deterministic (`src/lib/hooks/context.test.tsx:42-44`).
- **2026-10-18** — A sticky header's height is not a constant (144 px at 1400 px wide, more when the title wraps), so a fixed `scroll-margin-top` lands a jump under it. `PrDetailHeader` publishes its `offsetHeight` as `--diff-sticky-offset` on its parent (`STICKY_OFFSET_VAR`, `src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:47`) and the diff viewer adds its gap on top: `calc(var(--diff-sticky-offset, 0px) + 130px)` (`src/components/diff-viewer/styles.test.ts:15`). Only the manual browser check found it; jsdom has no layout.
- **2026-10-18** — Relative time is deterministic in a component test by passing `now` to `NextIntlClientProvider` (`now={new Date("2026-10-18T12:00:00.000Z")}`, `src/app/repos/[repoId]/pulls/[number]/_components/PrBriefSection/PrBriefSection.test.tsx:101`): a `generated_at` of 09:00Z renders "3 hours ago", with no fake timers.

## Tool & Library Notes

- **2026-09-27** — the web app has **no linter at all**: no `lint` script, no `eslint` /
  `eslint-config-next` dependency, no `eslint.config.*`. Structural rules (no cross-feature imports,
  no aggregating `index.ts` barrels, no nested component definitions) are therefore prose-only
  and nothing catches a violation. Adding lint means the ESLint CLI with a flat
  `eslint.config.mjs` — `next lint` was deprecated in Next 15.5 and removed in 16 — plus
  `import(-x)/no-restricted-paths` zones and `no-cycle`; a starting config is in
  `.claude/skills/frontend-ui-architecture/references/enforcement.md`.
  **Evidence 2026-09-27:** `client/package.json:5-11` — `scripts` has `dev`/`build`/`start`/`typecheck`/`test`, no `lint`.

- **2026-09-30** — the vendored `FormField` renders its `<label>` without a `htmlFor`, and
  `TextInput` / `SelectInput` accept no `id` or `aria-label`. So form fields built from them
  have **no accessible name**. `getByLabelText` in tests and `find label … fill` in e2e cannot
  find them. Locate them by placeholder (`find placeholder "…" fill`), as `e2e/specs/08-skills.flow.json`
  does, or give the control its own `aria-label` when it is app code (the skill body textarea
  in `src/components/skill-body-editor/SkillBodyEditor.tsx` has one). `src/vendor/ui/kit/FormField.tsx:19`
  shows the bare `<label>`.
- **2026-10-07** — `tsconfig` has `noUncheckedIndexedAccess` and `pnpm typecheck` covers test files, so
  `arr[0]` in a test is `T | undefined`: vitest passes and the typecheck fails. Run `pnpm typecheck`
  after writing tests. A vitest path filter is a pattern, so a path with `[repoId]` brackets matches
  no file; pass a bare substring (`pnpm exec vitest run DiffTab`). No line in the repo shows either;
  both were hit while writing `DiffTab.test.tsx`.
- **2026-10-07** — to test a hook that watches a polling query (`usePrActiveRuns` has
  `refetchInterval` while its list is non-empty), change the mocked `fetch` answer and call
  `qc.refetchQueries` on the key instead of waiting on timers; it adds no call to an
  `invalidateQueries` spy, so the spy counts only what the hook did. Unmount and `qc.clear()` in
  `afterEach`, or the poll outlives the test (`src/lib/hooks/reviews.test.tsx:127`).
- **2026-10-17** — dnd-kit's keyboard sensor finds no drop target in jsdom, where every rect is zero. Spy `Element.prototype.getBoundingClientRect` to give each row a box (top = index × 40), focus the drag handle, then `user.keyboard("{Space}")`, `{ArrowDown}`, `{Space}` (`src/components/context-attach-list/ContextAttachList.test.tsx:215`, `:226`).
- **2026-10-17** — In `messages/en/*.json` (ICU, intl-messageformat) a straight apostrophe before `{` starts a quoted literal, so `'{query}'` prints `{query}` verbatim. A parameter shown inside straight quotes is written `''{query}''` (`messages/en/context.json:36`, `attach.noMatch`); older keys avoid it with curly quotes.
- **2026-10-18** — jsdom has no `window.matchMedia` and no `Element.prototype.scrollIntoView`. Every test that renders `PrBriefSection` stubs `matchMedia`, because `useMediaQuery` calls it in its snapshot getter (`src/app/repos/[repoId]/pulls/[number]/_components/PrBriefSection/use-media-query.ts:15`); the jump tests assign `scrollIntoView = vi.fn()` and read the scrolled element from `mock.contexts[n]` (`src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:650-657`).
- **2026-10-18** — jsdom drops `scroll-margin-top` from an element's style, so scroll margins are asserted on the style function's return value (`src/components/diff-viewer/styles.test.ts:14`); a custom property set with `style.setProperty` on a parent does read back with `getPropertyValue`. To stub layout, define `HTMLElement.prototype.offsetHeight` as a configurable getter and restore the saved descriptor afterwards (`PrDetailHeader.test.tsx:30-35`); `src/test/setup.ts:3` installs a no-op `ResizeObserver`, so `vi.stubGlobal` one that records its callback.
- **2026-10-18** — `reactStrictMode: true` (`next.config.mjs:7`) runs `FileCard`'s jump effect twice in dev, so `scrollIntoView` fires twice on the first arrival (`src/components/diff-viewer/FileCard/FileCard.tsx:96`). Both calls target the same element with `block: "start"`, so one scroll is visible; a second dev call is not a re-jump. Unit tests render without StrictMode and see one.


## Decisions

- **2026-09-28** — the sidebar menu is owned by the app, not the vendored kit. `APP_NAV` in
  `src/components/app-shell/nav.ts` is injected through `ShellContext.nav`, and the `?` cheat
  sheet gets `ShortcutsHelp`'s `shortcuts` prop, both built by `useAppNav`. This took a
  one-time, additive edit to three `src/vendor/ui` files. Each gained an optional input that
  falls back to the kit's own `NAV` / `SHORTCUTS`: `shell/types.ts` (`nav?`),
  `shell/Sidebar.tsx` (`ctx.nav ?? NAV`), and `command-palette/ShortcutsHelp.tsx`
  (`shortcuts = SHORTCUTS`). Rejected: editing `vendor/ui/nav.ts` for every new page, which
  reopens the "do not touch vendor" question each lesson; and copying `Sidebar` into the app,
  where the copy drifts from the kit. If `src/vendor/ui` is ever re-copied from its origin,
  re-apply those three edits. (`src/vendor/ui/shell/Sidebar.tsx:45`, `src/components/app-shell/nav.ts`)

## Recurring Errors & Fixes

### App renders as unstyled HTML; `layout.css`, `main-app.js`, `app/page.js` 404 while the server answers 200
**Date:** 2026-09-28
**Cause:** `next build` ran in `client/` while `next dev` was still up. Both write to the same
`client/.next`, so the production build replaced the dev server's output. Dev kept serving HTML
that links to chunks it no longer has. Signs: `.next/BUILD_ID`, `.next/export-marker.json` and
content-hashed files in `.next/static/chunks/`, newer than the dev process start. `next dev`
creates none of them.
**Fix / rule:** stop the dev server, `rm -rf client/.next`, and `pnpm dev` again. Never run
`pnpm build` in `client/` while dev is running. For a correctness check use `pnpm typecheck`
and `pnpm test`, which do not touch `.next`.
**Evidence:** `client/package.json:6-7` — `"dev": "next dev -p 3000"` and `"build": "next build"`,
with no separate `distDir`, so both share `.next`.

### A page 500s with "Module not found: Can't resolve './contracts/findings.js'" from `src/vendor/shared/index.ts`
**Date:** 2026-09-28
**Cause:** a client file imported a runtime *value* (a Zod schema such as `SkillType` or
`SkillName`) from `@devdigest/shared`. A type-only import is erased at compile time, but a
value import pulls `vendor/shared/index.ts` into the webpack bundle. Its `./contracts/*.js`
re-exports use NodeNext-style `.js` suffixes that Next's webpack cannot resolve. `pnpm
typecheck` passes, so the break only shows when the route is compiled in the browser.
**Fix / rule:** in `client/`, import only `type`s from `@devdigest/shared`. When the client
needs a value (an enum list, a validation rule), mirror it in `src/lib/` with a "keep in sync"
note, as `src/lib/feature-models.ts` and `src/lib/skill-rules.ts` do.
**Evidence:** `src/lib/feature-models.ts:6-11` (the original note), `src/lib/skill-rules.ts`
(`SKILL_TYPES`, `isValidSkillName`).

### `vitest run` hangs with no output after a component test that mocks a mutation hook
**Date:** 2026-10-01
**Cause:** the mock returned a fresh object, with a fresh `mutate`, on every call
(`useX: () => ({ mutate: (...) => {...} })`). The component loads data in an effect that
depends on `mutate`, and the mocked `mutate` sets state synchronously, so every render made a
new `mutate`, re-ran the effect and rendered again: an endless render loop. vitest printed
nothing, not even the file name, and never exited. React Query's real `mutate` is stable, so
the component itself was fine.
**Fix / rule:** when a component depends on a hook's function identity (an effect or
`useCallback` dependency), the mock must return the same object every time: build it once at
module level and return that from the mocked hook. Run a new test with a time limit
(`perl -e 'alarm 120; exec @ARGV' pnpm exec vitest run …`) so a loop fails fast instead of
blocking the shell.
**Evidence:** `src/app/repos/[repoId]/conventions/_components/CreateConventionSkillModal/CreateConventionSkillModal.test.tsx`
`draftMutation` (the stable mock) and `CreateConventionSkillModal.tsx` `fetchDraft` /
`React.useEffect(fetchDraft, [fetchDraft])` (the dependency).
**Evidence moved 2026-10-01:** the self-review then replaced that effect with a query
(`useConventionSkillDraft` in `src/lib/hooks/conventions.ts` is now `useQuery`), so the modal
no longer has the effect or `draftMutation`. The rule still holds for any mocked hook whose
function identity a component depends on; the original code is in commit `54e2b1e`.
### `pnpm typecheck` fails with TS2307 under `.next/types/` although `src/` is clean
**Date:** 2026-10-05
**Cause:** `tsconfig.json` includes `.next/types/**/*.ts` (`tsconfig.json:33`), and that gitignored folder still held the generated `page.ts` and `validator.ts` entry of a route that was later deleted from `src/app` (`repos/[repoId]/conventions`). The error is `Cannot find module '../../../../../../src/app/repos/[repoId]/conventions/page.js'`.
**Fix / rule:** errors only under `.next/` are a stale build artefact, not a code failure. Run `pnpm exec next typegen` (rewrites `validator.ts`), delete the leftover `.next/types/app/<deleted route>/` folder, and rerun. Not with `pnpm dev` running against the same folder.
**Evidence:** `tsconfig.json:33`; nothing in the repository shows the stale file, it is gitignored.
**2026-10-17:** the same file fails right after a route is *added*: the first `pnpm typecheck` gave `.next/types/validator.ts(77,52): TS2344: '"/repos/[repoId]/context"' does not satisfy the constraint 'AppRoutes'` while a running Next process rewrote `.next/types`; a second run was clean. Rerun before debugging.

### Console: "Removing a style property during rerender (borderColor) when a conflicting property is set (border)"
**Date:** 2026-10-17
**Cause:** a selected row was styled `{ ...s.row, ...s.rowActive }` — `s.row` set the `border` shorthand, `s.rowActive` the `borderColor` longhand — so deselecting removed a longhand while its shorthand stayed. Tests stayed green: the warning fires only on a re-render that swaps style objects.
**Fix / rule:** a state-dependent style is a function in `styles.ts` that returns one complete object, every branch setting the same keys; never spread one style object over another, and never pair a shorthand with its longhand on one element. Regression test: spy `console.error`, `rerender` with another selection, join all arguments, assert no "style property during rerender".
**Evidence:** `src/app/repos/[repoId]/context/_components/ProjectContextView/styles.ts:62` (`row(active)`); `ProjectContextView.test.tsx:297`.

## Session Notes

- **2026-09-28** — diagnosed and fixed the unstyled-app breakage caused by `next build` overwriting the dev server's `.next`.
- **2026-09-28** — moved sidebar menu ownership from the vendored kit to `components/app-shell/nav.ts` (injected via `ShellContext.nav`).
- **2026-09-28** — built the Skills screens (L02 phase 5); client code must import only types from `@devdigest/shared`.
- **2026-09-30** — L02 Skills UI done (skills, agents Skills tab, trace); L02 tests moved to `userEvent`.
- **2026-10-01** — L02 Conventions page, candidate cards and the Create-skill-from-conventions modal.
- **2026-10-05** — L03 Intent card, `usePrIntent` / `useRegenerateIntent`, the out-of-scope badge and the trace count; a stale `.next/types` blocked the first baseline.
- **2026-10-07** — L03 Smart Diff: findings inside `diff-viewer` behind an optional prop, the grouped Files changed tab, the run-settled refresh hook; review fix for the double body. Plan: `specs/plans/L03-smart-diff.md` (revision 2).
- **2026-10-11** — L04 Blast radius block on the PR Overview tab: tree and graph views, the degraded note with Resync (`useResyncWait`), `useBlastRadius`; entries above.
- **2026-10-17** — L05 Project Context client: the Project Context page, `SafeMarkdown`, the shared `context-attach-list` with its coalescing save queue, the agent/skill Context tabs and the run-trace block; entries above.
- **2026-10-18** — L05 PR Brief client: the PR Brief section on Overview (Risk areas, Review focus), `usePrBrief`/`useGenerateBrief`, the Review focus jump into Files changed with the sticky-offset fix and the state-held jump key. Entries above.

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

## Tool & Library Notes

- **2026-09-27** — the web app has **no linter at all**: no `lint` script, no `eslint` /
  `eslint-config-next` dependency, no `eslint.config.*`. Structural rules (no cross-feature imports,
  no aggregating `index.ts` barrels, no nested component definitions) are therefore prose-only
  and nothing catches a violation. Adding lint means the ESLint CLI with a flat
  `eslint.config.mjs` — `next lint` was deprecated in Next 15.5 and removed in 16 — plus
  `import(-x)/no-restricted-paths` zones and `no-cycle`; a starting config is in
  `.claude/skills/frontend-ui-architecture/references/enforcement.md`.
  **Evidence 2026-09-27:** `client/package.json:5-11` — `scripts` has `dev`/`build`/`start`/`typecheck`/`test`, no `lint`.

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

## Session Notes

- **2026-09-28** — moved sidebar menu ownership from the vendored kit to `components/app-shell/nav.ts` (injected via `ShellContext.nav`).
- **2026-09-28** — built the Skills screens (L02 phase 5); client code must import only types from `@devdigest/shared`.

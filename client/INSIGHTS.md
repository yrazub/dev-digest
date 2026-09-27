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

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


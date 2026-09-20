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


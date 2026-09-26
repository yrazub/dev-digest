# UI architecture

How the studio is put together: what renders where, how the pieces are wired, and the layout
rules that decide how anything floating must be built. The route map is in
[`../README.md`](../README.md); how data moves is in [`data-flow.md`](data-flow.md).

## What runs on the server, and what doesn't

Almost nothing runs on the server. The only server-side work is in `src/app/layout.tsx`:

- reading the locale and messages for `next-intl` (`getLocale` / `getMessages`, configured in
  `src/i18n/request.ts`);
- inlining the theme no-flash script, so the dark/light choice is set before first paint;
- wrapping everything in `NextIntlClientProvider` and then the client `Providers` stack.

Every other page file starts with `"use client"`. The two that don't, `app/agents/page.tsx` and
`app/settings/[section]/page.tsx`, only render a client view (`AgentsListView`,
`SettingsView`). There are no Server Actions, no route handlers (`route.ts`) and no middleware.

So **all data is fetched in the browser**, through TanStack Query hooks, from the Fastify API
on `:3001`. That is deliberate for a local studio whose screens are interactive and live (SSE
run logs, polled run status): server rendering would have nothing stable to render ahead of
time. Consequences worth knowing:

- Do not fetch from the API in a Server Component. It would bypass the hooks and the query
  cache, and nothing would invalidate it. A new page can be a Server Component only if it just
  renders a client view, like the two above.
- Loading states are client-side `Skeleton`s; there is no server-rendered first paint of data.
- The API must allow CORS from the web origin, which the server configures (`config.webOrigin`).

## The provider stack

`src/lib/providers.tsx`, in order: `QueryClientProvider` → `ThemeProvider` → `ToastProvider` →
`RepoProvider`.

- **Query defaults:** `retry: 1`, `staleTime: 30s`, `refetchOnWindowFocus: false` (individual
  hooks override these; see [`data-flow.md`](data-flow.md)).
- **Errors become toasts globally.** Every failed mutation toasts. A failed query toasts only on
  a network failure (status `0`) or a 5xx; a 4xx stays silent, so a component can show an inline
  empty state for "not found" without a toast on top.
- **Active repo:** `RepoProvider` (`src/lib/repo-context.tsx`) decides the current repo: the
  `:repoId` in the URL wins, then `localStorage`, then the first repo from the API.

## URL state

Anything that should survive a reload or a shared link lives in the URL, set with
`router.replace` so it doesn't pile up history entries:

- PR detail tabs: `?tab=overview | findings | diff`. The `findings` tab is labelled
  **"Agent runs"** in the UI and implemented by `FindingsTab`; there is no separate findings
  screen.
- The Run Trace drawer: `?trace=<runId>`.
- PR list filters and sort: `?status=…&sort=…`.

**Routes use the PR number, the API uses the PR's uuid.** `/repos/:repoId/pulls/:number` resolves
the number to an id through the cached PR list (`usePulls(repoId)`) before any PR request, so the
detail page always depends on the list query.

## Where code goes

Pages stay thin; feature logic lives in `_components/<Name>/` next to the route that uses it (the
folder layout is in [`../CLAUDE.md`](../CLAUDE.md) → Naming). Components shared across routes live
in `src/components/` (`app-shell`, `diff-viewer`, `page-shell`, `mermaid-diagram`,
`repo-not-found`).

One exception today: `FindingsPopover` lives under `app/repos/[repoId]/pulls/_components/` but is
used by both the PR list and the PR detail Timeline. If a third screen needs it, move it to
`src/components/`.

## Vendored packages

Both are path aliases in `tsconfig.json`, not installed dependencies, and both are
**do-not-edit** copies.

- **`@devdigest/ui`** (`src/vendor/ui`) — the design system. Severity and category styling is
  centralized in `SEV` / `CAT` (color, icon, label), rendered by `SeverityBadge` and
  `CategoryTag`; `Chip` is the toggle button. There is **no popover or tooltip primitive**;
  see the next section for how to build one.
- **`@devdigest/shared`** (`src/vendor/shared`) — the Zod contracts, hand-copied from the
  authored package in `server/src/vendor/shared`. The copies are not byte-identical everywhere
  (some files are deliberately trimmed), so copy the lines you changed rather than whole files,
  then run `pnpm typecheck` here.

## Layout: scrolling and floating UI

- **Only `<main>` scrolls.** The app frame (`AppFrame` in `@devdigest/ui`) makes the document a
  fixed viewport with `<main>` as the one overflow container. Scroll listeners must use the
  capture phase, and `window.scrollTo` does nothing.
- **Containers clip.** The PR-list table card sets `overflow: hidden` so rows follow its rounded
  corners (`app/repos/[repoId]/pulls/styles.ts`, `tableCard`). An absolutely positioned popover
  inside a row is cut off.
- **So floating UI is portaled.** Render it with `createPortal(…, document.body)`, position it
  `fixed` from the trigger's `getBoundingClientRect()`, close it on scroll (capture) and resize,
  and delay the close on mouse-leave so the pointer can reach it. `FindingsPopover` is the
  reference implementation.

## Styling and strings

- Styles are inline style objects in a colocated `styles.ts` (exported as `s`). Colors come
  only from CSS variables (`var(--crit)`, `var(--text-muted)`); the theme switches them via
  `data-theme` on `<html>`. Numbers use the `tnum` / `mono` utility classes.
- User-facing strings go through `next-intl` (`messages/en/<namespace>.json`; `en` is the only
  locale). Component tests render with the real message files.

# L04 — Blast Radius (client)

The client part of [`../../specs/L04-blast-radius.md`](../../specs/L04-blast-radius.md): a
**Blast radius** block on the Overview tab of `/repos/:repoId/pulls/:number`. It renders the
answer of `GET /pulls/:id/blast` as it comes: the block does not regroup, reorder or recount.

Design reference: the prototype's Overview tab (PR #482) and the task's Tree and Graph
screenshots. The prototype shows the filled state only; the other states are defined here.

## Route and data

| Data | Source | Hook |
|---|---|---|
| the map | `GET /pulls/:id/blast` → `BlastRadiusResponse` | `useBlastRadius(prId, headSha)` — new, `src/lib/hooks/blast.ts` |
| the index state, while a resync runs | `GET /repos/:id/index-state` | `useRepoIntelStatus(repoId, poll)` — existing |
| start a resync | `POST /repos/:id/resync` | `useResyncRepoIntel(repoId)` — existing |
| repository name, head SHA | already on the page (`activeRepo.full_name`, `pr.head_sha`) | — |

`src/lib/hooks/blast.ts` follows `smart-diff.ts`:

```ts
export const blastKeys = {
  pull: (prId) => ["blast", prId] as const,
  detail: (prId, headSha) => ["blast", prId, headSha] as const,
};
export function useBlastRadius(prId, headSha) // enabled: !!prId && !!headSha, no polling
```

The query starts only when the PR detail has answered (D10): the page renders the tab after
`usePullDetail` resolved, and `headSha` comes from it. A new head SHA is a new query. The type
comes from `@devdigest/shared`; no shape is declared locally.

A finished review does not change the map, so `useRunSettledRefresh` is not extended.

## Placement

`OverviewTab` gains the props it needs (`prId`, `repoId`, `repoFullName`, `headSha`) and
renders the block **above** the Description section; the page passes them. The block is full
width in the page's single column (D7), directly under the Intent card.

```
[Intent card]            ← page, unchanged
[Blast radius block]     ← OverviewTab, new
[Description]            ← OverviewTab, unchanged
```

## Component folder

`src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/`

| File | Holds |
|---|---|
| `BlastRadiusCard.tsx` | the block: header, summary row, view switch, mark, body. `"use client"` |
| `index.ts` | re-exports the component |
| `helpers.ts` | `blastBodyMode`, `callerHref`, `groupIsCut`, `graphLayout` — pure |
| `constants.ts` | icon names, chip tones, graph sizes, the reasons a resync can fix |
| `styles.ts` | `s` |
| `_components/SymbolGroup/` | one changed symbol: its row, callers, endpoint chips, cron chips |
| `_components/BlastGraph/` | the Graph view (C2) |
| `_components/DegradedNote/` | the mark with its reason and the Resync button (A6, C6) |
| `BlastRadiusCard.test.tsx`, `helpers.test.ts` | tests |

Placement and import direction follow the `frontend-ui-architecture` skill. Primitives come
from `@devdigest/ui` (`Card`, `SectionLabel`, `Badge`, `Button`, `Icon`, `Skeleton`); the
vendored folder is not edited.

## Layout

**Header.** `SectionLabel` with the label `brief.block.blast` ("Blast radius", existing key).

**Summary row (A2).** Four stats, each an icon, a bold number and a label, from `totals`:
symbols (`Code`), callers (`CornerDownRight`), endpoints (`Globe`), crons (`Clock`). The view
switch (Tree / Graph) sits at the right end of the row. The row is shown whenever the request
succeeded, also with zeros.

**Tree view (A3, D8)** — the default. One `SymbolGroup` per entry of `downstream`, in the
response's order:

- a row with the symbol name in monospace, followed by `()` when its kind is a function or a
  method, and the caller count at the right (`callerCount`); when the count equals
  `caller_limit` the count is followed by `+` and a title that says the list may be cut (B6);
- the callers, one per line, as `file:line` in monospace, each a link (A5); the caller's own
  name is shown muted at the right end of the line, as in the task's plain-list screenshot;
- a row of endpoint chips (`Globe`, the accent tone), one per `endpoints_affected`;
- a separate row of cron chips (`Clock`, the warning tone), one per `crons_affected` (C4).
  A cron value is rendered as the server gave it.

Groups are always open; there is no collapse control (C1 is not built). Under the last group,
when `changed_symbols` holds more symbols than `downstream`, one muted line says how many
changed symbols have no callers (`moreWithoutCallers`).

**Graph view (C2).** Three columns of nodes — changed symbols, callers, endpoints and crons —
joined by curved edges, drawn as inline SVG with hand-computed positions (`graphLayout`); no
graph library and no new dependency. There are two kinds of edge: from a caller to each
changed symbol it reaches, and from a changed symbol to each of its endpoints and crons (Q6).
No edge joins a caller to an endpoint: the response attributes endpoints to the symbol's group,
not to one caller. A caller node is labelled with the caller's name and
carries the same link as its tree line; a caller that reaches two symbols is one node with two
edges. A legend under the graph names the three kinds. The SVG has `role="img"` and the label
`graph.ariaLabel`; with no downstream it is replaced by `graph.empty`. The graph scrolls
horizontally inside the block rather than overflowing it. Text is rendered as text nodes; a
long label is cut with an ellipsis and keeps its full value in `title`.

**View state (D9).** `?blast=graph` selects the graph; no parameter is the tree. The switch
writes the parameter through the page's existing `router.replace` pattern and keeps the other
parameters.

**Links (A5, D4).** `callerHref` returns
`githubBlobUrl(repoFullName, indexed_sha ?? headSha, file, line)`; the link opens in a new tab
with `rel="noopener noreferrer"`. While `repoFullName` is unknown the caller is plain text.

## States

Exactly one body is rendered at a time. The choice is one pure function, `blastBodyMode`, that
returns `loading`, `error`, `noFiles`, `noSymbols`, `noCallers` or `map`.

| Mode | When | Rendering |
|---|---|---|
| `loading` | the first request is in flight | the header and `Skeleton` rows |
| `error` | the request failed and no data is loaded | `loadFailed` and a Retry button; a failed background refetch keeps the map that is shown |
| `noFiles` | `reason` is `pr_files_missing` | the mark only (it explains), no summary row |
| `noSymbols` | `totals.symbols` is 0 | the summary row and `noSymbols` |
| `noCallers` | symbols exist, `downstream` is empty | the summary row and `noDownstream` with the symbol count (A6) |
| `map` | `downstream` has entries | the summary row and the Tree or the Graph view |

**The mark (A6, B7).** When `degraded` is `true`, `DegradedNote` is shown between the summary
row and the body, in every mode except `loading` and `error`. It is a warning-toned line with
an icon, the title `degraded.title` and one sentence for the reason, `degraded.reason.<value>`,
keyed by the enum value. The map below it is still shown: a degraded answer can carry data.

**Resync (C6).** For the reasons a resync can fix — `index_partial`, `index_failed`, `no_data` —
the note has a Resync button. It calls `useResyncRepoIntel(repoId)`, then polls
`useRepoIntelStatus(repoId, true)` and, when `lastIndexedSha` or `updatedAt` advances,
invalidates `blastKeys.pull(prId)` and stops polling. While it runs the button is disabled and
shows `degraded.resyncing`; polling also stops after a fixed number of attempts (a constant),
with `degraded.resyncSlow`. The completion rule is the one `IndexStatus` on the Conventions
page already uses; share it rather than writing a second one. `flag_off`, `repo_too_large` and
`pr_files_missing` get no button.

### How to show each state (for the demo)

| State | How to reach it |
|---|---|
| no callers | a PR that changes a file whose symbols nobody imports, or a docs-only PR (`noSymbols`) |
| incomplete index | set `repo_index_state.status` to `partial` for the repository, or start the API with `REPO_INTEL_ENABLED=false` (`flag_off`) |

## Strings (C7)

All in `messages/en/blast.json`; the block title stays in `brief.json`. No Blast radius label
is written in a component.

| Key | Change |
|---|---|
| `stat.symbols`, `stat.callers`, `stat.endpoints`, `stat.crons` | become plural forms of the label only ("symbol" / "symbols", "cron" / "crons"); the number is rendered apart, in bold |
| `callerCount` | becomes a plural form ("1 caller", "4 callers") |
| `view.tree`, `view.graph` | "Tree", "Graph" |
| `noDownstream`, `graph.empty`, `graph.ariaLabel` | kept |
| new | `noSymbols`, `moreWithoutCallers`, `callersCut`, `openOnGithub`, `loadFailed`, `retry`, `graph.legend.symbol`, `graph.legend.caller`, `graph.legend.endpoint`, `degraded.title`, `degraded.reason.flag_off`, `.index_failed`, `.index_partial`, `.repo_too_large`, `.no_data`, `.pr_files_missing`, `degraded.resync`, `degraded.resyncing`, `degraded.resyncSlow` |

## Tests

| File | Covers |
|---|---|
| `BlastRadiusCard/helpers.test.ts` | `blastBodyMode` for every mode; `callerHref` with and without `indexed_sha`, and a path that needs encoding; `groupIsCut`; `graphLayout` — one node per distinct caller, an edge per caller-to-symbol pair, an edge per symbol-to-endpoint and symbol-to-cron pair and none from a caller to an endpoint, no overlap of nodes in a column |
| `BlastRadiusCard/BlastRadiusCard.test.tsx` | the four numbers come from `totals`; groups and callers in response order; a caller is a link with the GitHub URL, `target="_blank"` and `rel`; endpoint and cron chips in separate rows; `noCallers` and `noSymbols` texts; the mark with the reason text for each enum value, and the map still rendered under it; Resync shown only for the three reasons and calling the resync route; the `+` on a group at `caller_limit`; the switch to the graph and the `?blast=graph` round trip; the error state with Retry |
| `OverviewTab` test | the block is rendered above Description and receives the page's props |
| `src/lib/hooks/blast.test.tsx` | the request path, and that the query waits for both ids |

Tests use `fetch` mocks and React Testing Library per `../../TESTING.md`. The browser journey
is `e2e/specs/12-pr-blast-radius.flow.json`: on the seeded PR #482, the block, its numbers, one
caller link's `href`, an endpoint chip, a cron chip, and the Graph round trip — read-only, no
model call.

## Acceptance

- [ ] A1, A2 — the block is on the Overview tab; its four numbers equal `totals`.
- [ ] A3, C4, C5 — each symbol shows its callers as `file:line` in the response's order, then
      endpoint chips, then cron chips in their own row.
- [ ] A5 — a caller link is the GitHub blob URL at `indexed_sha` (or the head SHA), with the
      line anchor, and opens in a new tab.
- [ ] A6, B7 — `noCallers` and `noSymbols` show a text, never an empty block; a degraded
      response shows the mark with the reason for each of the six values.
- [ ] B6 — no number of callers or depth is written in the component; the cut mark uses
      `caller_limit`.
- [ ] C2 — the Graph view renders the three columns and survives a reload through `?blast=graph`.
- [ ] C6 — Resync starts a resync and the map is read again when the index state advances.
- [ ] C7 — every label comes from `blast.json` or `brief.json`.
- [ ] No `fetch` in a component; the type comes from `@devdigest/shared`.
- [ ] `pnpm typecheck` and `pnpm test` are green.

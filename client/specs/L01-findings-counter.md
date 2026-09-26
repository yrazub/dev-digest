# L01 — Findings counter (client)

Render a per-severity findings breakdown — CRITICAL · WARNING · SUGGESTION — on three
screens, reusing existing vendored primitives (`SeverityBadge`, `Chip`) that already support
counts, icons and an active/toggle state.

Read [`specs/L01-findings-counter.md`](../../specs/L01-findings-counter.md) first — it
states what the feature is, and that this spec was revised against
`docs/hw1-criteria.md` (#16–23) after an earlier draft scoped a "Findings tab" that does not
exist and deferred the filter and the popover, both of which the homework requires. The
list's data comes from the server half, specified in
[`../../server/specs/L01-findings-counter.md`](../../server/specs/L01-findings-counter.md),
which adds `findings_by_severity`/`findings_preview` to `PrMeta` and `findings_by_severity`
to `RunSummary`.

## A naming trap to know about before touching this code

The tab labeled **"Agent runs"** in the UI (`PrDetailHeader.tsx:117`,
`{ key: "findings", label: "Agent runs", ... }`) is implemented by a component named
`FindingsTab` (`_components/FindingsTab/FindingsTab.tsx`), routed on `?tab=findings`. There
is no separate "Findings" tab — `FindingsTab` **is** the Agent-runs tab, and it renders two
sections: **Timeline** (`RunHistory.tsx`) and **Review runs** (maps to `ReviewRunAccordion`
instances). Grepping for "Findings" in the component tree will find this tab, not a
dedicated findings screen.

## The primitives already exist

`SeverityBadge` (`src/vendor/ui/primitives/Badge.tsx`) takes an optional `count`, renders
icon + (label unless `compact`) + count, and is a `<span>` — inert, exactly what a read-only
counter needs. It is already used without `count` in `FindingCard`
(`_components/FindingCard/FindingCard.tsx:58`).

`Chip` (`src/vendor/ui/primitives/Chip.tsx`) takes `icon`, `count`, `active`, `onClick` and
`color`, and is a `<button>` with hover/active styling already wired — exactly the filter
button screen B needs. It is currently unused anywhere in the client; this is its first
call site.

Both screens B and C need the same small helper: given a `findings_by_severity`-shaped
object (or a `FindingRecord[]` to reduce into one), produce `[severity, count][]` pairs with
`count > 0`, in the fixed order CRITICAL → WARNING → SUGGESTION. Write it once —
`severityCounts()` — and use it from every screen below; colocate it wherever it is needed
first (e.g. `FindingsPanel/helpers.ts`, extending the existing `visibleFindings`) and import
it from the others rather than redefining it.

## Screen A — pull-request list · `/repos/:repoId/pulls` (hw1 #16 parenthetical, #20, #21)

### The column

A new `FINDINGS` column between `SCORE` and `STATUS`, matching the mockup's
`screen_dashboard.jsx` column order. Following the same mechanism `COST` used
(`client/specs/L01-run-cost.md`, Screen A): `COLUMN_KEYS` (`constants.ts:41-49`), `GRID`
(`constants.ts:29`), one new `next-intl` string under `list.columns`
(`messages/en/prReview.json:89-96`), one new cell in `PRRow.tsx` between the score cell
(lines 50-56) and the status cell (57-61).

The cell renders `SeverityBadge` per non-zero severity from `pr.findings_by_severity`,
`compact`. `—` when `findings_by_severity` is `null` or every count is `0` — same pattern as
the score cell's `—` for an unreviewed PR (`PRRow.tsx:51-55`).

### The popover (#20, #21)

No popover/tooltip primitive exists anywhere in `src/vendor/ui` today (checked
`primitives/`, `kit/`, `shell/`, `command-palette/`, `charts/`) — this is new client code,
not a reuse of something vendored. Build it local to this screen (e.g. a
`FindingsPopover` colocated in `PRRow/` or a new `_components/FindingsPopover/`), not inside
`src/vendor/**` (do-not-touch, per `client/CLAUDE.md`).

Behavior, matching the mockup's `FindingsCell` (`screen_dashboard.jsx`) almost exactly —
that mockup component already does this, just needs porting:

- Wrap the badge row in a `position: relative` container with `onMouseEnter`/
  `onMouseLeave` toggling a `show` boolean (mirrors the mockup's own `useState` + handlers).
- While `show`, render an absolutely-positioned panel. Title: *"N FINDINGS IN THIS RUN"*
  where N is the sum of `pr.findings_by_severity`'s three counts — a new `next-intl` string
  with a `{count}` plural, alongside `column.findingsCount` in `messages/en/runs.json:8`
  (same plural pattern: `"{count, plural, one {# finding} other {# findings}}"`, different
  wrapping phrase).
- Body: one row per item in `pr.findings_preview` (the new `Finding[]` field), each showing
  — text only, **no buttons, no `onClick`, no `Markdown` rendering of `rationale`** (plain,
  CSS-`line-clamp`ed text — this is a preview, not the accept/reject flow) — reusing the
  same sub-pieces `FindingCard` already imports from `@devdigest/ui`: `SeverityBadge`
  (`compact`), `CategoryTag`, `ConfidenceNum`, and the `lineLabel()` helper
  (`FindingCard/helpers.ts`) for `file:line`.
- `pr.findings_preview` is `null`/absent whenever `findings_by_severity` is — the popover
  never opens (no badges to hover) when there is nothing to show.

This popover is deliberately **not** `FindingCard`: it must never expose Accept/Reject
(#21) — those stay exclusive to the Review-runs accordion (#22, screen B below). Do not
import `FindingCard` here; assembling the read-only subset from its same building blocks is
the point.

## Screen B — PR detail → Agent runs → Review runs (hw1 #16, #17, #18, #19)

`ReviewRunAccordion.tsx` already renders, when expanded (lines 147-168): `VerdictBanner`
(149-160), then `FindingsPanel` (161-166) with the full `findings = review.findings` (line
61). Both new rows below go **inside `FindingsPanel`**, above its existing toolbar
(`s.toolbar`, line 50) — that visually places them directly under `VerdictBanner`, which is
what "under the verdict and PR SCORE" (#16) means positionally, without moving anything out
of `FindingsPanel` or duplicating the `findings` prop elsewhere.

### Row 1 — the counter (#16, #17)

Read-only. `SeverityBadge` (not `compact`, so the label reads) for each severity present in
`findings`, via `severityCounts(countBySeverity(findings))`. This row's counts are computed
from the **full** `findings` prop, never from `shown` (the hidden-low/severity-filtered
subset) — #17 requires the pill number to equal "the finding-cards of that severity shown
below", and that equality must hold whether or not a filter is currently narrowing the
visible cards, so the pill always reflects the true total and the filter narrows what's
*shown*, not what's *counted*.

### Row 2 — the filter (#18)

Three `Chip`s, always rendered regardless of whether a severity has any findings: Critical,
Warning, Suggestion (icon from `SEV`/`SeverityBadge`'s own severity→icon map — reuse rather
than re-derive). New state:

```ts
const [sevFilter, setSevFilter] = React.useState<Severity | null>(null);
```

`onClick` on a chip: `setSevFilter((s) => (s === sev ? null : sev))` — clicking an inactive
chip makes it the sole filter (#18: "leaves only that severity's cards"); clicking the
*same* active chip again clears it back to showing everything (#18: "the same button a
second time removes the filter"); clicking a different chip while one is active switches to
the new one (implied by "the same button" language — anything else would need a second,
unstated interaction). `Chip`'s `active` prop is `sevFilter === sev`. Omit `Chip`'s `count`
here — Row 1 already shows the numbers; repeating them on the buttons is visual noise for no
new information.

`visibleFindings` (`FindingsPanel/helpers.ts`) gains the filter as a second, ANDed
condition alongside the existing `hideLow` one:

```ts
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  sevFilter: Severity | null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (sevFilter) shown = shown.filter((f) => f.severity === sevFilter);
  return [...shown].sort(/* unchanged */);
}
```

Both toggles narrow independently and compose with AND, same as `hideLow` already does
alone. The existing `EmptyState` ("No findings match") already covers "filtered to a
severity with zero findings" — no new empty-state copy needed.

## Screen C — PR detail → Agent runs → Timeline (hw1 #16 parenthetical)

`RunHistory.tsx:201-206` currently renders, per settled run, a flat translated string:

```tsx
{settled && (
  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
    {t("runStatus.findings", { count: r.findings_count ?? 0 })}
    {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
  </div>
)}
```

Replace the findings half with a row of `SeverityBadge`s (`compact`, no `onClick` — #16's
parenthetical is explicit that Timeline icons are "without click"), sourced from the new
`r.findings_by_severity` (`RunSummary`, server spec). Keep the blockers text — it is a
distinct, gate-derived signal (`countBlockers`, not a severity), not part of this feature.
When `r.findings_by_severity` is unavailable (a run whose trace predates this lesson), fall
back to the existing flat `runStatus.findings` string so old rows do not render blank.

## States

| Case | A (list) | B (Review-runs) | C (Timeline) |
|---|---|---|---|
| findings in ≥1 severity | badges, hover → popover | pill row + 3 filter chips | badge row |
| review/run with zero findings everywhere | `—`, no popover | no pills; `EmptyState` below (existing) | no badges (blockers text may still show `0`… actually blockers `0` renders nothing per existing `(r.blockers ?? 0) > 0` guard) |
| no completed run yet (A) / run not settled (C) | `—` | n/a | existing "running/failed" state, unchanged |

## Acceptance criteria

1. A PR with 2 CRITICAL + 1 WARNING findings on its latest completed run shows both badges
   on the list (A) in CRITICAL→WARNING→SUGGESTION order; hovering opens a popover titled "3
   FINDINGS IN THIS RUN" listing exactly those 3 findings, no buttons anywhere in it.
2. The same run's Review-runs card (B) shows the same 2 CRITICAL + 1 WARNING pill row; its
   Timeline tile (C) shows the same two badges, unclickable.
3. Clicking "Critical" in B shows only the CRITICAL `FindingCard`(s); the pill row is
   unchanged; clicking "Critical" again restores all cards; clicking "Warning" while
   "Critical" is active switches the filter to Warning.
4. Toggling `hideLow` in B never changes the Row-1 pill counts, only which cards `shown`
   contains (composes with the severity filter via AND).
5. The PR-list popover (A) never renders `FindingCard`, an Accept button, or a Reject
   button; `FindingCard` in B still has both.
6. `FINDINGS` column header, the popover title, and both `Chip` labels come from
   `next-intl` — no string inlined in `PRRow.tsx`, the popover component, or `FindingsPanel`.

## Tests

Colocated, following the existing component tests: real message JSON through
`NextIntlClientProvider`, `afterEach(cleanup)`, hook modules mocked with `vi.mock` (no
`fetch` mocking).

- A unit test for `severityCounts()`: fixed order, zero-counts filtered out, empty/absent
  input produces an empty list.
- Extend `PRRow.test.tsx` — a PR with a mixed `findings_by_severity` (badges + order); a PR
  with `null` (renders `—`); hovering the badge row reveals the popover with the right
  title and item count from a `findings_preview` fixture, and no button is present in it.
- Extend `FindingsPanel.test.tsx` — the new pill row's counts against a mixed-severity
  fixture; clicking a filter `Chip` narrows `FindingCard`s rendered, a second click restores
  them; the pill counts do not change across either click; combining the severity filter
  with `hideLow` narrows by both.
- Extend `RunHistory.test.tsx` — a settled run with `findings_by_severity` renders the badge
  row and no `onClick` handler on any badge; a run without it falls back to the existing
  flat text.

Browser-level acceptance for these screens belongs in [`../../e2e/specs`](../../e2e/specs);
no existing flow asserts on findings counts or the filter, so a new flow may be warranted
for the hover-popover and the filter toggle specifically, since both are new interaction
surfaces a component test cannot fully cover (real mouse hover, popover positioning).

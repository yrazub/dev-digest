# L01 — Findings counter

Show how many findings of each severity — CRITICAL · WARNING · SUGGESTION — a PR and a run
carry, everywhere the app currently shows only a bare findings total or nothing at all.

This spec was revised against `docs/hw1-criteria.md` (criteria #16–23), which is the graded
acceptance spec for this feature and takes precedence over the earlier draft's surface
choices where the two disagree — see [Revision history](#revision-history).

This is the umbrella spec: what the feature is, how the value travels end to end, and who
owns which part. The implementable detail lives in the two module specs:

| Package | Spec | Owns |
|---|---|---|
| `server` | [`server/specs/L01-findings-counter.md`](../server/specs/L01-findings-counter.md) | `agent_runs.findings_by_severity`, `PrMeta.findings_by_severity`/`findings_preview`, `RunSummary.findings_by_severity`, the `rollupSeverities` fix |
| `client` | [`client/specs/L01-findings-counter.md`](../client/specs/L01-findings-counter.md) | the four screens |

## The problem

`Finding.severity` has always been one of `CRITICAL` / `WARNING` / `SUGGESTION`
(`server/src/vendor/shared/contracts/findings.ts`), and a later lesson's contracts already
group findings by that severity — `AgentStats.findings_by_severity` and
`AgentPerfRow.findings_by_severity`, both shaped `{ CRITICAL, WARNING, SUGGESTION }`
(`contracts/observability.ts`, `contracts/productionize.ts`). But nothing in the shipped
product shows that breakdown today:

- The PR list (`/repos/:repoId/pulls`) has no findings column at all. L01's cost-badge
  work looked at this exact gap and explicitly deferred it (`client/specs/L01-run-cost.md`).
- The PR detail page's "Agent runs" tab (component name `FindingsTab` internally, route
  param `?tab=findings` — the visible label is "Agent runs"; see `PrDetailHeader.tsx:117`
  and `client/specs/L01-findings-counter.md` for the naming note) has two sections:
  **Timeline** (`RunHistory.tsx`, chronological run/commit tiles) and **Review runs**
  (`ReviewRunAccordion.tsx`, one expandable card per run). Neither shows a severity
  breakdown — Timeline shows a flat `"{n} findings"` string per settled run
  (`RunHistory.tsx:203`), and the expanded Review-runs card lists every `FindingCard`
  individually with no summary above them (`ReviewRunAccordion.tsx:161-166`).
- A rollup helper for exactly this already exists server-side —
  `rollupSeverities()` in `server/src/modules/pulls/status.ts` — but it is dead code (no
  route calls it), and its output keys are lowercase (`{ critical, warning, suggestion }`),
  which does not match `Severity` or `findings_by_severity`'s uppercase convention.

## The four surfaces

| # | Screen | hw1-criteria | What it shows |
|---|---|---|---|
| A | Pull-request list, `/repos/:repoId/pulls` | #16 (parenthetical), #20, #21 | a `FINDINGS` column with per-severity badges for the PR's **latest completed run**; hovering the badges opens a read-only popover titled *"N FINDINGS IN THIS RUN"* listing each finding (severity, title, category, file:line, confidence%, short text) — no buttons |
| B | PR detail → Agent runs → **Review runs**, one expanded run card | #16, #17, #18, #19 | a read-only pill row *"N CRITICAL · N WARNING · N SUGGESTION"* under the verdict/score (`VerdictBanner`), and below it three filter buttons (Critical/Warning/Suggestion); clicking one shows only that severity's `FindingCard`s below, clicking it again restores the full list |
| C | PR detail → Agent runs → **Timeline**, one run tile | #16 (parenthetical) | a per-severity icon row on each settled run tile, read-only, no click |
| D | Run Trace drawer → Findings section | #23 | already satisfied by the existing `FindingsSection.tsx` — it renders the actual findings (severity, title, file:line, rationale, suggestion), not just a count. **No change needed here.** |

Screens B and C read data the client already has or a cheap server addition provides;
screen A needs both a count and, unlike the earlier draft of this spec, the **actual
finding records** — a hover popover with real previews needs more than a count.

## Explicitly not touched

- **Screen D (Run Trace drawer, criterion #23) needs no work.** It already lists full
  findings, which is the harder requirement the criterion asks for; a count would be a step
  backward.
- The CI Runs screen (`screen_cizruns.jsx`, N13) and the multi-agent review screen
  (`screen_multiagent.jsx`, N4) are not built in the starter yet — nothing to update there.
  `AgentStats.findings_by_severity` (L07) and `AgentPerfRow.findings_by_severity` (L08)
  already exist and are untouched; this spec reuses their key shape, not their contracts.
- Accept/Reject controls (criterion #22) already exist on `FindingCard` inside the
  Review-runs accordion — untouched by this spec, and explicitly **not** duplicated into
  the PR-list popover, which criterion #21 requires to be read-only.

## Contract surface

Authored in `server/src/vendor/shared/` and copied to the client's vendored mirror by hand,
as the root [`CLAUDE.md`](../CLAUDE.md) requires:

| Contract | Field | Feeds |
|---|---|---|
| `agent_runs` (DB) | `findings_by_severity` (jsonb) | server-only; source for the two fields below |
| `RunSummary` | `findings_by_severity` | screen C |
| `PrMeta` | `findings_by_severity` | screen A's badges |
| `PrMeta` | `findings_preview` (`Finding[]`) | screen A's popover contents |

No new endpoint for any screen: A's list endpoint already returns `PrMeta`, B's
`FindingsPanel` already receives every `FindingRecord` it needs, and C's `GET
/pulls/:id/runs` already returns `RunSummary`.

## No LLM call (criterion #19)

Every count on every screen is a grouping of findings that are **already persisted** —
`rollupSeverities()` over rows already read from Postgres, or a client-side `reduce` over
props already fetched. Nothing here calls an LLM, on page load or on filter toggle.

## End-to-end acceptance

The per-package criteria are in the module specs. Across the boundary:

1. A run with 2 CRITICAL, 1 WARNING, 0 SUGGESTION findings shows `2` and `1` (no
   SUGGESTION badge) consistently on all of: the PR-list badge (A), the popover title "3
   FINDINGS IN THIS RUN" (A), the pill row on the Review-runs card (B), and the icon row on
   the matching Timeline tile (C).
2. Clicking "Critical" in the Review-runs filter (B) hides the WARNING `FindingCard`; the
   pill row's numbers do not change; clicking "Critical" again restores it (#18).
3. The PR-list popover (A) never renders an Accept/Reject button; the Review-runs
   `FindingCard` (B) still does (#21 vs #22 — same finding data, two different, non-mixed
   presentations).
4. A PR with no completed run shows no FINDINGS badge and no popover on the list (A); a
   run with zero findings in every severity shows no pill and an empty Review-runs card
   body (existing `EmptyState`).
5. No network request to an LLM adapter fires when a filter button is clicked or a page
   with findings counts loads (#19).

## Out of scope

- Interactive filtering on the **Timeline** tiles or the **PR-list popover** — filtering is
  Review-runs-only (#18), matching the mockup's own scoping (only `findings.jsx`'s
  `FindingsPanel` has a `sevFilter`; `screen_dashboard.jsx`'s `FindingsCell` and
  `prdetail_runs.jsx`'s Timeline are both read-only there too).
- CI Runs / multi-agent screens — not built yet.

## Revision history

The first draft of this spec (before `docs/hw1-criteria.md` was read) scoped the counter to
the PR list plus a standalone "Findings tab" with counts only, no filter, no popover. That
tab does not exist — the actual location is the Review-runs accordion inside the "Agent
runs" tab — and the homework's acceptance criteria require the interactive filter (#18) and
the PR-list hover popover (#20–21) that the first draft explicitly deferred. This revision
replaces those choices; nothing from the first draft's scope survives unchanged except the
`rollupSeverities` casing fix and the general shared-contract-shape reuse.

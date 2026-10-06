# L03 — Intent layer (client)

Show a pull request's derived **intent** on the PR page, before the review results, so the
user can check the understanding first. This file is the client slice (phases 7 and 8 of the
plan); phase 7 is the Intent card and its data path, phase 8 the two places where the scope
filter's result shows: the out-of-scope badge on a finding and the filtered count in the trace.

Read [`specs/L03-intent-layer.md`](../../specs/L03-intent-layer.md) first — it states the
feature and the rules that span packages — and the server half in
[`../../server/specs/L03-intent-layer.md`](../../server/specs/L03-intent-layer.md), which
defines the two routes this screen calls. The approved plan is
[`../../specs/L03-intent-layer-plan.md`](../../specs/L03-intent-layer-plan.md).

## Route and data

| | |
|---|---|
| Route | `/repos/:repoId/pulls/:number` — tabs `?tab=overview` (default) and `?tab=findings` (labelled "Agent runs") |
| Read | `GET /pulls/:id/intent` → `PrIntentResponse` `{ intent: PrIntentRecord \| null }`; never computes |
| Write | `POST /pulls/:id/intent` → `PrIntentResponse`; always recomputes (no body) |
| Hooks | `src/lib/hooks/intent.ts` — `intentKeys.detail(prId)` = `["pr-intent", prId]`, `usePrIntent(prId, { poll })`, `useRegenerateIntent(prId)` |
| Polling | every 4 s while `poll` is true (a review run is in flight: the run derives the intent in its pre-work), never otherwise |
| Cache | the mutation writes its response with `setQueryData`; `onRunDone` on the page invalidates the key |

Types come from `@devdigest/shared` by `import type`; the enum-keyed maps (`RISK_ICON`,
`CONFIDENCE_STYLE`) are written out locally in `IntentCard/constants.ts`.

## Placement (R4)

`page.tsx` renders `<IntentCard prId poll>` at the top of the content area when the tab is
`overview` (above Description) or `findings` (above Live review, Timeline and Review runs) and
the PR's uuid is known. It is on the page before any review has run: with no stored intent it
shows the empty state and **Derive intent**. A user who goes straight to Run Review is switched
to Agent runs, where the card fills in within the first seconds of the run.

## The card

One component, `_components/IntentCard/`, built from vendored primitives. The root is a
`<section>` whose accessible name is `brief.block.intent` ("Intent"). Every string comes from
`messages/en/brief.json` (`intent.*`); keys that mirror an enum use the enum value.
`SectionLabel` uppercases through CSS — the DOM keeps `Intent`, `In scope`.

| Part | Rendering |
|---|---|
| Header | `SectionLabel icon="Target"` "Intent"; right: the confidence `Badge` and `IconBtn icon="RefreshCw"` labelled "Re-run intent detection" |
| Summary | the sentence in italics inside typographic quotes |
| Missing context (R8) | when `missing_context` is true, a warning line with `Icon.AlertTriangle` naming the unread issue and document sources (`Issue #471`, `specs/rate-limit.md`); an unavailable `external_link` is listed in Sources but does not trigger it |
| Confidence | dot `Badge`: "High confidence" (`--ok`), "Medium confidence" (`--warn`), "Low confidence" (`--text-muted`); always a text label. `medium` and `low` add one muted line saying why; `high` adds none |
| Flags | `stale` → "The PR changed since this was derived. Re-run intent detection."; `injection_suspected` → warning `Badge` "Instruction-like text found in the PR" |
| Columns | "In scope" with `Icon.Check` in `--ok`; "Out of scope" with `Icon.X` in `--text-muted`; an empty list shows a muted "None stated" |
| Risk areas | after a divider; one `Badge` per area, icon by kind: security `Shield`, dependency `Boxes`, performance `Zap`, data `Database`, api `Code`, other `AlertTriangle`. `Badge`, not `Chip` (`Chip` renders a `<button>`) |
| Sources | footer row after a second divider: "Derived from" and one small mono `Badge` per source (`Title`, `Description`, `Issue #471`, a document path, `Changed files`, `External link`). An unavailable source is muted, carries `Icon.AlertTriangle` and the suffix "not read". The model id and `formatCostUsd(cost_usd)` sit at the right end, muted |
| Empty | "Intent not derived yet", "Derive it now to check the understanding, or run a review.", a `Button` "Derive intent" |
| Loading / pending | `Skeleton` while the query loads; the button's `loading` state during the mutation |

Model-derived text (summary, scope items, risk labels, source refs, model id) is rendered as
React text nodes only: no `Markdown`, no `dangerouslySetInnerHTML`, no link built from model
output. No popover or tooltip (`client/INSIGHTS.md`, the floating-element entry).

A failed `POST` (400 `intent_unavailable`, 502) reaches the user through the global mutation
error toast; the card keeps its previous state.

## The out-of-scope signal and the filtered count (phase 8)

| Where | What renders | When | Message key |
|---|---|---|---|
| `FindingCard` | a `Badge` "Outside PR scope" (`--warn` on `--warn-bg`) next to the category tag | `f.scope === 'out_of_scope'`; `in_scope`, `null` and an absent field render nothing | `prReview.finding.outOfScope` |
| Trace drawer, Stats section | a muted `Badge` "{count} out-of-scope filtered" in the section's right slot, next to the grounding badge | `stats.scope_filtered` is a number above 0; `null`, `0` and an absent field render nothing | `runs.trace.scopeFiltered` |

In a run whose scope filter was on, the finding badge appears only on a serious finding: the one
signal kept for that problem. The Tool calls list shows the `classify_intent` entry with no
component change (it is an ordinary `tool_calls` entry). Both strings come from the message
files; the count is passed as an ICU argument, never concatenated.

## Acceptance

1. With a stored intent, the Overview tab shows the Intent card above Description with the
   summary, both scope lists, the risk areas, the confidence badge, the sources and, when
   `missing_context` is true, the warning line.
2. The Agent runs tab shows the same card above Live review, Timeline and Review runs.
3. With no stored intent the card shows the empty state; **Derive intent** calls `POST` and the
   card renders the returned record without a reload.
4. **Re-run intent detection** calls `POST`; the card shows the new record.
5. While a review run is in flight the card re-reads every 4 s; it does not poll otherwise.
6. No string is inlined in the component; no model text is rendered as markup.
7. A finding with `scope: 'out_of_scope'` shows "Outside PR scope" on its card; an in-scope,
   null or untagged finding shows none.
8. A run trace with `stats.scope_filtered: 2` shows "2 out-of-scope filtered" in its Stats
   section; null, 0 or an absent field shows nothing. A trace whose `tool_calls` starts with
   `classify_intent` lists it before the `review_file` entries.

## Tests

Colocated, real message JSON through `NextIntlClientProvider`, hook module mocked with `vi.mock`.

- `IntentCard.test.tsx` — summary, both lists and risk areas render; `Medium confidence` with
  its hint, `low` shows the low hint, `high` shows none; sources render with `Issue #471` and a
  document path, an unavailable one is marked "not read"; `missing_context: true` shows the
  warning line naming the unavailable issue and document, `false` shows none; an unavailable
  `external_link` is listed without the warning line; an empty scope list shows "None stated";
  `stale` shows the re-run line; `injection_suspected` shows its badge; `{ intent: null }`
  shows the empty state and clicking "Derive intent" calls the mutation; "Re-run intent
  detection" calls the mutation; the loading state renders no summary.
- `src/lib/hooks/intent.test.tsx` (mocked `fetch`, as `skills.test.tsx`) — `usePrIntent`
  requests `/pulls/<id>/intent` and is disabled without an id; `useRegenerateIntent` posts to
  the same path and writes the response into the `["pr-intent", id]` cache.
- `FindingCard.test.tsx` (extended) — `scope: 'out_of_scope'` shows "Outside PR scope";
  `in_scope`, null and absent show none.
- `RunTraceDrawer.test.tsx` (extended) — `stats.scope_filtered: 2` shows "2 out-of-scope
  filtered"; null, 0 and absent show nothing; a `classify_intent` first entry is listed before
  `review_file`.

Browser-level acceptance: [`../../e2e/specs`](../../e2e/specs) (flow `09-pr-intent`, phase 9).

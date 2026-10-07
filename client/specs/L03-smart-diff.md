# L03 — Smart Diff (client)

The **Files changed** tab groups a PR's files by role, shows the latest review's findings
inside the diff, and can switch back to the original order.

Read [`specs/L03-smart-diff.md`](../../specs/L03-smart-diff.md) first: it defines the
requirements (A1–C5), the rules that span packages, the resolved questions Q1–Q4 and the
decisions D1–D11. The route this screen calls is defined in
[`../../server/specs/L03-smart-diff.md`](../../server/specs/L03-smart-diff.md).

## Route and data

| | |
|---|---|
| Route | `/repos/:repoId/pulls/:number?tab=diff`, plus `&order=original` for the flat list (D4) |
| Files and patches | `GET /pulls/:id` → `PrDetail.files[]` (already loaded by the page) |
| Grouping | `GET /pulls/:id/smart-diff` → `SmartDiffResponse` |
| Findings | `GET /pulls/:id/reviews` through the existing `usePrReviews(prId)`; the query is shared with the page, so the tab adds no request |
| Finding actions | the existing `useFindingAction()` |
| New hook | `src/lib/hooks/smart-diff.ts` — `smartDiffKeys.detail(prId, headSha)` = `["smart-diff", prId, headSha]`, `useSmartDiff(prId, headSha)`; enabled only when both are known, that is after the detail has loaded (D9) |
| Refresh (C4) | `smartDiffKeys` is invalidated where `["reviews", prId]` already is: the page's `onRunDone`, and the success of `useFindingAction`, `useDeleteRun` and `useDeleteReview`. In addition the page watches `usePrActiveRuns(prId)`, which polls on every tab: when its list goes from non-empty to empty, the page runs the same refresh as `onRunDone` (reviews, run history, intent, smart-diff), so the marks appear on Files changed without a reload (Q5) |

Types come from `@devdigest/shared` by `import type`. `SmartDiffRole` gains `tests` and `docs`
in `src/vendor/shared/contracts/brief.ts`, the same lines as in the server copy; nothing else
under `src/vendor/` is edited.

## Joining the three sources

- A group's files come from the smart-diff response; each is matched by `path` to its `PrFile`
  for the patch. A response path with no `PrFile` is skipped. A `PrFile` missing from the
  response is rendered after the last group, without a header, so that no file disappears.
- **Counted findings (Q1)** are computed once by a pure helper from `usePrReviews`: the newest
  review of each agent; a dismissed finding keeps its card but does not count (D5). The dot,
  the group counter, the stripe and the cards all use that one list, so they cannot disagree.
  The response's `finding_lines` follows the same rule on the server and is not a second
  source for rendering.

## Layout

```
‹› SMART DIFF · GROUPED BY ROLE                        [ Hide comments (3) ]
9 files · +247 −38                              [ Smart order | Original order ]
▸ ■ Core     The substance of the change — review closely        ● 2   2 files
▾ ■ Tests    Checks for the change                                     1 file
    ▸ src/middleware/ratelimit.test.ts                               +40 −0
▸ ■ Wiring   Hooks the core into the app                         ● 1   3 files
▸ ■ Docs     …                                                         1 file
▸ ■ Boilerplate   Generated or mechanical — skim                       2 files
```

| Part | Rendering |
|---|---|
| Section header | `SectionLabel icon="Code"` with `smartDiff.groupedByRole`; right: the comments switch (below) |
| Totals row | "N files · +A −D" from the PR detail; right: a two-button segmented switch **Smart order** / **Original order**, the active one marked with `aria-pressed` |
| Group header | chevron, a square in the role's colour, the role label, a muted one-line description; right: the findings mark and `smartDiff.filesCount`. The whole header is a button that collapses the group. Not sticky (C1 is not built) |
| Findings mark on a group (A3) | a dot in the colour of the most severe counted finding in the group and the **number of files** with a counted finding; not rendered when that number is 0. Accessible name from `smartDiff.filesWithFindings` |
| Group body | the group's files as file cards. Groups `docs` and `boilerplate` start collapsed, and their file cards start collapsed too (D2); in the other groups a card follows the existing `AUTO_EXPAND_MAX_LINES` rule. A group with no files is not rendered (D1) |
| Original order (A6) | one flat list in the order of `PrDetail.files[]`, no group headers; dots, stripes and inline findings stay |

Role colours are tokens that already exist in the theme; the mapping is a constant keyed by the
exact enum values (`{ core, tests, wiring, docs, boilerplate }`). The client keeps no list of
the role order: groups are rendered in the order the response carries (Q7).

## Findings in the diff

Three marks, all from the counted list.

| Where | Rendering |
|---|---|
| File card header (A4) | a dot after the path, no number, in the colour of the file's most severe counted finding; `aria-label` from `smartDiff.fileHasFindings`. The existing GitHub comment count (message icon and number) is left as it is, next to it |
| Code line (B4) | the line whose new-side number equals a finding's `start_line` gets a left stripe in the severity colour and, at the right edge, a tag with the severity icon and a word: `CRITICAL` → blocker, `WARNING` → warning, `SUGGESTION` → suggestion. With several findings on a line the most severe one sets both (D8). The stripe and tag stay when findings are hidden by the switch |
| Under the line (A5, B5, C2) | one `FindingCard` per finding, opened by default, with Accept and Dismiss wired to `useFindingAction` exactly as `FindingsPanel` does. A click on the card's header collapses it to that one line. `FindingCard` itself is not changed |
| End of the file (B6) | findings of this file whose `RIGHT:<start_line>` key is not among the rendered lines (or whose file has no patch) are listed under a label `smartDiff.findingsOutsideDiff`, as the same cards, in the place where outdated GitHub comments already go |

Colours and icons come from `SEV` in `@devdigest/ui`; no new palette.

### Changes inside `src/components/diff-viewer/` (D7)

`diff-viewer` is shared chrome and must not import from a route folder, so the card is passed
in. It gains one optional prop next to `commenting`:

```ts
interface DiffFindingApi {
  /** Findings of the newest review of each agent, dismissed ones included (they keep their card).
   *  The viewer derives dots, stripes and tags from the non-dismissed ones. */
  findings: FindingRecord[];
  /** When false, cards are hidden; stripes, tags and dots stay. */
  showFindings: boolean;
  /** Draws one finding; supplied by the route (wraps FindingCard). */
  renderFinding: (finding: FindingRecord) => React.ReactNode;
}
```

| File | Change |
|---|---|
| `comments.ts` or a new `findings.ts` | pure helpers: findings of a file, `RIGHT:<start_line>` key, split into anchored and unanchored against the rendered keys (the pattern of `partitionThreads`), most severe of a list |
| `FileCard` | accepts `findings` and an optional `defaultOpen`; header dot; passes each line its findings; renders the unanchored block |
| `CodeLine` | stripe, tag, and the cards under the line |
| `DiffViewer` | passes `findings` and `defaultOpen` through |
| `index.ts` | exports the `DiffFindingApi` type, and `isCounted` and `mostSevere`, so that the route computes the group counter and the switch number from the same rule the viewer uses for the dot, the stripe and the tag |

With the prop absent, `diff-viewer` renders exactly as today.

### In the route folder

`_components/DiffTab/` keeps the tab thin and gets its own `_components/`: `RoleGroup` (header
and body of one group), `OrderSwitch`, and `InlineFinding` (the `FindingCard` wrapper given to
`renderFinding`), with `constants.ts` (role colours, label keys, which roles start collapsed), `helpers.ts` (the join,
the counted findings, per-group counts) and `styles.ts`.

## The comments switch (B7, Q2)

One switch controls GitHub comment threads and inline finding cards together. It is shown when
the PR has at least one GitHub comment or one counted finding, shows the sum in its label, and
starts **on**. Posting a comment turns it on, as today. Turning it off hides threads and cards
and leaves the dots, counters, stripes and tags.

## States

| State | Rendering |
|---|---|
| Smart-diff loading | `Skeleton` rows in place of the groups; the totals row and the switch are already there |
| Smart-diff failed, no grouping loaded | the flat list (as Original order) with one muted line `smartDiff.groupingUnavailable`; the tab never becomes unusable because grouping failed |
| Smart-diff refetch failed, a grouping already loaded | the groups stay as they are, with no notice: a failed background refresh does not discard the grouping the user is reading |

Exactly one body is rendered at a time. The choice is one pure function, `diffBodyMode` in
`DiffTab/helpers.ts`, that returns `flat`, `pending`, `groups` or `unavailable` from the order,
the query's error flag, whether grouping data exists and the number of files; the notice line
and the body follow from that one value. The section label needs one more fact: it is
`groupedByRole` only in `groups` mode with at least one non-empty group, so a response that
places none of the PR's files is labelled as the flat list it renders.

| State | Rendering |
|---|---|
| No files | the existing "No changed files." |
| No review yet (C3) | one muted line `smartDiff.noReviewYet` under the totals row; no dots and no counters, since a zero is never rendered |
| Review in flight | nothing special; the marks appear when the run ends, on any tab (C4, Q5) |

## Strings (C5)

All in `messages/en/prReview.json` under `smartDiff`. Existing keys are kept; the value of
`filesCount` becomes a plural form ("1 file", "2 files"). The three labels drawn inside
`diff-viewer` (`fileHasFindings`, `lineTag.*`, `findingsOutsideDiff`) are read from this
namespace by leaf components that render only when findings are passed, so a screen that uses
the viewer without findings needs only `shell`. New: `filesChanged` (the section label of the
flat list); `testsLabel`,
`docsLabel`; one description per role (`coreHint`, `testsHint`, `wiringHint`, `docsHint`,
`boilerplateHint`); `smartOrder`, `originalOrder`; `totals`; `filesWithFindings`,
`fileHasFindings`; `lineTag.CRITICAL`, `lineTag.WARNING`, `lineTag.SUGGESTION`;
`findingsOutsideDiff`; `noReviewYet`; `groupingUnavailable`; `showComments`, `hideComments`.
The three strings `DiffTab` hardcodes today ("Files changed · N files", "Show comments",
"Hide comments") move here as well. No Smart Diff label is written in a component.

## Tests

Component and unit tests in the client suite (vitest, RTL, `fetch` mocked), next to the code.

| Subject | Covers |
|---|---|
| `DiffTab/helpers` | the join (missing on either side); counted findings: newest review per agent, dismissed excluded; files-with-findings per group |
| `DiffTab` | five headers in order with labels and counts; an empty group is absent; docs and boilerplate collapsed, the lock file appears after expanding; the order switch renders the flat list and writes `order=original`; the "no review yet" line; the fallback when the smart-diff request fails |
| `diff-viewer` helpers | anchored and unanchored split; most severe |
| `FileCard` / `CodeLine` | the dot only with findings, and independent of the GitHub comment count; the tag word per severity; the card under the right line; the unanchored block; cards hidden and marks kept when `showFindings` is false; no change without the prop |
| Inline finding | Dismiss calls `POST /findings/:id/dismiss` and the reviews and smart-diff queries are invalidated |

Browser level: `e2e/specs/11-pr-smart-diff.flow.json` on the seeded PR #482 — the five group
headers present (their order is pinned by the `DiffTab` test), boilerplate collapsed then expanded to show `package-lock.json`, the finding title
under `src/config.ts`, and the switch to Original order. `05-pr-diff.flow.json` keeps passing:
`src/config.ts` is a core file and is visible on open.

## Acceptance

- [ ] A1, A2, A6 and D1–D4 hold on the seeded PR and on the test PR.
- [ ] A3–A5, B4–B7 hold after a review; the dot is independent of the GitHub comment count.
- [ ] C2–C5 hold, C4 also when the user stayed on Files changed during the run; `grep` finds no Smart Diff label literal in a `.tsx` file.
- [ ] `diff-viewer` imports nothing from `src/app/`; `FindingCard` and everything under
      `src/vendor/` except the two enum values in `brief.ts` are unchanged.
- [ ] `pnpm typecheck` and `pnpm test` are green.

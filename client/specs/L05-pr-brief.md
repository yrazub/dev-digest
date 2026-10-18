# PR Why + Risk Brief — client
Spec ID: SPEC-2026-10-17-pr-brief · Umbrella: [`specs/L05-pr-brief.md`](../../specs/L05-pr-brief.md) · Status: approved

## Scope
Covers AC-1–AC-42 of the umbrella, and the client side of AC-83 and AC-84. The deferred umbrella
criteria AC-85–AC-89 are carried by the deferred requirements at the end of the Requirements
section and are not part of this delivery.

The Overview tab of `/repos/:repoId/pulls/:number` gets a "PR Brief" section that holds the brief's
summary, the existing Intent and Blast radius blocks side by side, the brief's Risk areas and its
Review focus list. A Review focus click opens the Files changed tab (`?tab=diff&file=&line=`) at
that file and line. Contracts (`PrBriefResponse`, `PrBriefRecord`, `PrBrief`, `ReviewFocusItem`,
`BriefInput`) are defined in the server spec and come from `@devdigest/shared`; the client's
copies of `contracts/brief.ts` and `contracts/review-api.ts` are re-synced, never edited by hand
apart from that sync.

This spec overrides two layout statements of implemented client specs, without superseding them:
`client/specs/L03-intent-layer.md:77` (the Intent card above Description on the Overview tab) — on
Overview the Intent card now sits in the brief's left column, without its risk-area tag row; and
`client/specs/L04-blast-radius.md:38` (the Blast radius block full width above Description) — it
now sits in the brief's right column. Everything else in those specs (derive, re-run, Resync, tree
and graph views, states) is unchanged, and the Agent runs tab keeps the Intent card as it is.

## What already exists

| Piece | Where |
|---|---|
| The PR page: tab in `?tab=` (`overview` default, `findings`, `diff`); `setParam` uses `router.replace`; `IntentCard` rendered above the tab content on `overview` and `findings`; page container `padding: 24px 32px 44px`, `maxWidth: 1080`, centred, column `gap: 24` | `src/app/repos/[repoId]/pulls/[number]/page.tsx` |
| `OverviewTab` — `BlastRadiusCard` then the Description section | `…/_components/OverviewTab/OverviewTab.tsx` |
| `IntentCard({ prId, poll })` — its own `Card`; risk-area tag row under `intent.riskAreas` | `…/_components/IntentCard/IntentCard.tsx:118` |
| `BlastRadiusCard({ prId, repoId, repoFullName, headSha })` | `…/_components/BlastRadiusCard/` |
| `DiffTab` — order in `?order=`; `RoleGroup` with local open state (Boilerplate starts collapsed); `FileCard` with local open state (opens when `additions + deletions ≤ AUTO_EXPAND_MAX_LINES`) | `…/_components/DiffTab/`, `src/components/diff-viewer/` |
| `usePullDetail(prId)` (gives `head_sha`), `usePrIntent`, `useRegenerateIntent` (the hook pattern to copy) | `src/lib/hooks/pulls.ts`, `src/lib/hooks/intent.ts` |
| `formatCostUsd` | `src/lib/format-cost.ts` |
| `messages/en/brief.json`: `block.intent`, `block.blast`, `block.risks` ("Risks"), `noRisks`, `unavailable`, `unavailableHint` ("Run a review or open the PR to compute it."), the L03 `intent.*` keys | `messages/en/brief.json` |
| Only `<main>` scrolls in the app shell; `window.scrollTo` does nothing | `client/INSIGHTS.md` (2026-09-20) |

## Requirements (EARS)
| ID | Requirement | Covers |
|---|---|---|
| R-WEB-1 | The Overview tab shall render a section with the `SectionLabel` "PR Brief" (icon `FileText`). | AC-1 |
| R-WEB-2 | WHILE `GET /pulls/:id/brief` answers `brief: null`, the PR Brief section shall show the empty card with `brief.unavailable` ("Brief not available yet."), `brief.unavailableHint` ("Generate a Why+Risk brief for this PR.") and a primary "Generate brief" button. | AC-2 |
| R-WEB-3 | WHILE the brief is `null`, the PR Brief section shall render the Intent card and the Blast radius card in the two-column grid below the empty card, with no Risk areas and no Review focus block. | AC-3 |
| R-WEB-4 | WHEN the user presses "Generate brief", the PR Brief section shall call `useGenerateBrief` and render the returned `PrBriefResponse` from the query cache, with no navigation. | AC-4 |
| R-WEB-5 | WHILE a brief is shown, the PR Brief section shall render `brief.summary` as a text node in the summary panel, the first element under the section label. | AC-5 |
| R-WEB-6 | WHILE a brief is shown, the PR Brief section shall render the Intent card in the left column and the Blast radius card in the right column of a two-column grid. | AC-6 |
| R-WEB-7 | WHILE a brief is shown, the left column shall render, inside the Intent card below a divider, a "Risk areas" block (`brief.block.risks`) with one entry per `risks.risks` item showing its `title` and each `file_refs` entry as plain text. | AC-7 |
| R-WEB-8 | WHILE a brief is shown, the PR Brief section shall render the Review focus panel titled `brief.reviewFocus.title` ("Review focus — read these first") with a count badge and one row per `review_focus` item, `<file>:<line> — <reason>`, in array order. | AC-8 |
| R-WEB-9 | IF `risks.risks` is empty, THEN the Risk areas block shall render `brief.noRisks`. | AC-9 |
| R-WEB-10 | IF `review_focus` is empty, THEN the Review focus panel shall render `brief.reviewFocus.empty` ("No review focus items."). | AC-10 |
| R-WEB-11 | IF an entry of `brief.inputs` has `status: 'missing'`, THEN the summary panel shall render a line `brief.inputs.without` that names each such input (`brief.inputs.kind.<kind>`) with its reason (`brief.inputs.reason.<reason>`). | AC-11 |
| R-WEB-12 | IF an entry of `brief.inputs` has `status: 'trimmed'`, THEN that line shall also name it under `brief.inputs.trimmed`, with `omitted` when it is not null. | AC-12 |
| R-WEB-13 | IF `dropped.risks` or `dropped.review_focus` is above zero, THEN the brief footer shall render `brief.dropped` with both numbers. | AC-13 |
| R-WEB-14 | WHILE a brief is shown, the brief footer shall render the `model` (mono), `formatCostUsd(cost_usd)`, the relative time since `generated_at`, and `brief.footer.tokens` with `input_tokens` and `input_budget_tokens`; a null value is left out. | AC-14 |
| R-WEB-15 | The Intent card rendered by the Overview tab shall not render its risk-area tag row. | AC-15 |
| R-WEB-16 | The Intent card rendered on the Agent runs tab shall render its risk-area tag row as before. | AC-16 |
| R-WEB-17 | WHILE the viewport is narrower than 900 px, the brief grid shall render one column with the Intent card first. | AC-17 |
| R-WEB-18 | The Overview tab shall render the Description section after the PR Brief section. | AC-18 |
| R-WEB-19 | Each Review focus row shall render a `file` longer than 56 characters as its first 20 characters, "…" and its last 35 characters (56 in all; a `file` of 56 characters or fewer is shown whole), followed by `:<line>`, and shall set the full `<file>:<line>` as the row's `title` whether the path is shortened or not. | AC-19 |
| R-WEB-20 | The PR Brief section, the Risk areas block, the Review focus panel and the footer shall take every user-facing string from the `brief` namespace through `next-intl` (repository rule, `client/CLAUDE.md`). | AC-20 |
| R-WEB-21 | WHEN the PR page mounts, the PR Brief section shall read the brief with `usePrBrief` (`GET`) only and shall send no `POST`. | AC-21, AC-83 |
| R-WEB-22 | WHEN the user presses the Regenerate icon button (`RefreshCw`) in the section label's right slot, the PR Brief section shall call `useGenerateBrief` and render the returned brief. | AC-22 |
| R-WEB-23 | WHILE `useGenerateBrief` is pending, the PR Brief section shall render the Generate brief button, or in place of the Regenerate icon button a small button, disabled with the text `brief.generating` ("Generating…"). | AC-23 |
| R-WEB-24 | WHILE `useGenerateBrief` is pending, the PR Brief section shall keep rendering the cached brief, if any. | AC-24 |
| R-WEB-25 | IF `usePrBrief` fails, THEN the PR Brief section shall render `brief.loadFailed` with a Retry button that refetches, and no Generate brief button. | AC-25 |
| R-WEB-26 | IF `useGenerateBrief` fails with `400` code `brief_unavailable`, THEN the PR Brief section shall render the API's message and a link to `/settings/api-keys` (the Settings page the onboarding screen links to for keys). | AC-26 |
| R-WEB-27 | IF `useGenerateBrief` fails with any other error, THEN the PR Brief section shall render the error's message and keep rendering the cached brief. | AC-27 |
| R-WEB-28 | WHILE `brief.stale` is `true`, the summary panel shall render `brief.stale` with the first 7 characters of `brief.head_sha` and a Regenerate action that calls `useGenerateBrief`; the brief query key includes the PR detail's `head_sha`, so a new head refetches it. | AC-28 |
| R-WEB-29 | The PR page shall call `useGenerateBrief` only from the Generate brief button, the Regenerate icon button and the stale mark's Regenerate action. | AC-29 |
| R-WEB-30 | Each Review focus row shall be a `<button type="button">` with `aria-label` `brief.reviewFocus.open` ("Open `<file>:<line>` in Files changed"). | AC-30 |
| R-WEB-31 | The Regenerate icon button shall have the accessible name `brief.regenerate` ("Regenerate brief"). | AC-31 |
| R-WEB-32 | WHEN the user clicks a Review focus row, the PR page shall show the Files changed tab with the row's file card open and its header scrolled into view inside `<main>`. | AC-32, AC-84 |
| R-WEB-33 | WHEN the target line is rendered in the target file card (a new-side line number equal to `line`), the Files changed tab shall scroll that line into view inside `<main>`. | AC-33 |
| R-WEB-34 | WHEN the Files changed tab scrolls to the target line, the Files changed tab shall apply the line mark to that row and remove it after 1,700 ms. | AC-34, AC-84 |
| R-WEB-35 | WHEN the user clicks a Review focus row, the PR page shall navigate to `?tab=diff&file=<encodeURIComponent(file)>&line=<line>`, keeping the other parameters. | AC-35 |
| R-WEB-36 | The Review focus navigation shall use `router.push`, so that it adds a history entry. | AC-36 |
| R-WEB-37 | WHEN a jump targets a file in a collapsed role group or a collapsed file card, the Files changed tab shall open that group and that card. | AC-37 |
| R-WEB-38 | IF the target line is not rendered in the file card, THEN the Files changed tab shall scroll to the file card's header and mark no line. | AC-38 |
| R-WEB-39 | IF `file` matches no path of `pr.files`, THEN the Files changed tab shall render as usual, with no scroll, no mark and no message. | AC-39 |
| R-WEB-40 | WHEN the Files changed tab renders with `file` (and optionally `line`) in the URL, the Files changed tab shall perform the jump once, after the Smart Diff grouping or the flat list has rendered, and not again on later renders of the same navigation. | AC-40 |
| R-WEB-41 | WHEN the user changes tab with the tab bar, the PR page shall remove `file` and `line` from the URL. | AC-41 |
| R-WEB-42 | The Files changed tab shall perform the jump in both `order=original` and the smart order. | AC-42 |

### Deferred

Not part of this delivery; they come back with the deferred umbrella criteria they cover (P3,
deferred by the user in discovery).

| ID | Requirement | Covers |
|---|---|---|
| R-WEB-43 | WHILE a brief is shown and `usePrReviews` has a review, the PR Brief section shall render the existing `VerdictBanner` of the newest review with the brief's summary in place of the review's, and the Regenerate icon button inside the banner. | AC-85 (deferred) |
| R-WEB-44 | Each risk entry shall have a chevron toggle with `aria-expanded` that shows the risk's `explanation` as text below the risk row. | AC-86 (deferred) |
| R-WEB-45 | WHEN the user clicks a risk entry, the PR page shall navigate as R-WEB-35 to the path and first line of its first `file_refs` entry. | AC-87 (deferred) |
| R-WEB-46 | IF a clicked risk or Review focus file is not in `pr.files`, THEN the PR page shall stay on Overview and show the message "File not in this PR's diff" with `role="status"` for 2,600 ms. | AC-88 (deferred) |
| R-WEB-47 | WHILE `useGenerateBrief` is pending, the PR Brief section shall render the design's `BriefSkeleton` in place of the summary, Risk areas and Review focus. | AC-89 (deferred) |

## Route and data

| Data | Source | Hook (`src/lib/hooks/`) |
|---|---|---|
| the brief | `GET /pulls/:id/brief` → `PrBriefResponse` | `usePrBrief(prId, headSha)` in a new `brief.ts`; key `["pr-brief", prId, headSha]`, enabled when `prId` is set |
| generate / regenerate | `POST /pulls/:id/brief` → `PrBriefResponse` | `useGenerateBrief(prId, headSha)` — on success writes the response into the `usePrBrief` key; no invalidation of other keys |
| intent, blast map | existing `usePrIntent`, `useBlastRadius` | unchanged; rendered by the existing cards |
| PR files for the jump | `usePullDetail(prId)` → `PrDetail.files` | existing |

Route: `/repos/:repoId/pulls/:number`. URL state: `tab` (existing), `order` (existing), and the new
`file` and `line` (R-WEB-35, R-WEB-40, R-WEB-41). Model-written text — summary, titles, file
references, reasons — is rendered as text nodes only, never through a markdown or HTML renderer.

## Placement

| Surface | Folder |
|---|---|
| The PR Brief section (summary panel, inputs line, stale mark, empty card, error, grid, footer) | a new `…/_components/PrBriefSection/`, rendered by `OverviewTab` before the Description |
| Risk areas block | `PrBriefSection/_components/RiskAreas/` |
| Review focus panel | `PrBriefSection/_components/ReviewFocus/` |
| Intent card without its tag row on Overview | `IntentCard` gains a way to hide the tag row and to render the Risk areas block under a divider inside its card; the page stops rendering `IntentCard` above the tab content on `overview` (it keeps it on `findings`) |
| The jump | `page.tsx` (navigation, clearing on tab change) and `DiffTab` / `RoleGroup` / `diff-viewer` (`FileCard`, `CodeLine`): open-on-target and scroll-and-mark, read from the URL |

Placement inside these folders follows the `frontend-ui-architecture` skill; `src/vendor/**` is
not edited.

## Layout

Design source: the PR-detail screen of `docs/DevDigest Design (context).html`, decoded
(`screen_pr_detail.jsx`: `OverviewTab`, `BriefCard`, `BriefEmpty`, `RiskPillRow`,
`ReviewFocusBlock`; `findings.jsx`: `VerdictBanner`; `diff.jsx`: `DiffFileCard`; `primitives.jsx`:
`SectionLabel`, `Card`), and screenshots img1 (Overview) and img2/img5 (Files changed after a
jump) of the course task.

| Area | Values |
|---|---|
| Page container | unchanged: the page's `padding: 24px 32px 44px`, `maxWidth: 1080`, centred. **Departure:** the design's Overview uses `20px 28px 40px`; the page container is shared by all three tabs and stays as it is. |
| Section label "PR Brief" | `SectionLabel`, icon `FileText` 14 px muted; label 11 px, weight 700, letter-spacing 0.07em, uppercase, muted; gap 8; margin-bottom 12; right slot: the Regenerate `IconBtn` (`RefreshCw`) once a brief exists. **Departure:** the design puts Regenerate inside the verdict banner, which is deferred. |
| Section body | a column, gap 16, full width of the container |
| Summary panel | padding 16, border 1 px `var(--border)`, radius 10, background `var(--bg-elevated)` (the design's banner box); summary 13.5 px, line-height 1.55, `var(--text-secondary)`. Under it, inside the panel: the inputs line and the stale mark, 12.5 px muted, each with an `AlertTriangle` 14 px in `var(--warn)`, gap 6 between them, margin-top 8. **Departure:** no verdict icon, verdict label, findings badge, PR score or cost column (AC-85 deferred). |
| Empty card | `Card`; content centred, max-width 340; icon box 48 × 48, radius 12, `var(--bg-hover)`, `FileText` 24 px muted, margin `0 auto 14px`; title 15 px weight 700, margin-bottom 6; hint 13 px, line-height 1.5, muted, margin-bottom 18; primary `Button` with icon `FileText`. **Departure:** the design's `minHeight: 320` is dropped, because the Intent and Blast radius cards stay visible below it (AC-3). |
| Error card | the empty card's frame with `brief.loadFailed` and a Retry `Button` (size `sm`) |
| Grid | `display: grid`, `gridTemplateColumns: 1fr 1fr`, gap 16; below 900 px `1fr` with the Intent card first |
| Left column | the Intent card (`Card`: background `var(--bg-elevated)`, border 1 px `var(--border)`, radius 8, padding `var(--card-pad)`); below its content a divider (height 1, `var(--border)`, margin `16px 0`), then `SectionLabel` "Risk areas" with icon `AlertTriangle`, then the risk entries |
| Risk entries | a wrapping row, gap 8; each entry `inline-flex`, column, gap 2, border 1 px `var(--border)`, radius 7, padding `5px 9px`; first line: kind icon 13 px coloured by severity (high `var(--crit)`, medium `var(--warn)`, low `var(--info)`) and the title, 12 px weight 600 `var(--text-secondary)`, gap 6; then each file reference in mono 10.5 px. Kind icons: `security` Shield, `db_migration` Database, `breaking_api` AlertOctagon, `perf` Zap, `deps` Boxes; any other kind `AlertTriangle`. **Departure:** no chevron segment (AC-86 deferred), and the file references are muted (`var(--text-muted)`) plain text, not accent links (AC-87 deferred). |
| Right column | the existing Blast radius card, unchanged. **Departure:** the design's "Prior PRs touching these files" accordion is not built (umbrella Non-goals). |
| Review focus panel | border 1 px `var(--border)`, radius 10, background `var(--bg-elevated)`, padding `14px 16px`; header row gap 8, margin-bottom 10: `ListChecks` 14 px `var(--accent)`, the title 10.5 px weight 700, letter-spacing 0.06em, uppercase, muted, and a `Badge` with the count (`var(--accent-text)` on `var(--accent-bg)`); list with no bullets, column, gap 2; each row a button, `display: flex`, `alignItems: baseline`, gap 9, full width, padding `7px 8px`, radius 6, transparent, `var(--bg-hover)` on hover and on focus; "▸" 12 px `var(--accent)`; `<file>:<line>` mono 11.5 px `var(--accent-text)`, no wrap; path character budget 56 (about the width the mono 11.5 px path gets in the 1,080 px panel): a longer `file` shows its first 20 characters, "…", its last 35 characters, then `:<line>`; the row's `title` is always the full `<file>:<line>` (R-WEB-19); "— <reason>" 12.5 px `var(--text-secondary)`, line-height 1.4. |
| Footer | under the Review focus panel, 11.5 px muted, items separated by " · ": model (mono), cost, "generated <relative time>", "<input> / 8,000 tokens in"; the dropped-count line on its own line in the same style. **Departure:** not in the design (UX proposals P1 and P3 accepted in discovery). |
| Description | the existing Description section, after the PR Brief section |
| Files changed — target | the target file card's border becomes 1 px `var(--accent)` while it is the target; the scroll leaves 96 px above the file header, or 130 px above the target line; the target line row gets a pulse of `var(--accent-bg)` for 1,700 ms (design `dd-line-pulse`). |

## Strings

`messages/en/brief.json`, `brief` namespace:

- Changed: `block.risks` = "Risk areas"; `unavailableHint` = "Generate a Why+Risk brief for this PR."
- Kept: `block.intent`, `block.blast`, `noRisks`, `unavailable`, and every `intent.*` key.
- New: `section` ("PR Brief"), `generate` ("Generate brief"), `generating` ("Generating…"),
  `regenerate` ("Regenerate brief"), `loadFailed`, `retry`, `noApiKey` (with the link text to
  Settings), `stale` ("Generated for {sha}; the PR has newer commits"), `inputs.without`
  ("Generated without: {list}"), `inputs.trimmed` ("trimmed: {list}"), `inputs.kind.<BriefInputKind>`,
  `inputs.reason.<BriefInputReason>`, `reviewFocus.title` ("Review focus — read these first"),
  `reviewFocus.empty` ("No review focus items."), `reviewFocus.open` ("Open {file}:{line} in Files
  changed"), `dropped` ("Dropped: {risks} risks, {focus} review-focus items — file not in this PR
  or its blast radius"), `footer.generated`, `footer.tokens` ("{input} / {budget} tokens in").

Keys that mirror an enum use its exact values (`inputs.reason.none_attached`).

## Tests

| File | Covers |
|---|---|
| `PrBriefSection.test.tsx` (mocked hooks) | R-WEB-1–R-WEB-14, R-WEB-17 (grid template at a narrow width), R-WEB-19 (paths of 56 and 57 characters: the first shown whole, the second as first 20 + "…" + last 35 followed by `:<line>`; both rows' `title` equal to the full `<file>:<line>`), R-WEB-20, R-WEB-22–R-WEB-31; a brief with three or more risks and focus items, one with every input missing, one with `trimmed` inputs and `omitted`, one with dropped counts, a stale one, a `brief_unavailable` error and a generic error |
| `OverviewTab.test.tsx` | R-WEB-15, R-WEB-18, R-WEB-21 (no `POST` on mount) |
| `IntentCard.test.tsx` | R-WEB-15, R-WEB-16 (tag row hidden only where the Overview asks for it) |
| `page` / tab-bar test | R-WEB-35, R-WEB-36, R-WEB-41 |
| `DiffTab.test.tsx` | R-WEB-32–R-WEB-34, R-WEB-37–R-WEB-40, R-WEB-42: a target in the collapsed Boilerplate group, a target in a collapsed large file card, a line inside and a line outside the rendered hunk, a file without a patch, a file not in `pr.files`, both orders, a second render that does not jump again; the mark removed after 1,700 ms with fake timers |

Component tests mock `fetch`; AC-83 and AC-84 are an `e2e` flow over the seeded brief of PR #482
(server spec, "Seeded brief"), owned by `test-writer`. `../../TESTING.md` decides where each test
goes. A UI phase also carries a manual screenshot check against the design screen (root
`INSIGHTS.md`, 2026-10-17).

## Documentation

`README.md` — the UI route map gets the PR Brief section and the `file` / `line` parameters of
`?tab=diff`; `docs/data-flow.md` — the `["pr-brief", prId, headSha]` key and the mutation that
writes it. Written by `doc-writer`.

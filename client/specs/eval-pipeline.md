# Eval Pipeline — client
Spec ID: SPEC-2026-10-31-eval-pipeline · Umbrella: [`specs/eval-pipeline.md`](../../specs/eval-pipeline.md) · Status: approved

## Scope
Covers AC-1, AC-7, AC-8, AC-10, AC-13, AC-14, AC-16, AC-19, AC-20, AC-22–AC-24, AC-26, AC-27,
AC-51–AC-91 and AC-98 of the umbrella, and the client side of AC-93 and AC-94 (the e2e flows themselves are
written by `test-writer`). Contracts (`EvalCaseRecord`, `EvalExpectation`, `EvalCaseCreateResponse`,
`EvalCaseList`, `EvalSuiteRun`, `EvalSuiteRunList`, `EvalSuiteRunDetail`, `EvalCaseResult`,
`EvalConfigSnapshot`, `EvalOverview`, `EvalAgentOverview`) are defined in the server spec and come
from `@devdigest/shared`; the client's `contracts/eval-pipeline.ts` and its `index.ts` export line
are synced from the server, never edited by hand apart from that sync.

The FindingCard gets a "Turn into eval case" button; the Agent editor gets an Evals tab
(`/agents/:id?tab=evals`); two new pages — the Eval Dashboard overview (`/evals`) and an agent's
view (`/evals/:agentId`) with a Compare modal — and a sidebar item. The run drawer (P2) and the
case preview, the regression banner, the trend chart and sparkline, the flipped-cases list, the
`?compare=` URL and the "Run eval (N)" label (P3) are the UX proposals accepted in discovery.

## What already exists

| Piece | Where |
|---|---|
| `FindingCard({ f, focused, defaultExpanded, onAction, pending, repoFullName, headSha })` — action row with Accept and Dismiss in the expanded body; `accepted_at` / `dismissed_at` from `FindingRecord`; no agent id | `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` |
| FindingCard rendered by `FindingsPanel` (findings only, no review) and by `DiffTab`'s `InlineFinding` | `…/_components/FindingsPanel/FindingsPanel.tsx:91`, `…/DiffTab/_components/InlineFinding/InlineFinding.tsx:24` |
| `ReviewRecord.agent_id` (nullable) — the agent of each review, with `findings[]` (`review_id` on each `FindingRecord`) | `src/vendor/shared/contracts/review-api.ts:31` |
| `AgentEditor` — tabs from `TABS` (`config`, `skills`, `context`), `?tab=` owned by the page; body `padding: 28`; unknown tab falls back to Config | `src/app/agents/_components/AgentEditor/AgentEditor.tsx`, `constants.ts`, `styles.ts` |
| `agents.json` `editor.tabs.evals` ("Evals") | `messages/en/agents.json:54` |
| `APP_NAV` — Skills Lab: Skills, Agents, Conventions; no eval item | `src/components/app-shell/nav.ts` |
| `activeKeyFor` returns `eval` for paths starting `/eval`; `shell.json` `nav.eval` ("Eval Dashboard") | `src/components/app-shell/helpers.ts:35`, `messages/en/shell.json:28` |
| `messages/en/eval.json` — `dashboard.*` (incl. `runEval` "Run eval ({count})", `running`, `noRuns`, `metrics`, `legend`, `table`), `evalsTab.*`, `caseEditor.*` (unused: Case Editor is a non-goal), `page.*` crumbs | `messages/en/eval.json` |
| Vendored `Modal`, `Checkbox`, `Dropdown`, `MetricCard` (delta printed `toFixed(2)`), `Sparkline`, `LineChart`, `SectionLabel`, `Card`, `Badge`, `IconBtn`, `MonoLink`, `EmptyState`; icons include `FlaskConical`, `Gauge`, `History`, `TrendingUp`, `Cpu`, `GitMerge` but **not** `GitCompare` | `src/vendor/ui/**` (do not edit) |
| `PageShell` with `crumb` | `src/components/page-shell/` |
| No `/evals` route | `src/app/` |

## Requirements (EARS)
| ID | Requirement | Covers |
|---|---|---|
| R-WEB-1 | WHILE `f.accepted_at` or `f.dismissed_at` is set, the FindingCard shall render, in its action row after Dismiss, a `Button` kind `ghost` size `sm` icon `FlaskConical` labelled `prReview.finding.toEval` ("Turn into eval case"), with the tooltip `toEvalHint.accepted` or `toEvalHint.dismissed`. | AC-1 |
| R-WEB-2 | Wherever the FindingCard renders (Findings panel, inline in Files changed), it shall receive the producing agent's id from the `ReviewRecord` its finding belongs to (`agent_id`, null when the review has none). | AC-1, AC-10 |
| R-WEB-3 | WHEN the user presses the button, the FindingCard shall call `useCreateEvalCase` and, on `201` or `200`, render inline `finding.evalSaved.<kind>` ("Saved as must find" / "Saved as must not flag") and a "View in Evals" link to `/agents/<agentId>?tab=evals`, without navigation. | AC-7 |
| R-WEB-4 | WHILE neither `accepted_at` nor `dismissed_at` is set, the FindingCard shall render the button disabled, with `finding.toEvalOpen` ("Accept or dismiss the finding first") as a tooltip on a hoverable wrapper and as the button's `aria-describedby` text. | AC-8 |
| R-WEB-5 | IF the agent id is null, THEN the FindingCard shall render the button disabled with `finding.toEvalNoAgent` ("No agent for this finding") the same way. | AC-10 |
| R-WEB-6 | IF `useCreateEvalCase` fails, THEN the FindingCard shall render the API's message inline under the action row ("No diff available for `<file>`" for that refusal), with `role="status"`. | AC-13 |
| R-WEB-7 | WHILE `useCreateEvalCase` is pending, the FindingCard shall render the button disabled. | AC-14 |
| R-WEB-8 | WHILE `useAgentEvalCases(agentId)` holds a case whose `source_finding_id` equals `f.id`, the FindingCard shall render `finding.inEvalSet` ("In eval set") and the "View in Evals" link in place of the button. | AC-16 |
| R-WEB-9 | `TABS` shall gain `{ key: "evals", labelKey: "editor.tabs.evals", icon: "Gauge" }` after `context`, and `AgentEditor` shall render the Evals tab for `?tab=evals`. | AC-19 |
| R-WEB-10 | The Evals tab shall render one case row per `EvalCaseRecord`, newest first: an outcome icon from the latest done run's result for that case (pass, fail, errored, or never run), the `name` in mono, a kind pill "must find" / "must not flag", and a sub-line `<file>:<start>-<end> — <title>` (`<file>:<line>` when start equals end). | AC-20 |
| R-WEB-11 | WHILE the case list is empty, the Evals tab shall render `evalsTab.emptyCases` ("No eval cases yet. Accept or dismiss a finding on a pull request, then press "Turn into eval case".") and the run button disabled. | AC-22 |
| R-WEB-12 | WHEN the user presses a case row's Delete `IconBtn` (`Trash`, `aria-label` "Delete case `<name>`"), the Evals tab shall open a `Modal` asking `evalsTab.deleteConfirm` ("Delete eval case `<name>`? Past runs keep their metrics.") with Delete and Cancel. | AC-23 |
| R-WEB-13 | WHEN the user confirms, the Evals tab shall call `useDeleteEvalCase` and render the list without the case once it succeeds. | AC-24 |
| R-WEB-14 | WHEN the user activates a case row's expand toggle (a button with `aria-expanded`), the Evals tab shall render the case's `input_diff` in a `<pre>` as text below the row. | AC-26 |
| R-WEB-15 | The Evals tab header shall render a `MonoLink` `evalsTab.viewDashboard` ("View full dashboard →") to `/evals/<agentId>`. | AC-27 |
| R-WEB-16 | WHEN the user presses the run button of the Evals tab or of the agent's dashboard view, the studio shall call `useStartEvalRun(agentId)` once, whether the agent is enabled or disabled. | AC-51 |
| R-WEB-17 | The Evals tab shall render a "Runs" section listing `useAgentEvalRuns(agentId)` newest first, each row with `started_at`, `v<config.agent_version>`, a status chip, recall, precision and citation bars, `<cases_passed>/<cases_total>` and the cost. | AC-52 |
| R-WEB-18 | The Evals tab shall render a metric strip with the latest done run's recall, precision, citation accuracy and `<cases_passed>/<cases_total>` ("Cases passed"), each percentage tile with its delta against the previous done run. | AC-53 |
| R-WEB-19 | WHILE a run of the agent has `status: 'running'`, every run button for that agent shall be disabled with `dashboard.runningProgress` ("Running… {done}/{total}") from `cases_done` and `cases_total`. | AC-54 |
| R-WEB-20 | WHILE the latest data of `useAgentEvalRuns` or `useEvalOverview` holds a `running` run, that query shall refetch every 2,000 ms; since the state comes from the server, a remount resumes it. | AC-55 |
| R-WEB-21 | WHEN a run seen as `running` comes back `done` or `failed`, the studio shall invalidate `["eval-runs", agentId]`, `["eval-run", runId]`, `["eval-overview"]` and `["eval-cases", agentId]`. | AC-56 |
| R-WEB-22 | IF `useStartEvalRun` fails with `400` code `eval_unavailable`, THEN the studio shall render the API's message with a link to `/settings/api-keys`. | AC-57 |
| R-WEB-23 | IF `useStartEvalRun` fails with any other error (`409`, `422`, `429`, network), THEN the studio shall render the error's message next to the run button. | AC-58 |
| R-WEB-24 | WHILE a done run has `cases_errored` above 0, its row shall render `runs.errored` ("{errored} of {total} cases errored"). | AC-59 |
| R-WEB-25 | IF a run's status is `failed`, THEN its row shall render the status "failed" in `var(--crit)` and its `error` text. | AC-60 |
| R-WEB-26 | WHEN the user activates a run row (outside its checkbox), the studio shall open a right-side drawer reading `useEvalRun(runId)` that lists each result's outcome, case name, kind, grounded findings (`file:lines` and title, matching ones marked), dropped count and error, closing on Esc or its close button and returning focus to the row. | AC-61 |
| R-WEB-27 | Every run button shall be labelled `dashboard.runEval` ("Run eval ({count})") with the agent's case count. | AC-62 |
| R-WEB-28 | `APP_NAV`'s `skillsLab` group shall gain `{ key: "eval", icon: "Gauge", href: "/evals" }` after `conventions`. | AC-63 |
| R-WEB-29 | `/evals` shall render, per `EvalOverview.agents` entry, a row with the agent's name, model, `dashboard.lastRun` ("Last run v{version} · {time} · {passed}/{total} pass") or `dashboard.noAgentRuns` ("No eval runs yet"), and mini metrics Recall, Prec and Cite of `latest`. | AC-64, AC-93 |
| R-WEB-30 | `/evals` shall render the section `dashboard.recentAll` ("Recent eval runs · all agents") with the 6 `recent_runs`, each with agent name, `started_at`, version, three bars and `<passed>/<total>`. | AC-65 |
| R-WEB-31 | WHEN the user activates an agent row or a recent-run row, `/evals` shall navigate to `/evals/<agentId>` with `router.push`. | AC-66 |
| R-WEB-32 | `/evals/:agentId` shall render three metric cards (Recall, Precision, Citation accuracy) of the latest done run, each with the delta `round(new × 100) − round(old × 100)` against the previous done run as "▲ +Npt", "▼ −Npt" or "±0pt". | AC-67 |
| R-WEB-33 | `/evals/:agentId` shall render the runs table of "Layout" with a `Checkbox` in the first column of each row. | AC-68, AC-93 |
| R-WEB-34 | The Compare button shall be disabled unless exactly two runs are selected. | AC-69 |
| R-WEB-35 | WHEN the user presses Compare, `/evals/:agentId` shall open the Compare `Modal` with the older selected run (by `started_at`) as "old" and four tiles — Recall, Precision, Citation, Cost — each showing old value, `ArrowRight`, new value and the signed delta (points for metrics; for cost, the values through the studio's `formatCostUsd` — `$` with 4 decimals, "—" for null — and the delta as a sign followed by `formatCostUsd` of its magnitude, e.g. "−$0.0010"). | AC-70, AC-94 |
| R-WEB-36 | The Compare modal shall render a word-level diff from the old run's `config.system_prompt` to the new one's, splitting on whitespace and keeping it, each token a text node styled as added, removed or same. | AC-71, AC-94 |
| R-WEB-37 | WHEN a third run is selected, `/evals/:agentId` shall drop the earliest-selected run from the selection. | AC-72 |
| R-WEB-38 | IF a run's status is `failed` or `running`, THEN its checkbox shall be disabled. | AC-73 |
| R-WEB-39 | IF a metric or the cost is null, THEN the studio shall render "—" in its place (bar track empty) and no delta for it. | AC-74 |
| R-WEB-40 | WHILE the agent has fewer than two done runs, the metric cards and the metric strip shall render no delta. | AC-75 |
| R-WEB-41 | IF `EvalOverview.agents` is empty, THEN `/evals` shall render an `EmptyState` with `dashboard.noAgents` and a link to `/agents`. | AC-76 |
| R-WEB-42 | `/evals` shall render every entry of `EvalOverview.agents`, enabled or not. | AC-77 |
| R-WEB-43 | `/evals/:agentId` shall request runs with `limit: 20` and render a "Show more" button while `total` exceeds the rows shown; each press loads the next 20. | AC-78 |
| R-WEB-44 | Agent names, case names and file paths on the eval surfaces shall render on one line with `text-overflow: ellipsis` and the full text as `title`. | AC-79 |
| R-WEB-45 | The Compare modal body shall have `maxHeight: 560` and `overflow: auto`. | AC-80 |
| R-WEB-46 | WHILE the two runs' `model` or `skills` differ, the Compare modal shall render a "Configuration" block with each run's model and `name@vN` list. | AC-81 |
| R-WEB-47 | IF the two runs' `system_prompt`, `model` and `skills` are equal, THEN the Compare modal shall render `dashboard.compare.noChange` ("No config change between these runs") in place of the configuration block and the prompt diff. | AC-82 |
| R-WEB-48 | Each run checkbox shall be a focusable control with `aria-label` "`<started_at, formatted>` · v`<agent_version>`", toggled by Space. | AC-83 |
| R-WEB-49 | Every metric bar shall render its value as text ("NN%" or "—") next to the bar. | AC-84 |
| R-WEB-50 | Every icon-only button on the eval surfaces (Delete, drawer close, expand toggle) shall have an `aria-label`. | AC-85 |
| R-WEB-51 | The Compare modal shall render `dashboard.compare.flipped` ("Cases that changed result") listing every case name present in both runs' results whose `outcome` differs, as "`<name>`: `<old>` → `<new>`", or `dashboard.compare.noFlips` when none. | AC-86 |
| R-WEB-52 | WHILE the Compare modal is open, `/evals/:agentId` shall hold `?compare=<olderId>,<newerId>` (set with `router.replace`), and remove it on close. | AC-87 |
| R-WEB-53 | WHEN `/evals/:agentId` renders with a `compare` parameter whose two ids are done runs of the agent, it shall select them and open the Compare modal once; any other value is ignored. | AC-88 |
| R-WEB-54 | WHILE the latest done run's precision (shown %) is below the previous done run's, `/evals/:agentId` shall render the regression banner `dashboard.regression` ("Precision dipped {n} pts on v{version}"). | AC-89 |
| R-WEB-55 | `/evals/:agentId` shall render a "Metric trend" card with a local line chart built on `recharts` (a client dependency; not the vendored `LineChart`) of recall, precision and citation over the done runs, oldest first, with a gap where a value is null and a point tooltip reading "v{version} · {cost}" (cost through `formatCostUsd`), the tooltip text produced by a pure label helper. | AC-90 |
| R-WEB-56 | Each `/evals` agent row with a done run shall render a `Sparkline` of `recall_trend`. | AC-91 |
| R-WEB-57 | WHILE a run of the agent has `status: 'running'`, the Evals tab shall render every case row's Delete `IconBtn` disabled, keeping its `aria-label`. | AC-98 |

## Route and data

| Data | Source | Hook (`src/lib/hooks/evals.ts`) |
|---|---|---|
| an agent's cases | `GET /agents/:id/eval-cases` → `EvalCaseList` | `useAgentEvalCases(agentId)`; key `["eval-cases", agentId]`; enabled when `agentId` is set |
| create a case | `POST /findings/:id/eval-case` → `EvalCaseCreateResponse` | `useCreateEvalCase(agentId)`; on success invalidates `["eval-cases", agentId]` |
| delete a case | `DELETE /eval-cases/:id` | `useDeleteEvalCase(agentId)`; on success invalidates `["eval-cases", agentId]` |
| an agent's runs | `GET /agents/:id/eval-runs?limit&offset` → `EvalSuiteRunList` | `useAgentEvalRuns(agentId, limit)`; key `["eval-runs", agentId, limit]`; `refetchInterval` 2,000 ms while a run is `running` |
| start a run | `POST /agents/:id/eval-runs` → `EvalSuiteRun` | `useStartEvalRun(agentId)`; on success invalidates `["eval-runs", agentId]` and `["eval-overview"]` |
| one run with results | `GET /eval-runs/:id` → `EvalSuiteRunDetail` | `useEvalRun(runId)`; key `["eval-run", runId]`; polls while `running` |
| the overview | `GET /evals/overview` → `EvalOverview` | `useEvalOverview()`; key `["eval-overview"]`; polls while an agent has `running: true` |
| reviews (agent id per finding) | existing `usePrReviews` → `ReviewRecord[]` | unchanged |

Routes: `/evals` and `/evals/:agentId` (new, pages thin); `/agents/:id?tab=evals` (existing page).
URL state: `tab` (existing), `compare` (R-WEB-52, R-WEB-53). Every text from a case, a run, a
finding or a prompt is rendered as text nodes — never through `Markdown`, `SafeMarkdown` or HTML.
Strings go through `next-intl`. Breadcrumbs: `/evals` — `page.crumbSkillsLab` › `page.crumbEvalDashboard`;
`/evals/:agentId` — the same › the agent's name.

## Placement

| Surface | Folder |
|---|---|
| FindingCard button, saved / in-set / error states | the existing `FindingCard/` (a sub-component if it grows), agent id threaded from `FindingsPanel` and `InlineFinding`'s parents |
| Evals tab (metric strip, cases, runs, delete modal) | `src/app/agents/_components/AgentEditor/_components/EvalsTab/` |
| Shared eval pieces (metric bar, delta label, run row, run drawer, Compare modal, word diff) | `src/components/eval/` (per the `frontend-ui-architecture` skill: shared by the Evals tab and the dashboard, so not inside either feature's `_components/`) |
| Overview page | `src/app/evals/page.tsx` + `src/app/evals/_components/EvalOverview/` |
| Agent view | `src/app/evals/[agentId]/page.tsx` + `_components/AgentEvalView/` |
| Sidebar item | `src/components/app-shell/nav.ts` |

`src/vendor/**` is not edited; where the vendored `MetricCard` prints its delta with `toFixed(2)`,
the agent view uses its own card with the numbers of "Layout".

## Layout

Design source: "DevDigest Design (standalone).html" from the task, decoded — artboards
`eval-dashboard` and `eval-compare` (`screen_skills.jsx`: `AgentEvalOverview`, `ScreenEval`,
`RunCompare`, `CompareMetric`, `MiniBar`), `agents-*` Evals tab (`screen_agents.jsx`: `EvalsTab`,
`EvalMetricStrip`; `EvalCaseRow`), PR detail (`findings.jsx`: `ActionRow`), `chrome.jsx` (`NAV`),
`MetricCard`. Colours: recall `var(--accent)`, precision `var(--ok)`, citation `var(--warn)`.

| Area | Values |
|---|---|
| Sidebar | Skills Lab: Skills, Agents, Conventions, **Eval Dashboard** (`Gauge`). |
| FindingCard action row | existing row (`flex`, gap 6, margin-top 12, wrap); the new ghost `sm` button with `FlaskConical` after Dismiss. Saved / in-set / error line under the row, 12 px, `var(--text-secondary)` (error `var(--crit)`), the link as `MonoLink`. **Departure:** the design opens the Case Editor; here one click creates the case (Case Editor is a non-goal). The design's Learn and Reply buttons are not added. |
| Page container (`/evals`, `/evals/:agentId`) | `padding: 20px 28px 40px`, `maxWidth: 980`, `margin: 0 auto`. |
| Overview header | row `flex`, `alignItems: flex-end`, margin-bottom 6; h1 22 px weight 700, letter-spacing −0.02em; subtitle 13 px `var(--text-secondary)`, margin-top 3 ("Regression harness across all reviewer agents · pick an agent to see its runs"). **Departure:** no "Run all agents" button (non-goal). |
| Overview "Agents" | `SectionLabel` icon `Cpu`; list column, gap 8, margin-top 8, margin-bottom 24. Row: a `<button>`, `flex`, `alignItems: center`, gap 16, padding `14px 16px`, radius 10, border 1 px `var(--border)`, background `var(--bg-elevated)`, full width, left-aligned; hover background `var(--bg-hover)`, border `var(--border-strong)`. Icon box 34 × 34, radius 8, `var(--accent-bg)`, `Cpu` 17 px `var(--accent)`. Name 14.5 px weight 700; model chip mono 10.5 px muted, padding `1px 6px`, radius 4, border 1 px; sub-line 11.5 px muted, margin-top 3. Sparkline 60 × 24 (P3). Mini metric: min-width 66, centred; label 9.5 px weight 700, letter-spacing 0.04em, uppercase, muted ("Recall", "Prec", "Cite"); value 18 px weight 700 in the metric colour, margin-top 2, "—" when null. `ChevronRight` 18 px muted. |
| Overview "Recent eval runs · all agents" | `SectionLabel` icon `History`; panel border 1 px, radius 8, `overflow: hidden`, `var(--bg-elevated)`, margin-top 8; rows `display: grid`, `gridTemplateColumns: 180px 150px 70px 1fr 1fr 1fr 80px`, gap 12, padding `10px 16px`, 1 px `var(--border)` between rows, 12.5 px, `alignItems: center`, pointer: agent name weight 600 (ellipsis), `started_at` mono 11.5 px secondary, version mono `var(--accent-text)`, three bars, `<passed>/<total>` weight 600. **Departure:** a running row shows "Running… k/N" in place of the bars; a failed row shows "failed". |
| Metric bar (`MiniBar`) | `flex`, gap 7; track flex 1, height 6, `var(--bg-hover)`, radius 3, fill in the metric colour at `value × 100%`; label mono 11 px secondary, width 30, right-aligned, "NN%" or "—". |
| Agent view back link | "All agents": `ChevronLeft` 16, `inline-flex`, gap 6, margin-bottom 12, padding `4px 8px 4px 4px`, radius 6, transparent, `var(--text-secondary)` 12.5 px weight 600. |
| Agent view header | row `flex`, `alignItems: flex-end`, margin-bottom 18; h1 22 px weight 700, −0.02em, with the model chip (mono 11.5 px weight 500 muted, padding `2px 7px`, radius 5, border 1 px), gap 10; subtitle 13 px secondary, margin-top 3: "Regression harness · N runs on M cases". Right, gap 8: agent `Dropdown` (width 220, right-aligned, trigger secondary `sm` `Cpu` + `ChevronDown`), run button primary `sm` `Play`. **Departure:** no "30 days" filter (non-goal). |
| Regression banner (P3) | `flex`, gap 10, `alignItems: center`, padding `11px 14px`, radius 8, border 1 px `var(--warn)`, `var(--warn-bg)`, margin-bottom 18; `AlertTriangle` 16 `var(--warn)`; text 13 px secondary with the lead phrase bold `var(--text-primary)`. |
| Metric cards | row `flex`, gap 14, margin-bottom 20; card flex 1, `var(--bg-elevated)`, border 1 px, radius 9, padding 16; label 11.5 px weight 600 muted, letter-spacing 0.03em; sparkline 56 × 20 at the right (P3); value 30 px weight 700, −0.02em, suffix "%" 16 px muted; delta 12 px weight 600 with `ArrowUp` / `ArrowDown` / `Slash` 12 px, `var(--ok)` / `var(--crit)` / muted. **Departure:** the delta reads "+12pt" / "−8pt" / "±0pt", not the design's `0.12`. |
| Trend card (P3) | `Card`, margin-bottom 20; header `flex`, gap 16, margin-bottom 12: `SectionLabel` `TrendingUp` "Metric trend", legend at the right (gap 14, 11.5 px, 10 × 2 swatches); a local `recharts` line chart, the card's full width (900 in the design), height 200, one line per metric in its colour, dots on the points, a gap at a null value, tooltip "v{version} · {cost}". **Departure:** the design's vendored `LineChart` has no tooltip or dots and draws null as 0, so a local chart replaces it (`src/vendor/**` is not edited). |
| Runs header | `flex`, gap 10, `alignItems: center`, margin-bottom 4: `SectionLabel` `History` "Recent runs"; hint 11.5 px muted ("Select two runs to compare" / "N selected"); Compare button at the right, `sm`, primary when two are selected, else ghost and disabled. **Departure:** icon `GitMerge` — the design's `GitCompare` is not in the vendored icon set. |
| Runs table | panel border 1 px, radius 8, `overflow: hidden`, `var(--bg-elevated)`, margin-top 8. Header row: `gridTemplateColumns: 34px 150px 70px 1fr 1fr 1fr 90px 80px`, gap 12, padding `9px 16px`, `var(--bg-surface)`, bottom border, 10.5 px weight 700, letter-spacing 0.05em, uppercase, muted: "", Ran at, Version, Recall, Precision, Citation, Pass, Cost. Rows: same grid, padding `10px 16px`, 12.5 px, `alignItems: center`, selected background `var(--bg-hover)`; checkbox 16 × 16, radius 4, border 1.5 px (`var(--accent)` on, `var(--border-strong)` off), filled `var(--accent)` with `Check` 11 px white when on; ran-at mono 11.5 secondary; version mono `var(--accent-text)`; pass weight 600; cost mono secondary through `formatCostUsd` ("$0.0040", "—" for null). "Show more" as a ghost `sm` button centred under the panel, margin-top 8. **Departures:** the checkbox alone toggles selection and the rest of the row opens the run drawer (the design toggles on any click); running and failed rows show their status in the three metric columns and a disabled checkbox; an errored count line under the pass cell. |
| Compare modal | `Modal` width 960; title "Compare runs · v<old> → v<new>"; subtitle "Old prompt vs new — metric deltas and prompt diff on N cases"; body padding `16px 18px`, `maxHeight: 560`, `overflow: auto`. Tiles row `flex`, gap 12, margin-bottom 18; tile flex 1, padding `12px 14px`, radius 9, border 1 px, `var(--bg-elevated)`; label 10 px weight 700, 0.05em, uppercase, muted, margin-bottom 8; old value 15 px muted; `ArrowRight` 13 muted; new value 21 px weight 700 in the metric colour (cost `var(--text-primary)`); delta 11.5 px weight 600, `var(--ok)` up / `var(--crit)` down, "▲ +Npt" / "▼ −Npt" / "±0pt"; the Cost tile's old and new values through `formatCostUsd` ("$0.0040" → "$0.0030", "—" for null) and its delta as a sign plus `formatCostUsd` of the magnitude ("−$0.0010"; none when either cost is null). Then the configuration block (when it differs), then `SectionLabel` `FileText` "System prompt diff", legend (`flex`, gap 14, 11.5 px secondary, margin `8px 0 10px`, swatches 11 × 11 radius 3 `var(--code-del)` "v<old> (old)" and `var(--code-add)` "v<new> (new)"), diff box mono 12.5 px, line-height 1.75, `var(--code-bg)`, border 1 px, radius 8, padding `14px 16px`, `white-space: pre-wrap`; added tokens on `var(--code-add)`, removed on `var(--code-del)` with line-through in `var(--crit)`, same tokens `var(--text-secondary)`. Then "Cases that changed result" (P3), 12.5 px rows. Footer: Close (ghost). **Departures:** the design shows the delta only when non-zero, here "±0pt" always (signed delta for every metric); no "Promote" button (non-goal); the configuration block and the flipped-cases list are added (G14, P2). |
| Run drawer (P2) | right-side panel, width 440, full height, `var(--bg-elevated)`, left border 1 px; header with run time, version and a close `IconBtn`; one block per result: outcome icon (`CheckCircle` `var(--ok)`, `XCircle` `var(--crit)`, `AlertTriangle` `var(--warn)` for errored), case name mono, kind pill, then findings as mono `file:start-end` + title, matching ones marked "matches", the dropped count, the error text. Not in the design. |
| Evals tab | inside the editor body (existing padding 28), `maxWidth: 720`. Header row `flex`, gap 10, margin-bottom 14: `SectionLabel` `Gauge` "Eval metrics", `MonoLink` "View full dashboard →" at the right. Metric strip `flex`, gap 10, margin-bottom 18; tile flex 1, padding `11px 13px`, radius 9, border 1 px, `var(--bg-elevated)`; label 10 px weight 700, 0.05em, uppercase, muted, margin-bottom 6; value 22 px weight 700 in the metric colour (the cases tile `var(--text-secondary)`, "k/N"); delta 11.5 px weight 600 "▲ +Npt". Scoring note 11.5 px muted, `flex`, gap 6, margin-bottom 20, `Code` 12: "Scoring is mechanical — a finding counts when file matches and line ranges overlap; must-find cases allow a 2-line tolerance either side. No model call in the scorer." Cases header `flex`, gap 10, margin-bottom 16: h2 16 px weight 700 "Eval cases", `Badge` "k / n passing" (`var(--ok)` on `var(--ok-bg)` when all pass, else `var(--warn)` on `var(--warn-bg)`), `Badge` muted "N cases", run button at the right (secondary `sm` `Play`). **Departure:** no "New eval case" button (Case Editor is a non-goal); the button reads "Run eval (N)" (P11) instead of "Run all evals"; the scoring note adds the must-find tolerance clause, which the design lacks. |
| Case row | `flex`, gap 11, `alignItems: center`, padding `10px 12px`, radius 7, border 1 px, `var(--bg-elevated)` (hover `var(--bg-hover)`), margin-bottom 6; outcome icon 15 px (`CheckCircle` ok, `XCircle` crit, `AlertTriangle` warn for errored, `Dot` muted never run); name mono 12.5 px weight 600; kind pill 10 px weight 700, 0.03em, padding `1px 7px`, radius 4, uppercase — must find `var(--accent-text)` on `var(--accent-bg)`, border `var(--accent)`; must not flag muted on `var(--bg-hover)`, border `var(--border-strong)`; sub-line 11.5 px muted, margin-top 2; at the right an expand toggle and the Delete `IconBtn` (size 26, danger), opacity 0.4 → 1 on hover or focus. **Departure:** no per-case Run or Edit icon (non-goal). The expanded fragment: `<pre>` mono 12 px, line-height 1.6, padding `10px 12px`, `var(--bg-surface)`, border 1 px, radius 6, `overflow-x: auto`, max-height 320 with scroll. |
| Evals tab "Runs" | below the cases, margin-top 24: `SectionLabel` `History` "Runs"; the runs table without the checkbox column (`150px 70px 1fr 1fr 1fr 90px 80px`) plus a status chip in the version cell; latest 20 with "Show more". Not in the design (the task asks for the run history on the tab). |

## Strings

- `messages/en/prReview.json` (namespace `prReview`), new under `finding`: `toEval` ("Turn into eval
  case"), `toEvalHint.accepted` ("Create a 'must find' eval case from this finding"),
  `toEvalHint.dismissed` ("Create a 'must NOT comment' eval case from this dismissal"),
  `toEvalOpen`, `toEvalNoAgent`, `evalSaved.must_find`, `evalSaved.must_not_flag`, `viewInEvals`,
  `inEvalSet`.
- `messages/en/eval.json` (namespace `eval`): kept — `dashboard.runEval`, `dashboard.running`,
  `dashboard.metrics.*`, `dashboard.legend.*`, `dashboard.table.*`, `dashboard.noRuns`,
  `evalsTab.metricsTitle`, `evalsTab.casesHeading`, `evalsTab.delete`, `page.*`. Changed —
  `evalsTab.emptyCases` (R-WEB-11). New — `dashboard.runningProgress`, `dashboard.lastRun`,
  `dashboard.noAgentRuns`, `dashboard.noAgents`, `dashboard.recentAll`, `dashboard.allAgents`,
  `dashboard.selectHint`, `dashboard.selected`, `dashboard.compare.*` (`title`, `subtitle`,
  `promptDiff`, `old`, `new`, `noChange`, `configuration`, `flipped`, `noFlips`, `close`),
  `dashboard.regression`, `dashboard.showMore`, `runs.errored`, `runs.failed`, `runs.status.<EvalSuiteRunStatus>`,
  `runs.outcome.<EvalCaseOutcome>`, `kind.<EvalExpectationKind>` ("must find", "must not flag"),
  `evalsTab.viewDashboard`, `evalsTab.scoringNote` ("Scoring is mechanical — a finding counts when file matches and line ranges overlap; must-find cases allow a 2-line tolerance either side. No model call in the scorer."), `evalsTab.deleteConfirm`, `evalsTab.passing`,
  `evalsTab.casesCount`, `evalsTab.runsHeading`, `evalsTab.noKey`.
  Keys that mirror an enum use its exact values (`kind.must_find`).

## Tests

| File | Covers |
|---|---|
| `FindingCard.test.tsx` (mocked hooks) | R-WEB-1, R-WEB-3–R-WEB-8: accepted, dismissed, open and no-agent cards; saved line and link; the no-diff error; pending; in-set mark |
| `FindingsPanel` / `InlineFinding` tests | R-WEB-2 (agent id passed from the review) |
| `EvalsTab.test.tsx` | R-WEB-9–R-WEB-27 and R-WEB-57 on the tab: tab key, rows with both kinds and every outcome, empty state, delete with confirm, Delete disabled while a run is `running`, expand, dashboard link, run start, runs list with running / errored / failed rows, metric strip with and without delta, polling with fake timers (`client/INSIGHTS.md` 2026-10-07 on polling hooks), the invalidations, the `eval_unavailable` and generic errors, drawer open / Esc |
| `nav` / app-shell test | R-WEB-28 |
| `EvalOverview.test.tsx` | R-WEB-29–R-WEB-31, R-WEB-41, R-WEB-42, R-WEB-56: agents with and without runs, a disabled agent, no agents, the recent feed, navigation |
| `AgentEvalView.test.tsx` | R-WEB-32–R-WEB-55: deltas incl. ±0, null metrics, fewer than two done runs, selection rules incl. a third pick and disabled rows, Compare tiles, word diff, configuration block, no-change text, flipped cases, `?compare=` write and read (valid, unknown, failed), banner, trend card present, "Show more", checkbox names, ellipsis titles, modal max height; costs in `formatCostUsd` form incl. the Cost tile delta (R-WEB-35, R-WEB-39) |
| word-diff helper test (in `src/components/eval/`) | R-WEB-36: insertions, deletions, identical prompts, whitespace kept |
| trend label helper test (pure, no chart render — jsdom gives `ResponsiveContainer` no size) | R-WEB-55: tooltip text "v{version} · {cost}", a null cost as "—", null metric values kept as gaps |
| shared eval component tests in `src/components/eval/` | R-WEB-26, R-WEB-35, R-WEB-49: metric bar, delta label, run row, run drawer, Compare modal pieces used by both surfaces |
| eval hooks test (`src/lib/hooks/evals.test.tsx`) | R-WEB-20, R-WEB-21: polling while `running`, the invalidations on completion |

Component tests mock `fetch`; AC-93 and AC-94 are an `e2e` flow over the seeded runs (server spec,
"Seeded eval data"), owned by `test-writer`. `scripts/verify-l06.sh` selects the client eval tests
by path substrings with no brackets — a vitest filter containing `[agentId]` or `[repoId]` matches
nothing: `app/evals/`, `EvalsTab`, `components/eval/`, `FindingCard`, `FindingsPanel`,
`InlineFinding`, `app-shell/nav`, `hooks/evals` (server spec, "Verification command"). Every eval
test above sits under a path one of these substrings matches. A UI phase also carries a manual
screenshot check of `/evals`, `/evals/:agentId` with Compare open and the Evals tab against
the design artboards (root `INSIGHTS.md`, 2026-10-17).

## Documentation

`README.md` — the UI route map gets `/evals`, `/evals/:agentId` (`?compare=`) and `?tab=evals`;
`docs/data-flow.md` — the eval query keys, the polling rule and the invalidations. Written by
`doc-writer`.

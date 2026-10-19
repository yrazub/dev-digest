> **Final `plan-verifier` report** for `specs/plans/L05-pr-brief.md` (third round, after fix phases 10
> and 11), copied as the agent returned it on 2026-10-18.
>
> **Closed after this report:** the six "not verifiable" items (P9.T1, P9.T4, P9.V2, P9.D, AC-83,
> AC-84) depended on the hermetic e2e run, which the agent was told not to start. It ran next, on
> the same HEAD: `cd e2e && npm run e2e:hermetic` → **14/14 flows passed**, flows 10 and 14
> included. No requirement is left open.
>
> **Added after this report (2026-10-19):** phase 12, the output-cap fix from a live run on PR #20
> (`output_truncated`), with its spec amendment (AC-52, EC-17, NFR-1, NFR-4, R-SRV-11, R-SRV-19,
> R-SRV-43). Its own verification ran green — server `typecheck` and `arch:check` clean, 970 unit and
> 205 integration tests passed. A fourth plan-verifier round on it was skipped at the user's request.

# Verification report: PR Why + Risk Brief (L05)

**Plan:** `specs/plans/L05-pr-brief.md` (branch `feature/l05-pr-brief`, HEAD `4a011de`) · **Requirements:** `specs/L05-pr-brief.md` (AC-1–AC-84), `server/specs/L05-pr-brief.md`, `client/specs/L05-pr-brief.md`, declared deviations in `.devdigest/sdd/L05-pr-brief/notes.txt`, earlier gaps in `verify-gaps.md`, `arch-review.md` / `arch-review-2.md`, `amendment.md`, `amendment-2.md` · **Base:** `origin/main` (merge-base `f4b7252d`) · **Verdict:** INCOMPLETE

**Items:** 296 — 290 satisfied · 0 partial · 0 not satisfied · 6 not verifiable

Every Verify command except one was re-run on the final tree, and all exited 0. The one not run is `npm run e2e:hermetic`: you told me not to run it, and it needs the stack. The 6 not-verifiable items all depend on it. No item failed. Every gap from the earlier rounds is closed: the P4.F3 full-map validation, M1, arch F1, F2 and F3, and round-2 F1.

## Plan items
| ID | Requirement (quoted) | Status | Method | Evidence |
|---|---|---|---|---|
| P1.F1 | "`server/src/vendor/shared/contracts/brief.ts` — Add `ReviewFocusItem` and change `PrBrief` exactly as in the server spec" | satisfied | inspection | `ReviewFocusItem` {file min1, line int min1, reason}; `PrBrief` {summary, intent/blast nullable, risks, review_focus, history}; `Risk` unchanged. Declared deviation phase 1: comments only |
| P1.F2 | "`review-api.ts` — Add `BriefInputKind`, `BriefInputStatus`, `BriefInputReason`, `BriefInput`, `PrBriefRecord`, `PrBriefResponse`" | satisfied | inspection | diff matches the server spec "Contracts" field for field; imports `PrBrief` from `./brief.js` |
| P1.F3 | "`client/src/vendor/shared/contracts/brief.ts` — byte-identical sync" | satisfied | command | `cmp` identical |
| P1.F4 | "`client/src/vendor/shared/contracts/review-api.ts` — byte-identical sync" | satisfied | command | `cmp` identical |
| P1.T1 | "Add `server/test/contracts-sync.test.ts`" | satisfied | test | `it.each(['brief.ts','review-api.ts'])` byte-identical; passed |
| P1.T2 | "`PrBrief` parses with `intent: null` and `blast: null`" | satisfied | test | `contracts.test.ts` "parses with intent: null and blast: null"; passed |
| P1.T3 | "`ReviewFocusItem` rejects `line: 0` and an empty `file`" | satisfied | test | "rejects line: 0", "rejects an empty file"; passed |
| P1.T4 | "`PrBriefRecord` parses a full record, and `.omit({ stale: true })` parses the stored form" | satisfied | test | two cases; passed |
| P1.T5 | "`BriefInputReason` holds all 17 values" | satisfied | test | "holds the 17 values of the spec"; passed |
| P1.T6 | "Expected to change: none." | satisfied | inspection | `contracts.test.ts` only gained lines (E1) |
| P1.V1 | `cd server && pnpm typecheck` | satisfied | command | exit 0 |
| P1.V2 | `cd server && pnpm arch:check` | satisfied | command | exit 0, no violations |
| P1.V3 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | satisfied | command | 963/963 |
| P1.V4 | `cd client && pnpm typecheck` | satisfied | command | exit 0 |
| P1.D | "AC-63 / R-SRV-22 — PrBrief holds summary and review_focus…; six brief contracts exist; contracts-sync passes" | satisfied | test | P1.F1–F4, P1.T1 |
| P2.F1 | "`_shared/text/plain-text.ts` (new) — moves `sanitizeText`, `SanitizeResult`, `capWords` and regex constants … with 'Scanning cost' note item 1. Pure" | satisfied | inspection | no imports; `INVISIBLE_RE` line byte-equal to base; note at `:65-68`. Declared deviations phase 2 (note split, capWords comment) |
| P2.F2 | "`intent/domain.ts` — removes those definitions, imports …, re-exports" | satisfied | inspection | `intent/domain.ts:12-18` |
| P2.F3 | "`container.ts` — lazy `get blast()` … `callerLimit: MAX_CALLERS_PER_SYMBOL`, doc comment" | satisfied | inspection | `container.ts` `get blast()` with `_blast ??=`; declared deviation (repoIntelLimits left) |
| P2.F4 | "`blast/routes.ts` — uses `container.blast`… unneeded imports go away" | satisfied | inspection | diff removes BlastRepository/BlastService/BlastSource |
| P2.F5 | "`project-context/ports.ts` — adds `workspaceAttachments` … `WorkspaceAgentAttachments`" | satisfied | inspection | `ports.ts:65-81` |
| P2.F6 | "`repository.ts` — implements `workspaceAttachments`: enabled agents by workspace, with the runAttachments skill query" | satisfied | inspection | per-agent `runAttachments` (declared deviation phase 2) |
| P2.F7 | "`project-context/domain.ts` — pure `mergeWorkspace(agents: readonly {…}[])`, structural, imports nothing from ./ports.js" | satisfied | inspection | imports only `@devdigest/shared`, `./constants.js` |
| P2.F8 | "`service.ts` — `forWorkspace` … same not_cloned/miss/empty handling … no run cap, no LLM" | satisfied | inspection | `forWorkspace` in `service.ts`; `attached` = merged paths (declared deviation) |
| P2.T1 | "two enabled agents attached out of name order come back in name order" | satisfied | test | `project-context-service.test.ts`; passed |
| P2.T2 | "a path attached to both agents appears once, at its first position" | satisfied | test | passed |
| P2.T3 | "a skill path follows its agent's own paths" | satisfied | test | passed |
| P2.T4 | "`notCloned: true` with every path skipped `not_cloned` when `clonePath` is null" | satisfied | test | passed |
| P2.T5 | "a missing file is skipped `not_found`" | satisfied | test | passed |
| P2.T6 | "no `over_cap` skip even when the documents exceed 16,000 tokens" | satisfied | test | "applies no run cap…"; passed |
| P2.T7 | "`mergeWorkspace` ordering and de-duplication" | satisfied | test | 6 cases in `project-context-domain.test.ts`; passed |
| P2.T8 | "`workspaceAttachments` on real Postgres: enabled agents only, disabled skill's paths left out, workspace-scoped" | satisfied | test | `project-context.it.test.ts` 4 cases; 29/29 passed |
| P2.T9 | "Expected to change: none. intent-*, blast-service, blast.it must pass unedited" | satisfied | command | `git diff` on these files is empty; all passed |
| P2.V1 | `pnpm typecheck` | satisfied | command | exit 0 |
| P2.V2 | `pnpm arch:check` | satisfied | command | exit 0 |
| P2.V3 | `vitest run --exclude '**/*.it.test.ts'` | satisfied | command | 963 passed |
| P2.V4 | `pnpm exec vitest run .it.test --no-file-parallelism` | satisfied | command | 24 files / 204 tests passed, none skipped |
| P2.D | "R-SRV-24 forWorkspace …; container.blast exists; arch:check no new violation or baseline entry" | satisfied | command | baseline `.dependency-cruiser-known-violations.json` unchanged against base |
| P3.F1 | "`brief/constants.ts` — the named constants…" | satisfied | inspection | all 11 constants with the stated values |
| P3.F2 | "`brief/domain.ts` — pure; exports 1–12" | satisfied | inspection | items 1–12 present; does not import `classify.js` (declared deviation phase 3); item 11 strips `./` (`domain.ts:474-479`) |
| P3.F3 | "`brief/prompt.ts` — `buildBriefMessages` two messages; fixed `BRIEF_FENCE_LABELS`; document path inside content" | satisfied | inspection | `LABEL` map with the 8 labels; `path: ${oneLine(doc.path)}` inside the fence |
| P3.T1 | "every hermetic case of the server spec Tests row for brief-domain.test.ts" | satisfied | test | `brief-domain.test.ts` has the parseNewSideRanges … capBrief suites; passed |
| P3.T2 | "`findLinkedIssueNumber` ignores `&#39;`, `foo#12`, `owner/repo#5`, URL, `#0`, takes first bare #N" | satisfied | test | `brief-domain.test.ts:106-121`; passed |
| P3.T3 | "a `+c,0` hunk produces no range, and a focus line in such a file is kept" | satisfied | test | `:61`, `:690`; passed |
| P3.T4 | "blast callers dropped and map degraded → `trimmed`/`over_budget` with `omitted`" | satisfied | test | `:442`; passed |
| P3.T5 | "nothing attached and not cloned → `spec_documents` `missing`/`none_attached`" | satisfied | test | `:519`, `:555`; passed |
| P3.T6 | "Use three or more items wherever a list is capped" | satisfied | inspection | 25 findings, 9/8 risks and focus items in the cap tests |
| P3.T7 | "brief-prompt.test.ts — the cases of the server spec Tests row" | satisfied | test | order, fences, no patch lines; passed |
| P3.T8 | "hostile path/text → one opening and one closing fence per section; source in BRIEF_FENCE_LABELS; path only on path: line" | satisfied | test | `brief-prompt.test.ts:226-268`; passed |
| P3.T9 | "Expected to change: none." | satisfied | inspection | new files only |
| P3.V1 | `pnpm typecheck` | satisfied | command | exit 0 |
| P3.V2 | `pnpm arch:check` | satisfied | command | exit 0 |
| P3.V3 | `vitest run --exclude …` | satisfied | command | 963 passed |
| P3.D | "AC-47–52, 54–59, 67–74, NFR-5 via validateDraft, recordInputs, buildBriefMessages, fitToBudget, findLinkedIssueNumber" | satisfied | test | P3.T1–T8 |
| P4.F1 | "`brief/ports.ts` — the store, source, model-choice and log ports … to match exactly" | satisfied | inspection | `BriefPull`, `BriefStore`, `BriefLog` match; structural ports `BriefIntentSource` (get only) etc. (declared deviation: names) |
| P4.F2 | "`brief/repository.ts` — … latestReviewFindings newest kind=review with run done; readBrief parses with omit; saveBrief upserts" | satisfied | inspection | `repository.ts` inner join `agentRuns.status = 'done'`, `onConflictDoUpdate` |
| P4.F3 | "`brief/service.ts` — get/generate, in-flight map, steps 1–10" | satisfied | inspection | `service.ts:112-322`; `reasoning: false` `:265`; abort `:279`; one done-line log in `finally` `:282-297`; full-map `blastFilesOf(blast)` `:273` |
| P4.F4 | "`brief/routes.ts` — builds BriefService from container; routes; BRIEF_RATE_LIMIT" | satisfied | inspection | `routes.ts:10-43` |
| P4.F5 | "`modules/index.ts` — imports ./brief/routes.js, adds brief" | satisfied | inspection | `index.ts:16`, `:46` |
| P4.T1 | "on success the → line carries R-SRV-20 fields, exactly one done ← line … real dropped counts; no fixture text" | satisfied | test | `brief-service.test.ts:315`, `:357`; passed |
| P4.T2 | "`callTimeoutMs: 20` never-resolving → ExternalServiceError, no save, one done line reason timeout; also model_failed and output_truncated" | satisfied | test | `:426`, `:438` it.each; passed |
| P4.T3 | "two concurrent generate calls → one model call, same result, same error" | satisfied | test | `:518`, `:537`; passed |
| P4.T4 | "ConfigError → brief_unavailable 400 naming provider, github never called" | satisfied | test | `:467`; passed |
| P4.T5 | "the intent port fake has only `get`" | satisfied | test | `:396`; passed |
| P4.T6 | "stale intent, degraded map with symbols, empty map recorded as in the table" | satisfied | test | `:563`, `:581`, `:598`; passed |
| P4.T7 | "`reasoning: false` and the R-SRV-19 parameters on the single request" | satisfied | test | `:376`; passed |
| P4.T8 | "brief.it.test.ts — every case of the server spec Tests row" | satisfied | test | 17 cases; 17/17 passed |
| P4.T9 | "GET after POST leaves a Proxy-wrapped LLM and GitHub mock uncalled" | satisfied | test | `brief.it.test.ts:48` Proxy, `:223`; passed |
| P4.T10 | "risk_brief override set by PUT /settings and undone in finally" | satisfied | test | `:256`, `finally` `:276`; passed |
| P4.T11 | "an unparseable row created by the test reads as null" | satisfied | test | `:457`; passed |
| P4.T12 | "a merged PR inserted by the test" | satisfied | test | `:473`; passed |
| P4.T13 | "findings selection: done/running/failed reviews → only done's non-dismissed findings" | satisfied | test | `:482`; passed |
| P4.T14 | "brief-rate-limit.test.ts — 10×422 then 429; 12 GETs all 422" | satisfied | test | 2/2 passed |
| P4.T15 | "Expected to change: none." | satisfied | inspection | new files only |
| P4.V1 | `pnpm typecheck` | satisfied | command | exit 0 |
| P4.V2 | `pnpm arch:check` | satisfied | command | exit 0 |
| P4.V3 | `vitest run --exclude …` | satisfied | command | 963 passed |
| P4.V4 | `vitest run .it.test --no-file-parallelism` | satisfied | command | 204 passed |
| P4.D | "AC-43–46, 53, 60–62, 64–66, 69, 73, 75–82 / R-SRV-1–5, 13, 19–21, 23, 27, 31, 33–40, 42" | satisfied | test | P4.T1–T14 passed |
| P5.F1 | "`seed.ts` — own block after the intent block, outside `if (!pr)`, onConflictDoNothing, satisfies Omit<PrBriefRecord,'stale'>, exact seeded values, header comment naming the fixture contract" | satisfied | inspection | `seed.ts:372-466`; values match the server spec "Seeded brief" |
| P5.T1 | "after seed twice: one row, parses, head_sha a1b2c3d4e5f6" | satisfied | test | `brief-seed.it.test.ts:66`; passed |
| P5.T2 | "a row changed by the test is unchanged after another seed" | satisfied | test | `:101`; passed |
| P5.T3 | "GET answers it stale false, mock LLM calls empty" | satisfied | test | `:81`; passed |
| P5.T4 | "Expected to change: none." | satisfied | inspection | new file |
| P5.V1 | `pnpm typecheck` | satisfied | command | exit 0 |
| P5.V2 | `pnpm arch:check` | satisfied | command | exit 0 |
| P5.V3 | `vitest run .it.test --no-file-parallelism` | satisfied | command | 204 passed |
| P5.V4 | `vitest run --exclude …` (phase line) | satisfied | command | 963 passed |
| P5.D | "R-SRV-41 — db:seed inserts once, never overwrites, GET serves it without a model call" | satisfied | test | P5.T1–T3 |
| P6.F1 | "`lib/hooks/brief.ts` — briefKeys, usePrBrief enabled !!prId, useGenerateBrief setQueryData only" | satisfied | inspection | `client/src/lib/hooks/brief.ts` |
| P6.F2 | "`messages/en/brief.json` — block.risks, unavailableHint changed; every Strings key plus Assumptions copy" | satisfied | inspection | every key and value from the client spec "Strings" and the plan Assumptions |
| P6.F3 | "`PrBriefSection/use-media-query.ts` — useSyncExternalStore, server false" | satisfied | inspection | file present at the colocated path |
| P6.F4 | "`PrBriefSection.tsx` — header, body by briefViewMode, errors, grid" | satisfied | inspection | grid also in error mode = declared deviation phase 6, which you accepted; private subcomponents declared |
| P6.F5 | "`PrBriefSection/index.ts` — re-export" | satisfied | inspection | present |
| P6.F6 | "`PrBriefSection/styles.ts` — Layout values; grid(narrow) complete object" | satisfied | inspection | values match the row; `grid(narrow)` returns a full object |
| P6.F7 | "`helpers.ts` — briefViewMode (data wins), inputsLine, shortSha, generateErrorKind" | satisfied | inspection | present |
| P6.F8 | "`IntentCard.tsx` — hideRiskTags, footer in every state under divider" | satisfied | inspection | footer outside the state ternary; rendered only when `footer != null` (declared deviation) |
| P6.F9 | "`IntentCard/styles.ts` — footer divider" | satisfied | inspection | `footerDivider` height 1, `var(--border)`, `16px 0` |
| P6.F10 | "`OverviewTab.tsx` — renders PrBriefSection then Description, no BlastRadiusCard, gains poll" | satisfied | inspection | diff |
| P6.F11 | "`page.tsx` — IntentCard only on findings; poll={reviewRunning}" | satisfied | inspection | `page.tsx:136`, `:147` |
| P6.T1 | "brief.test.tsx: GET only on mount; POST lands in key; new headSha refetches; no other invalidation" | satisfied | test | 7 cases; passed |
| P6.T2 | "use-media-query.test.ts with stubbed matchMedia" | satisfied | test | 3 cases; passed |
| P6.T3 | "helpers.test.ts: briefViewMode each combination incl. {data,isError}; inputsLine" | satisfied | test | passed |
| P6.T4 | "PrBriefSection.test.tsx covering R-WEB-1–6, 11–14, 17, 20–29, 31 …" | satisfied | test | 19 cases in the main describe; passed |
| P6.T5 | "IntentCard.test.tsx: hideRiskTags; footer in record, empty, error, loading" | satisfied | test | 3 added cases; passed |
| P6.T6 | "Expected to change OverviewTab.test.tsx — mock ../PrBriefSection, props, before Description, absent while prId null" | satisfied | test | E8; passed |
| P6.V1 | `cd client && pnpm typecheck` | satisfied | command | exit 0 |
| P6.V2 | `cd client && pnpm test` | satisfied | command | 538 passed |
| P6.D | "AC-1–6, 11–18, 20–29, 31" | satisfied | test | P6.T1–T6 |
| P7.F1 | "`RiskAreas.tsx` — SectionLabel block.risks, kind icon by severity, title, refs as mono text, noRisks" | satisfied | inspection | present |
| P7.F2 | "`RiskAreas/index.ts`" | satisfied | inspection | present |
| P7.F3 | "`RiskAreas/styles.ts` — Risk entries values" | satisfied | inspection | padding `5px 9px`, radius 7 |
| P7.F4 | "`ReviewFocus.tsx` — panel, Badge, button rows with aria-label/title, ▸, elidePath, empty, onOpen" | satisfied | inspection | present; active-row state is a declared deviation |
| P7.F5 | "`ReviewFocus/index.ts`" | satisfied | inspection | present |
| P7.F6 | "`ReviewFocus/styles.ts` — padding 14px 16px, row(active) complete object" | satisfied | inspection | present |
| P7.F7 | "`constants.ts` — RISK_KIND_ICON, SEVERITY_COLOR" | satisfied | inspection | present; PATH_* consts are a declared deviation |
| P7.F8 | "`helpers.ts` — elidePath 56 / 20 + … + 35" | satisfied | inspection | present |
| P7.F9 | "`PrBriefSection.tsx` — RiskAreas as IntentCard footer; ReviewFocus below grid above footer; onOpenFocus prop" | satisfied | inspection | present |
| P7.F10 | "`OverviewTab.tsx` — passes onOpenFocus" | satisfied | inspection | present |
| P7.F11 | "`_lib/use-pr-detail-nav.ts` — focusSearch, tabSearch, usePrDetailNav (replace/push)" | satisfied | inspection | present |
| P7.F12 | "`page.tsx` — usePrDetailNav for tab, setTab, setParam, openFocus" | satisfied | inspection | `page.tsx:66`, `:130-131`, `:148`, `:164`, `:189` |
| P7.T1 | "PrBriefSection.test: R-WEB-7–10, 19, 20, 30, 3+ items, text not markup, click calls onOpenFocus" | satisfied | test | Risk areas and Review focus describes, 10 cases; passed |
| P7.T2 | "helpers.test: elidePath at 56, 57 and 70" | satisfied | test | passed |
| P7.T3 | "focusSearch keeps order, trace, blast and encodes the path" | satisfied | test | passed |
| P7.T4 | "openFocus calls router.push" | satisfied | test | passed |
| P7.T5 | "setTab calls router.replace without file and line" | satisfied | test | passed |
| P7.T6 | "Expected to change: none." | satisfied | inspection | declared deviation phase 7: the required `onOpenFocus` prop changed `OverviewTab.test.tsx` (already listed in phase 6) and the new `PrBriefSection.test.tsx` |
| P7.V1 | `pnpm typecheck` | satisfied | command | exit 0 |
| P7.V2 | `pnpm test` | satisfied | command | 538 passed |
| P7.D | "AC-7–10, 19, 20, 30, 35, 36, 41" | satisfied | test | P7.T1–T5 |
| P8.F1 | "`DiffTab/helpers.ts` — jumpTarget; null for unknown path; line int ≥1 else null" | satisfied | inspection | a bad line gives `line: null` (your decision of 2026-10-18; the return type allows a null line) |
| P8.F2 | "`DiffTab.tsx` — file/line from URL, jumpTarget, useState jumped key set by onJumped, pending derived; passes to RoleGroup and both DiffViewers" | satisfied | inspection | `DiffTab.tsx:52-63`, `:181-210` |
| P8.F3 | "`RoleGroup.tsx` — initial open `!startsCollapsed || files.some(path === target?.path)`; passes on" | satisfied | inspection | diff |
| P8.F4 | "`DiffViewer.tsx` — target, onJumped, jump={{line,pending}}" | satisfied | inspection | diff (pending inside target = declared deviation) |
| P8.F5 | "`FileCard.tsx` — open when jump; data-jump-target=file; accent; one effect scroll/pulse 1,700 ms then onJumped" | satisfied | inspection | diff; sticky offset in margins = declared deviation |
| P8.F6 | "`CodeLine.tsx` — jumpMark, ref, data-jump-target=line, pulse background" | satisfied | inspection | ref as React 19 prop (declared deviation) |
| P8.F7 | "`diff-viewer/styles.ts` — fileCard(isTarget) complete object; scroll margins; linePulse" | satisfied | inspection | `fileCardFor` (declared rename), `jumpHeader`, `jumpLine`, `linePulse` |
| P8.T1 | "a target in the collapsed Boilerplate group opens the group and the card" | satisfied | test | passed |
| P8.T2 | "a large collapsed card opens" | satisfied | test | passed |
| P8.T3 | "line inside the hunk scrolls and marks; mark gone after 1,700 ms while data-jump-target=line stays" | satisfied | test | passed |
| P8.T4 | "line outside the hunk and file without patch scroll the header and mark nothing" | satisfied | test | 2 cases; passed |
| P8.T5 | "a file not in pr.files: no scroll, no mark, no message" | satisfied | test | passed |
| P8.T6 | "both order=original and smart order" | satisfied | test | 2 cases; passed |
| P8.T7 | "a re-render with the same URL does not scroll again" | satisfied | test | passed |
| P8.T8 | "jumpTarget for unknown path, line=abc, line=0, valid pair" | satisfied | test | `DiffTab/helpers.test.ts` (`"abc"`, `"0"` rows); passed |
| P8.T9 | "Expected to change: none. existing DiffTab and FileCard cases unedited" | satisfied | inspection | E5: only one import line widened (`act`) |
| P8.V1 | `pnpm typecheck` | satisfied | command | exit 0 |
| P8.V2 | `pnpm test` | satisfied | command | 538 passed |
| P8.D | "AC-32–34, 37–40, 42" | satisfied | test | P8.T1–T8 |
| P9.F1 | "Nothing — test-writer only" | satisfied | inspection | phase 9 commit `ff01044` touches only `e2e/specs/**` |
| P9.T1 | "Add `e2e/specs/14-pr-brief.flow.json` … (steps listed)" | not verifiable | inspection | file has every listed step; the flow was not run (hermetic e2e excluded) |
| P9.T2 | "Add the flow's row to `e2e/specs/README.md`" | satisfied | inspection | row added |
| P9.T3 | "Add section 'PR #482 has a seeded brief' to seed-fixtures.md …; amend the intent section" | satisfied | inspection | both edits present; strings match `seed.ts` |
| P9.T4 | "Expected to change flow 10: risk-area step moves after Agent runs; Overview asserts absence; description updated" | not verifiable | inspection | edit matches (E9); the flow was not run |
| P9.T5 | "Flows 05 and 11 stay unchanged" | satisfied | command | not in `git diff --name-status` |
| P9.V1 | `cd e2e && npm run typecheck` | satisfied | command | exit 0 |
| P9.V2 | `cd e2e && npm run e2e:hermetic` | not verifiable | — | not run (your instruction; needs the stopped stack or a separate worktree) |
| P9.D | "AC-83, AC-84, AC-15 — flows 14 and 10 pass, every hermetic flow passes" | not verifiable | — | needs P9.V2 |
| P10.F1 | "`project-context/domain.ts` — removes ./ports.js import; structural param" | satisfied | inspection | imports only shared and constants |
| P10.F2 | "`brief/domain.ts` — adds trimsOf, callerLines, sentBlast, blastFilesOf, diffTotals (structural pull)" | satisfied | inspection | `domain.ts:306-363`; no `./ports.js` import |
| P10.F3 | "`brief/service.ts` — deletes private copies, imports the five, blastFilesOf(blast) full map, record.blast stays sentBlast, comment says full blast map" | satisfied | inspection | `service.ts:25-44`, `:180`, `:270-274`, `:303` |
| P10.F4 | "`seed.ts` — comment 'flows 05, 10 and 11' → 'flow 14'" | satisfied | inspection | `seed.ts:376-378` names only flow 14 |
| P10.F5 | "`_lib/use-pr-detail-nav.ts` (new) — moved unchanged" | satisfied | command | `366a302` rename, 0 lines changed |
| P10.F6 | "`client/src/lib/use-pr-detail-nav.ts` (deleted)" | satisfied | command | `client/src/lib/use-*.ts` matches nothing |
| P10.F7 | "`page.tsx` — imports from ./_lib/use-pr-detail-nav" | satisfied | inspection | `page.tsx:32` |
| P10.F8 | "`PrBriefSection/use-media-query.ts` (new) — moved unchanged" | satisfied | command | rename, 0 lines changed |
| P10.F9 | "`client/src/lib/use-media-query.ts` (deleted)" | satisfied | command | absent |
| P10.F10 | "`PrBriefSection.tsx` — imports ./use-media-query" | satisfied | inspection | `PrBriefSection.tsx:18` (declared: import order) |
| P10.T1 | "trimsOf: identical; counts; issueBodyCut only; issueDropped only; descriptionCut" | satisfied | test | `brief-domain.test.ts:743-826`; passed |
| P10.T2 | "callerLines flattens in order over 3+ symbols" | satisfied | test | passed |
| P10.T3 | "sentBlast: 0 omitted; last k across entries; symbols/summary unchanged; ≥ total empties" | satisfied | test | 4 cases; passed |
| P10.T4 | "blastFilesOf: null → empty; union each once" | satisfied | test | 2 cases; passed |
| P10.T5 | "diffTotals: non-zero as given; all-zero summed; one non-zero uses PR's" | satisfied | test | 3 cases; passed |
| P10.T6 | "P4.F3 pin: far caller risk kept, dropped.risks 0, blast_radius trimmed with omitted ≥1, saved blast lacks the caller" | satisfied | test | `brief-service.test.ts:761`; passed |
| P10.T7 | "a risk citing a file in neither PR nor map is still dropped (dropped.risks 1)" | satisfied | test | `:778`; passed |
| P10.T8 | "Move use-pr-detail-nav.test.ts to _lib/" | satisfied | command | rename, cases unchanged; passed |
| P10.T9 | "Move use-media-query.test.ts to PrBriefSection/" | satisfied | command | rename, cases unchanged; passed |
| P10.T10 | "Expected to change: only the two moved tests; every other test unedited" | satisfied | command | `366a302` changes only the brief tests listed in P10.T1–T7 plus the two renames |
| P10.V1 | `cd server && pnpm typecheck` | satisfied | command | exit 0 |
| P10.V2 | `cd server && pnpm arch:check` | satisfied | command | exit 0 |
| P10.V3 | server `vitest run --exclude …` | satisfied | command | 963 passed |
| P10.V4 | server `vitest run .it.test --no-file-parallelism` | satisfied | command | 204 passed |
| P10.V5 | `cd client && pnpm typecheck` | satisfied | command | exit 0 (fully clean) |
| P10.V6 | `cd client && pnpm test` | satisfied | command | 538 passed |
| P10.D | "P4.F3; F1; F3; F2; M1; arch:check no new violation" | satisfied | test | P10.F1–F10, P10.T1–T9, baseline unchanged |
| P11.F1 | "`DiffTab.tsx` — useState jumpedKey; handleJumped useCallback [jumpKey] → setJumpedKey, no router; target pending computed in render; comment; no useRef, no new useEffect" | satisfied | inspection | `DiffTab.tsx:55-63`; grep finds no `useRef`/`useEffect`; the only `router.` is the order switch at `:47` |
| P11.T1 | "does not scroll again when the group holding the target is collapsed and reopened" | satisfied | test | `DiffTab.test.tsx` new case; passed |
| P11.T2 | "Expected to change: none. existing cases pass unedited" | satisfied | command | `4a011de` test diff has 0 removed lines |
| P11.V1 | `cd client && pnpm typecheck` | satisfied | command | exit 0 |
| P11.V2 | `cd client && pnpm test` (run under `perl -e 'alarm 400; exec @ARGV'`) | satisfied | command | 538 passed, no hang |
| P11.D | "F1/AC-40 no useRef …; phase 8 cases unedited; use-pr-detail-nav.test unedited; handleJumped no router call" | satisfied | test | P11.F1, P11.T1–T2 |

## Existing tests changed
| ID | Test | Change | Expectation, old → new | Plan or spec item (quoted) | Status |
|---|---|---|---|---|---|
| E1 | `server/test/contracts.test.ts` | extended (+144, 0 removed) | none changed | phase 1: "Extend `server/test/contracts.test.ts`" | satisfied |
| E2 | `server/test/project-context-domain.test.ts` | extended; header comment line reworded | none changed | phase 2: "Extend … `mergeWorkspace` ordering and de-duplication" | satisfied |
| E3 | `server/test/project-context-service.test.ts` | extended; header comment line reworded | none changed | phase 2: "Extend … `forWorkspace`" | satisfied |
| E4 | `server/test/project-context.it.test.ts` | extended (+100, 0 removed) | none changed | phase 2: "Extend … `workspaceAttachments` on real Postgres" | satisfied |
| E5 | `client/…/DiffTab/DiffTab.test.tsx` | extended; import line adds `act` | none changed | phase 8: "Extend `…/DiffTab/DiffTab.test.tsx`"; phase 11: "Extend …" | satisfied |
| E6 | `client/…/DiffTab/helpers.test.ts` | extended (+27, 0 removed) | none changed | phase 8: "Extend `…/DiffTab/helpers.test.ts`: `jumpTarget`" | satisfied |
| E7 | `client/…/IntentCard/IntentCard.test.tsx` | `renderCard` takes optional props; 3 cases added | none changed | phase 6: "Extend `…/IntentCard/IntentCard.test.tsx`" | satisfied |
| E8 | `client/…/OverviewTab/OverviewTab.test.tsx` | both cases rewritten | BlastRadiusCard mock and props → PrBriefSection mock with prId, headSha, repoId, repoFullName, poll, onOpenFocus | phase 6: "Expected to change … they now mock `../PrBriefSection` and assert …"; phase 7 onOpenFocus = declared deviation | satisfied |
| E9 | `e2e/specs/10-pr-intent.flow.json` | step moved, absence wait added, description | Overview `wait --text Auth surface touched` → `wait --fn !…includes(…)`; tag asserted on Agent runs | phase 9: "Expected to change `e2e/specs/10-pr-intent.flow.json` …" (AC-15, AC-16) | satisfied |

## Requirement items
| ID | Requirement (quoted) | Source | Status | Method | Evidence |
|---|---|---|---|---|---|
| R1 | "AC-1 The Overview tab shall show a section headed 'PR Brief'." | `specs/L05-pr-brief.md:89` | satisfied | test | PrBriefSection tests; `OverviewTab.tsx` |
| R2 | "AC-2 WHILE no stored brief … 'Brief not available yet.' and a 'Generate brief' button" | `:90` | satisfied | test | "shows the empty card…" |
| R3 | "AC-3 WHILE no stored brief … Intent block and Blast radius block" | `:91` | satisfied | test | same case |
| R4 | "AC-4 WHEN the user presses 'Generate brief' … show the brief … without a page reload" | `:92` | satisfied | test | `brief.test.tsx` setQueryData; empty-card case |
| R5 | "AC-5 … summary as text above the Intent and Blast radius blocks" | `:93` | satisfied | test | "renders the summary as text above a two-column grid" |
| R6 | "AC-6 … side by side in two columns" | `:94` | satisfied | test | same; `s.grid(false)` = `1fr 1fr` |
| R7 | "AC-7 … 'Risk areas' block in the Intent column … titles and file references as plain text" | `:95` | satisfied | test | Risk areas describe |
| R8 | "AC-8 … 'Review focus — read these first' … `<file>:<line> — <reason>` in stored order" | `:96` | satisfied | test | Review focus describe |
| R9 | "AC-9 IF no risks … 'No notable risks flagged.'" | `:97` | satisfied | test | "shows the no-risks text" |
| R10 | "AC-10 IF no review-focus items … 'No review focus items.'" | `:98` | satisfied | test | "shows the empty text and a zero count" |
| R11 | "AC-11 … names each missing input with its reason" | `:99` | satisfied | test | "names every missing input with its reason" |
| R12 | "AC-12 … name that input as trimmed in the same line" | `:100` | satisfied | test | "names the trimmed inputs…" |
| R13 | "AC-13 … how many risks and how many review-focus items were dropped" | `:101` | satisfied | test | footer dropped-line case |
| R14 | "AC-14 … footer with model, cost, time since generated, input tokens of 8,000" | `:102` | satisfied | test | footer cases |
| R15 | "AC-15 The Intent block on the Overview tab shall not show the intent's risk-area tags." | `:103` | satisfied | test | `hideRiskTags` passed by PrBriefSection; IntentCard test |
| R16 | "AC-16 The Intent card on the Agent runs tab shall show the risk-area tags as before" | `:104` | satisfied | test | `page.tsx:136` without `hideRiskTags`; IntentCard default case |
| R17 | "AC-17 WHILE narrower than 900 px … Intent column above Blast radius" | `:105` | satisfied | test | "stacks the grid in one column, Intent card first" |
| R18 | "AC-18 … Description section below the PR Brief section" | `:106` | satisfied | test | OverviewTab test |
| R19 | "AC-19 … path longer than 56 … head and tail around '…' … full `<file>:<line>` tooltip" | `:107` | satisfied | test | 56/57/70/40 cases |
| R20 | "AC-20 … every user-facing label from the client's localized `brief` strings" | `:108` | satisfied | inspection | every string in PrBriefSection, RiskAreas and ReviewFocus goes through `t(...)` |
| R21 | "AC-21 WHEN the user reloads … show that brief without requesting a new one" | `:109` | satisfied | test | "sends one GET on mount and no POST" |
| R22 | "AC-22 WHEN the user presses Regenerate in the header … request a new brief and show it" | `:110` | satisfied | test | "regenerates from the labelled icon button" |
| R23 | "AC-23 WHILE in flight … control disabled with 'Generating…'" | `:111` | satisfied | test | 2 cases |
| R24 | "AC-24 WHILE generating … keep showing the previous brief" | `:112` | satisfied | test | "keeps the cached brief while generating" |
| R25 | "AC-25 IF loading fails … error text with Retry, no 'Generate brief'" | `:113` | satisfied | test | "shows a load failure with a Retry…" |
| R26 | "AC-26 IF no API key … message that names the provider and links to Settings" | `:114` | satisfied | test | "explains a missing key… link to Settings"; the server message names the provider |
| R27 | "AC-27 IF generation fails otherwise … error text, keep previous brief" | `:115` | satisfied | test | "shows any other generate error…" |
| R28 | "AC-28 WHILE stale … 'Generated for `<short SHA>`; the PR has newer commits' with Regenerate" | `:116` | satisfied | test | "marks a stale brief…" |
| R29 | "AC-29 … request a new brief only on Generate brief or Regenerate" | `:117` | satisfied | test | hook GET-only and mutate-only cases |
| R30 | "AC-30 … each Review focus item a button named 'Open `<file>:<line>` in Files changed'" | `:118` | satisfied | test | "named buttons" case |
| R31 | "AC-31 … Regenerate button accessible name 'Regenerate brief'" | `:119` | satisfied | test | Regenerate case |
| R32 | "AC-32 WHEN the user clicks a Review focus item … Files changed tab with that file open and scrolled into view" | `:120` | satisfied | test | `onOpenFocus` + `openFocus` push + DiffTab jump cases |
| R33 | "AC-33 … scroll that line into view" | `:121` | satisfied | test | DiffTab line case |
| R34 | "AC-34 … mark that line and remove the mark within 2,000 ms" | `:122` | satisfied | test | pulse ends at 1,700 ms |
| R35 | "AC-35 … `tab=diff`, `file=<path>`, `line=<n>` in its URL" | `:123` | satisfied | test | focusSearch case |
| R36 | "AC-36 … add a browser-history entry" | `:124` | satisfied | test | openFocus → `router.push` |
| R37 | "AC-37 … expand the group and the card" | `:125` | satisfied | test | Boilerplate and large-card cases |
| R38 | "AC-38 IF the line is not shown … scroll to the file and mark no line" | `:126` | satisfied | test | 3 header cases |
| R39 | "AC-39 IF the file is not in the diff … no scroll, no error" | `:127` | satisfied | test | not-in-PR case |
| R40 | "AC-40 WHEN the page loads with tab=diff, file, line … perform the jump once" | `:128` | satisfied | test | same-URL and collapse/reopen cases |
| R41 | "AC-41 WHEN the user changes tab by hand … remove `file` and `line`" | `:129` | satisfied | test | setTab case |
| R42 | "AC-42 … jump in both Smart and Original order" | `:130` | satisfied | test | 2 order cases |
| R43 | "AC-43 POST … 200 with summary, risks, review-focus" | `:131` | satisfied | test | `brief.it.test.ts:182` |
| R44 | "AC-44 … store with head SHA, replacing any earlier brief" | `:132` | satisfied | test | `:182`, `:241`; upsert |
| R45 | "AC-45 GET … that brief without calling the model" | `:133` | satisfied | test | `:223` Proxy |
| R46 | "AC-46 WHILE no stored brief, GET … 200 brief: null" | `:134` | satisfied | test | `:173` |
| R47 | "AC-47 … keep only risk refs to a changed file or a file of its blast-radius map" | `:135` | satisfied | test | `validateDraft` tests; full-map pin `brief-service.test.ts:761` |
| R48 | "AC-48 IF a risk has no file reference left … drop the risk" | `:136` | satisfied | test | domain + `:778` |
| R49 | "AC-49 … keep only focus items whose file is a changed file" | `:137` | satisfied | test | domain focus cases |
| R50 | "AC-50 IF a focus line lies outside every new-side hunk … move to the start of the nearest" | `:138` | satisfied | test | `it.each` nearest/tie |
| R51 | "AC-51 … record dropped counts" | `:139` | satisfied | test | domain + service `:315` |
| R52 | "AC-52 … at most 6 risks, 6 focus items, summary ≤600 characters" | `:140` | satisfied | test | capBrief cases |
| R53 | "AC-53 WHEN no intent, no blast map, or neither … still generate" | `:141` | satisfied | test | service `:571`, `:598`; it `:284`, `:316` |
| R54 | "AC-54 … for each of the six inputs, used/trimmed/missing with reason" | `:142` | satisfied | test | recordInputs suite |
| R55 | "AC-55 … model input from title, intent, blast, totals, files, description, issue, documents, ≤20 findings of the latest completed review" | `:143` | satisfied | test | prompt order case; it `:482` |
| R56 | "AC-56 … no added, removed or context line of any diff hunk" | `:144` | satisfied | test | prompt `:198`; it `:360` |
| R57 | "AC-57 … model input ≤ 8,000 tokens, cl100k_base over all messages" | `:145` | satisfied | test | fitToBudget; service `:680` |
| R58 | "AC-58 … trim order: documents, findings, issue body, issue, description, callers, files" | `:146` | satisfied | test | fitToBudget suite |
| R59 | "AC-59 … never trim the title, the intent or the diff totals" | `:147` | satisfied | test | `brief-domain.test.ts:336` |
| R60 | "AC-60 … exactly one structured call, at most one repair attempt" | `:148` | satisfied | test | service `:376`; it `:182` |
| R61 | "AC-61 … one log line before and one after … no PR text or model output" | `:149` | satisfied | test | service `:315`, `:357`, failure cases |
| R62 | "AC-62 … provider and model set for risk_brief, or the registry default" | `:150` | satisfied | test | it `:256` |
| R63 | "AC-63 PrBrief holds summary and review_focus {file,line,reason}, identical in both copies" | `:151` | satisfied | test | contracts + sync tests |
| R64 | "AC-64 IF the answer does not match the schema after one repair … 502, stored brief unchanged" | `:152` | satisfied | test | it `:409`; service `:457` |
| R65 | "AC-65 … head SHA differs → stale: true" | `:153` | satisfied | test | it `:241`; service `:829` |
| R66 | "AC-66 … spec documents from the union over enabled agents and their enabled linked skills, name order, each path once" | `:154` | satisfied | test | forWorkspace + it tests |
| R67 | "AC-67 IF no document attached … missing none_attached" | `:155` | satisfied | test | recordInputs `:513` |
| R68 | "AC-68 IF no clone … missing not_cloned" | `:156` | satisfied | test | `:525` |
| R69 | "AC-69 … not derive an intent while generating" | `:157` | satisfied | test | service `:396`; it `:284` |
| R70 | "AC-70 IF intent stale … use it, reason stale" | `:158` | satisfied | test | `:392`; service `:563` |
| R71 | "AC-71 IF degraded and holds symbols … use it with the degraded reason" | `:159` | satisfied | test | `:412`; service `:581` |
| R72 | "AC-72 IF no symbol … missing with the map's reason, or no_data" | `:160` | satisfied | test | `:418`, `:424` |
| R73 | "AC-73 … linked issue as the first same-repository #N" | `:161` | satisfied | test | service `:618`; it `:335` |
| R74 | "AC-74 IF no issue referenced or unreadable … missing with the reason" | `:162` | satisfied | test | `it.each` 4 reasons; service `:636` |
| R75 | "AC-75 IF no API key … 400 brief_unavailable naming the provider" | `:163` | satisfied | test | it `:397`; service `:467` |
| R76 | "AC-76 IF the call fails or takes longer than 60 s … 502, stored brief unchanged" | `:164` | satisfied | test | service `:426`, `:438`; it `:409` |
| R77 | "AC-77 IF no stored changed files … 422" | `:165` | satisfied | test | it `:383` |
| R78 | "AC-78 IF the PR is not in the workspace … GET and POST 404" | `:166` | satisfied | test | it `:372` |
| R79 | "AC-79 WHILE in flight … second POST same result, no second model call" | `:167` | satisfied | test | it `:436`; service `:518` |
| R80 | "AC-80 IF more than 10 POSTs a minute … 429" | `:168` | satisfied | test | `brief-rate-limit.test.ts` |
| R81 | "AC-81 IF stored brief does not parse … brief: null" | `:169` | satisfied | test | it `:457`; service `:838` |
| R82 | "AC-82 … any status: open, closed or merged" | `:170` | satisfied | test | it `:473` |
| R83 | "AC-83 WHEN the user of the seeded stack opens the Overview of PR #482 … seeded brief without a model call" | `:171` | not verifiable | — | flow 14 not run. The data side is satisfied by `brief-seed.it.test.ts`, which passed |
| R84 | "AC-84 WHEN the user clicks the `src/config.ts:12` focus item … Files changed with src/config.ts open and line 12 marked" | `:172` | not verifiable | — | flow 14 not run. The unit side is satisfied by the DiffTab and nav tests |

### Constraints
| ID | Requirement (quoted) | Status | Method | Evidence |
|---|---|---|---|---|
| C1 | "Do not touch `server/src/db/migrations/**`" | satisfied | command | not in diff |
| C2 | "Every lock file; no new dependency" | satisfied | command | no lock file or `package.json` in diff |
| C3 | "`client/src/vendor/**`, except the two synced contract copies" | satisfied | command | only `contracts/brief.ts` and `contracts/review-api.ts` |
| C4 | "`server/package.json` (skip-worktree)" | satisfied | command | not in diff |
| C5 | "`.github/workflows/**`" | satisfied | command | not in diff |
| C6 | "Every `CLAUDE.md`, `README.md` and `docs/**` … except `e2e/specs/README.md` and `seed-fixtures.md`" | satisfied | command | no phase commit touches one. The index rows in `specs/README.md`, `server/specs/README.md` and `client/specs/README.md` come from the spec and plan commits `4eb1c7a` and `1188f53`, before phase 1 |
| C7 | "Out of scope: deferred AC-85–AC-89, R-WEB-43–47" | satisfied | inspection | none built: no verdict banner, risk expand or click, "File not in this PR's diff" message, or skeleton |
| C8 | "Out of scope: Documentation (README API/UI maps, server/docs/schema.md, brief/README.md, client/docs/data-flow.md)" | satisfied | command | none in diff |
| C9 | "Out of scope: course delivery items and `INSIGHTS.md` entries; the main session handles them" | satisfied | command | the INSIGHTS changes are main-session commit `17cbfb0` (planning) |
| C10 | "Out of scope: any `.github/workflows/**` change incl. the path filter (Q13)" | satisfied | command | not in diff |
| C11 | "Out of scope: `PrBrief.history` (always empty), MCP tool, automatic generation, Regenerate confirmation" | satisfied | inspection | `history: { history: [] }` hard-coded; no `mcp/` change; GET-only on mount; no confirm |
| C12 | "Out of scope: syncing other drifted files of `client/src/vendor/shared`" | satisfied | command | only the two files |
| C13 | "Out of scope: refactoring intent beyond the move …, blast beyond container.blast" | satisfied | command | the intent diff is only the move and re-export; the blast diff is only `routes.ts` |

## Commands re-run
| Command | Exit | Result line | Items it covers |
|---|---|---|---|
| `cd server && pnpm typecheck` | 0 | `tsc --noEmit -p tsconfig.json` (no errors) | P1.V1, P2.V1, P3.V1, P4.V1, P5.V1, P10.V1 |
| `cd server && pnpm arch:check` | 0 | `✔ no dependency violations found (213 modules, 719 dependencies cruised)` · `26 known violations ignored` (baseline file unchanged against base) | P1.V2, P2.V2, P3.V2, P4.V2, P5.V2, P10.V2 |
| `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | 0 | `Test Files 43 passed (43)` · `Tests 963 passed (963)` | P1.V3, P2.V3, P3.V3, P4.V3, P5.V4, P10.V3 |
| `cd server && pnpm exec vitest run .it.test --no-file-parallelism` | 0 | `Test Files 24 passed (24)` · `Tests 204 passed (204)` (Docker up, nothing skipped) | P2.V4, P4.V4, P5.V3, P10.V4 |
| `cd client && pnpm typecheck` | 0 | `tsc --noEmit` (no errors) | P1.V4, P6.V1, P7.V1, P8.V1, P10.V5, P11.V1 |
| `cd client && perl -e 'alarm 400; exec @ARGV' pnpm test` | 0 | `Test Files 60 passed (60)` · `Tests 538 passed (538)` | P6.V2, P7.V2, P8.V2, P10.V6, P11.V2 |
| `cd e2e && npm run typecheck` | 0 | `tsc --noEmit -p tsconfig.json` (no errors) | P9.V1 |
| `cd e2e && npm run e2e:hermetic` | not run | — | P9.V2 (your instruction) |

## Scope
- **Changed files not in the plan:**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx` and `PrDetailHeader.test.tsx`: declared deviation (phase 8, sticky offset `--diff-sticky-offset`).
  - `client/src/components/diff-viewer/constants.ts`, `helpers.ts`, `index.ts`: declared deviations (phase 8: `JUMP_PULSE_MS`, `DiffJumpTarget`, `STICKY_OFFSET_VAR`).
  - `client/src/components/diff-viewer/styles.test.ts`: added in the phase 8 commit `b20dffa`. It tests the planned `styles.ts` margins and the declared `jumpedRow` and sticky offset. Explained, though no plan test line lists it.
  - `INSIGHTS.md`, `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`: main-session commit `17cbfb0`. The plan puts INSIGHTS entries out of scope for the phases, with the main session handling them.
  - `specs/L05-pr-brief.md`, `server/specs/L05-pr-brief.md`, `client/specs/L05-pr-brief.md`, the three `specs/README.md` index rows, and `specs/plans/L05-pr-brief.md`: spec and plan artifacts (commits `4eb1c7a`, `8bde729`, `1188f53`, `2368449`, `423fcf7`, `c7207c4`).
- **Protected paths touched:** none. The only `client/src/vendor/**` changes are the two planned contract copies.
- **Failing in the reported baseline:** none. Every suite passed in full.

## Gaps
Nothing. The gaps the fix phases targeted are closed:
- **P4.F3** (verify-gaps): `server/src/modules/brief/service.ts:270-274` validates risk refs with `blastFilesOf(blast)` on the full map, and `:303` stores `sentBlast(...)`. Pinned by `server/test/brief-service.test.ts:761` and `:778`, which passed.
- **M1** (verify-gaps): the `server/src/db/seed.ts:376-378` comment names flow 14 only.
- **arch F1, round 1**: `project-context/domain.ts` and `brief/domain.ts` have no `./ports.js` import.
- **arch F2, round 1**: the hooks live in `_lib/` and `PrBriefSection/`, and `client/src/lib/use-*.ts` no longer exists.
- **arch F3, round 1**: the five rules are in `brief/domain.ts`, and `service.ts` defines none of them.
- **arch F1, round 2**: `DiffTab.tsx` uses `useState` and has no `useRef`. The collapse/reopen test passed.

## Not verified
- **P9.T1, P9.T4, P9.V2, P9.D, R83 (AC-83), R84 (AC-84):** these need `cd e2e && npm run typecheck && npm run e2e:hermetic`, run alone, with the dev stack stopped or from a separate worktree. You excluded that run. One clean hermetic run, with flows 10 and 14 passing, settles all six.
- **The "Verify (manual, screenshots)" checks of phases 6, 7, 8 and 11:** layout against the design, narrow-window stacking, focus background, about 130 px scroll offset, single pulse after collapse/reopen, and console warnings. They need the running stack and a browser. They are not counted as items, and I did not check them.


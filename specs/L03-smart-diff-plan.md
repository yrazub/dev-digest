# Development Plan: L03 — Smart Diff (revision 2)

**Goal:** The Files changed tab of a pull request groups its files by role (core → tests → wiring → docs → boilerplate) through a deterministic path classifier and a new read-only route, shows the findings of the newest review of each agent inside the diff (group counter, file dot, line stripe and tag, the finding card under its line), and can switch back to the original order. No model call, no new dependency, no migration. · **Packages:** `@devdigest/shared` (authored in `server/`; two enum values copied to `client/`), `server`, `client`, `e2e` ·
**Spec:** `specs/L03-smart-diff.md` (umbrella: A1–C5, Q1–Q7, D1–D11), `server/specs/L03-smart-diff.md`, `client/specs/L03-smart-diff.md` · **Assumptions:** (1) Q1–Q7 and D1–D11 are settled and not reopened; the nine questions of revision 1 are answered and listed under Resolved. (2) A directory pattern (`dist`, `test`, …) is tested against every path segment except the last one, so a file literally named `build` is not boilerplate. (3) Values the specs leave blank are fixed in Design: the `docsHint` text, every new string value, and the line counts of the five new seeded files (chosen so the nine files sum to the PR's stored `+247 −38`). (4) `smartDiffKeys` gets a second factory `pull(prId)` = `["smart-diff", prId]`, the prefix needed to invalidate by PR. (5) The client applies the server's rule for a null `agent_id` (all such reviews are one agent). (6) The comments switch counts GitHub comments plus counted findings whose `file` is one of the PR's files. (7) This plan is saved as `specs/L03-smart-diff-plan.md`. Paths are relative to the repository root `/Users/yrazub/Projects/dev-digest`.

## Changes in revision 2
Made after the user answered the open questions of revision 1 (`specs/L03-smart-diff.md:168-174`, Q5–Q7).

1. **Phase 10 (sticky group header, C1) is removed.** C1 is not built (Q6). The `PrDetailHeader` change, its test and the sticky styles are gone; `PrDetailHeader` is now under "Do not touch" and C1 under Out of scope.
2. **Phase 9, C4, is extended (Q5).** A page-level refresh runs when the PR's active runs go from non-empty to empty, on any tab. It lives in `client/src/lib/hooks/reviews.ts` as a pure helper and one hook; `page.tsx` calls the hook and hands its function to `onRunDone`. Design → "Refresh after a run" states the shapes and why it cannot loop.
3. **Phase 9's `Verify (phase)` gains `cd e2e && npm run e2e:hermetic`**, moved from the removed phase 10: the last phase closes with the full browser suite.
4. **Phases 1–8 are unchanged except for three lines.** Phase 7, `RoleGroup.tsx` row: the sentence "The root element sets no `overflow`" is removed — its only reason was the sticky header. Phase 7, `constants.ts` row: "(Open question 4)" becomes "(Q7)" — wording only. Phase 8, intro: "the P3 phases" becomes "the P3 phase" — wording only.
5. **Around the phases:** the header's assumptions, the Context read row for code, Constraints (the sticky-header insight is replaced by the C4 constraints), the requirement-coverage table, "Cutting P3", Design → Strings (citations only), Out of scope, Risks and Delivery are updated; "Open questions" is replaced by "Resolved".

## Context read
| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` (root) | Contracts once in `server/src/vendor/shared`; `snake_case` on the wire, `camelCase` in Drizzle, converted in the repository; enum-keyed objects use exact enum values; protected paths; per-package package managers |
| `specs/L03-smart-diff.md`, `server/specs/L03-smart-diff.md`, `client/specs/L03-smart-diff.md` | The requirements, cross-package rules, module layout, test tables and acceptance, including the decisions Q5–Q7 of 2026-10-06; the plan does not restate them |
| `specs/L03-intent-layer-plan.md` | Shape and level of detail of a plan here; the precedent of a seeded row inserted outside `if (!pr)` |
| `server/CLAUDE.md`, `server/README.md` (stack, DI flow, API map), `server/docs/schema.md` | Module shape `routes.ts` · `service.ts` · `repository.ts`; schema-first params; no response schema on routes; `pnpm db:seed` is idempotent; the `Verify` commands |
| `server/.dependency-cruiser.cjs` | The machine-checked boundaries a new module and a `_shared` helper must satisfy |
| `client/CLAUDE.md`, `client/docs/data-flow.md`, `client/docs/ui-architecture.md`, `client/src/vendor/ui/README.md` | Component folder layout; hooks as the only data path; query keys and what refreshes them; how a live run reaches the UI; URL state through `router.replace`; vendored primitives (`SEV`, `SectionLabel`, `Skeleton`, `Button`); "copy the lines you changed" for the contract copy |
| `e2e/CLAUDE.md`, `e2e/README.md`, `e2e/docs/runner-internals.md`, `e2e/docs/coverage-strategy.md`, `e2e/specs/seed-fixtures.md`, flows `02`, `04`, `05`, `09`, `10` | A flow is data; `wait --text` / `wait --url` are the assertions; flows share one session and run in filename order; the seed contract a seed change must update; what the existing flows wait for |
| `TESTING.md`, `.claude/skills/onion-architecture/references/testing-by-layer.md` | Suite per package; `*.it.test.ts` for DB-backed tests; domain tests take no doubles, routes go through `app.inject` |
| `.claude/agents/README.md` (Feature workflow) | One `implementer` run and one `test-writer` run per phase; the main session carries every handoff; what `plan-verifier` and `architecture-reviewer` receive |
| `.claude/skills/pr-self-review/routing.json`, `references/critical-rules.md` | File → skill mapping and the rule IDs a reviewer blocks on |
| `.claude/skills/onion-architecture/SKILL.md`, `references/drizzle-persistence.md` | Where a pure rule, a query and a wiring line go; a repository returns domain types; a thin service may use the concrete repository (no `ports.ts`) |
| `.claude/skills/frontend-ui-architecture/SKILL.md`, `references/folder-structure.md`; `.claude/skills/react-best-practices/SKILL.md` | Shared code never imports from `app/`; one component per file, none nested; no server state in `useState`; derive in render, effects only to sync an external system; index keys and `renderThing()` functions are flagged |
| `INSIGHTS.md` (root, `server/`, `client/`, `e2e/`) | The entries listed under Constraints |
| Code opened | Server: `contracts/brief.ts`, `contracts/review-api.ts`, `contracts/findings.ts`, `modules/index.ts`, `modules/intent/{routes,repository,ports}.ts`, `modules/pulls/{routes,service,repository,domain}.ts`, `modules/reviews/{routes,helpers}.ts`, `modules/reviews/repository/review.repo.ts`, `modules/reviews/run-executor.ts` (the order of persisting a review and completing a run), `modules/_shared/{context,schemas,finding-dto}.ts`, `db/schema/{pulls,reviews}.ts`, `db/seed.ts`, `platform/errors.ts`, `adapters/mocks.ts`, `test/contracts.test.ts`, `test/intent-routes.it.test.ts`, `test/integration.it.test.ts`, `test/helpers/pg.ts`. Client: all of `components/diff-viewer/`, `DiffTab`, `FindingCard`, `FindingsPanel`, `FindingsTab`, `RunStatus`, `ReviewRunAccordion`, `PrDetailHeader` (+ `styles.ts`), `page.tsx`, `lib/hooks/{reviews,pulls,intent}.ts`, `lib/api.ts`, `lib/types.ts`, `i18n/request.ts`, `messages/en/prReview.json`, `vendor/shared/contracts/brief.ts`, `vendor/ui` (`tokens.ts`, `Badge`, `SectionLabel`, `Chip`, `Tabs`, `AppFrame`, `styles.css`), `test/smoke.test.tsx`, `IntentCard.test.tsx`, `intent.test.tsx`, `FindingsPanel.test.tsx`. Other: `scripts/e2e.sh` |

Not read in full: the bodies of the `security`, `zod`, `drizzle-orm-patterns`, `fastify-best-practices` and `next-best-practices` skills (their blocking rule IDs are taken from `routing.json` and `critical-rules.md`; none of the four non-blocking skills constrains placement here).

## Constraints
- **Architecture:** a module imports only itself and `modules/_shared/` — `server/.dependency-cruiser.cjs:65-73`. The classifier lives in `modules/_shared/file-role/` so `smart-diff` now, and `reviews` in L08, can both import it (Q4).
- **Architecture:** `src/db/` is imported only by `repository.ts` files and the composition root, and `modules/_shared/` is **not** exempt — `server/.dependency-cruiser.cjs:51-64`, `server/INSIGHTS.md:47-52`. The classifier imports nothing but a type from `@devdigest/shared`.
- **Architecture:** `domain.ts` imports no framework, no `src/db`, `src/platform`, `src/adapters`, and no `routes` / `service` / `repository` file — `server/.dependency-cruiser.cjs:17-27`. `domain.ts` may import `modules/_shared/file-role/` (not matched by that rule).
- **Architecture:** a service does not import `platform/container.ts`; a module's `routes.ts` is the composition root for its own wiring — `server/.dependency-cruiser.cjs:81-89`, `.claude/skills/onion-architecture/SKILL.md:35`. The logic sits in `domain.ts`, so the service takes the concrete repository and no `ports.ts` is added — `SKILL.md:44-45`, `:62` (`dep-proportionate`).
- **Architecture:** a repository returns domain types, never `$inferSelect` rows, and converts `camelCase` ↔ `snake_case` once — `.claude/skills/onion-architecture/references/drizzle-persistence.md:20-35`.
- **Architecture:** routes declare `schema: { params }` and no response schema; the returned object reaches the wire as-is — `server/INSIGHTS.md:22-30`. `SmartDiff` conformance is proven by the integration test parsing the body.
- **Architecture (client):** `src/components/` never imports from `src/app/` — `.claude/skills/frontend-ui-architecture/references/folder-structure.md:42-56`. Nothing checks this mechanically (`client/INSIGHTS.md:43-50`), so `diff-viewer` gets the card through `DiffFindingApi.renderFinding` (D7).
- **Architecture (client):** client code imports only *types* from `@devdigest/shared`; a value import breaks the route at compile time in the browser while `pnpm typecheck` passes — `client/INSIGHTS.md:88-99`. Enum-keyed maps are written out locally and typed with `import type`.
- **Architecture (client):** what must survive a reload lives in the URL, written with `router.replace` — `client/docs/ui-architecture.md:44-53` (D4). Server data stays in the query cache, never copied into `useState` — `client/docs/data-flow.md:49-50`.
- **Architecture (client):** an effect only synchronises an external system; a value that can be computed from props or query data is computed in render — `.claude/skills/frontend-ui-architecture/SKILL.md:114` (`logic-no-effect-derivation`), `.claude/skills/react-best-practices/SKILL.md:65-72`. The C4 refresh is such a synchronisation (it invalidates query-cache entries when a server-side fact changes); it keeps the previous count in a `useRef` written inside the effect, never in `useState` and never during render. `RunStatus.tsx:21-26` uses the same shape for the SSE signal.
- **Architecture (client):** hooks live one file per API resource in `src/lib/hooks/`, and a mutation or signal that changes data invalidates the keys there — `client/CLAUDE.md` (Naming), `client/docs/data-flow.md:87-93`. The run-settled refresh belongs to the runs and reviews resource, so it goes in `reviews.ts` and the page stays thin.
- **Insights:** `pr_files` is written only by `GET /pulls/:id` (delete, then insert, on every successful GitHub refresh) and by the seed; it has no position column and is read without `ORDER BY` — `server/INSIGHTS.md:59-65`, `server/src/modules/pulls/repository.ts:128-140`, `:170`. Files inside a group are sorted by path in `domain.ts` (D3), and the client asks for the grouping only after the detail has loaded (D9).
- **Insights:** a seed change inside `if (!pr)` never reaches an already-seeded database — `server/INSIGHTS.md:40-45`, `server/src/db/seed.ts:116`. The D10 rows are written by a block **outside** it, as the intent row is (`seed.ts:218-254`).
- **Insights:** `pr_files` has no unique index on `(pr_id, path)` — `server/src/db/schema/pulls.ts:36-45`. `onConflictDoNothing()` would therefore insert duplicates on every re-seed; the D10 block checks for the path first.
- **Insights:** in an `.it` file a seeded row cannot be restored once a test corrupts it, except through a seed block that repairs it — `server/INSIGHTS.md:57`. The phase 3 upgrade test relies on exactly that repair and touches nothing else of the seeded PR.
- **Insights:** `GET /pulls/:id` with a `MockGitHubClient` override replaces the PR's `pr_files` with the mock's single file — `server/src/modules/pulls/service.ts:100-106`, `server/src/adapters/mocks.ts:173-199`. No smart-diff test calls `GET /pulls/:id` on the seeded PR; it reads `pr_files` from the database.
- **Insights:** an integration run that prints `skipped` proves nothing; rerun as `cd server && pnpm exec vitest run .it.test --no-file-parallelism` and read the summary — `server/INSIGHTS.md:167-187`. A phase is not closed on a skipped `.it` file.
- **Insights:** a `buildApp` test with no `secrets` override can read the developer's real keys — `server/INSIGHTS.md:97`. `smart-diff.it.test.ts` passes `MockSecretsProvider`, a GitHub double and a mock LLM, although the route uses none of them.
- **Insights:** scans of author-controlled text built on backtracking patterns were measured quadratic here — `server/INSIGHTS.md:227-228`. A changed file's path is author-controlled, so `classifyFile` matches with string operations and builds no `RegExp` from a pattern.
- **Insights:** `SectionLabel` uppercases through CSS; the DOM keeps the authored casing — root `INSIGHTS.md:100-109`. Tests and flows match `Smart Diff · grouped by role`, not the uppercase form.
- **Insights:** a mocked hook whose function identity a component depends on must return one stable object, or vitest hangs silently — `client/INSIGHTS.md:101-120`.
- **Insights:** the client `typecheck` covers test files; errors only under `.next/types/` are a stale artefact — root `INSIGHTS.md:295-297`, `client/INSIGHTS.md:121-125`. Never run `pnpm build` in `client/` while `pnpm dev` is up — `client/INSIGHTS.md:75-86`.
- **Insights:** in a flow, `wait --text` before any `find … click` — `e2e/INSIGHTS.md:39-53`. The hermetic run writes into the same `client/.next` as a running dev server — `e2e/INSIGHTS.md:65-80`: stop `pnpm dev` before `npm run e2e:hermetic`, or clear `client/.next` afterwards.
- **Insights:** never run two `cd <pkg> && …` commands in one parallel batch — root `INSIGHTS.md:333-348`. Run every `Verify` command one at a time.
- **Insights (skill):** ``**Skill:** `next-best-practices` `` — the local copy describes Next 16 while the client runs Next 15; prefer nextjs.org when they disagree — root `INSIGHTS.md:159-168`. No other skill named in this plan has a tagged entry.
- **Do not touch:** `server/src/db/migrations/**` and `server/src/db/schema/**` (no schema change); every lock file; `server/.dependency-cruiser-known-violations.json` (no new baseline entry); `client/src/vendor/**` except the one `SmartDiffRole` line of `client/src/vendor/shared/contracts/brief.ts`, which is a copy of the server line; `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` (D6); `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/**` (Q6: C1 is not built); `FindingsPanel`, `FindingsTab`, `RunStatus`, `ReviewRunAccordion` (the Agent runs tab stays as it is). No new dependency in any package.

## Design

### Requirement coverage
| Req | Met by |
|---|---|
| A1 group order, label, file count | phase 1 (order), phase 2 (five groups in `ROLE_ORDER`), phase 7 (headers) |
| A2 lock file is boilerplate; docs and boilerplate collapsed (D2) | phase 1 (rule 1), phase 7 (`startsCollapsed`, `defaultOpen={false}`) |
| A3 group counter of files with findings | phase 7 |
| A4 dot on the file card | phase 5 |
| A5 finding under its line | phase 5 (anchor), phase 6 (`InlineFinding`) |
| A6 Original order (D4) | phase 7 |
| A7, B8 | Delivery — not a phase |
| B1 one constants file, classifier test table | phase 1 |
| B2 route body parses as `SmartDiff`; enum in both copies | phases 1, 2 |
| B3 no model call; groups before the first review | phase 2 |
| B4 stripe and tag | phase 5 |
| B5 Accept / Dismiss inline | phase 6 |
| B6 finding outside the patch | phase 5 |
| B7 one switch (Q2) | phase 6 |
| C1 sticky group header | **not built** (Q6) — Out of scope |
| C2 collapse an inline finding | free in phase 6 — `FindingCard` already collapses on a header click (`FindingCard.tsx:57`) |
| C3 "no review yet" | phase 9; "no zero counters" is free in phase 7, because A3's mark is not rendered at 0 |
| C4 marks update after a run, on any tab (Q5) | phase 9: the page-level refresh when the active runs become empty, and the `smart-diff` invalidation next to every `["reviews", prId]` one. From phase 6 on the marks already follow the reviews query when the run ends on the Agent runs tab |
| C5 labels from `prReview.json` | free — phase 4 adds every string, phases 5–7 and 9 read them |
| D10 seed | phase 3 |

**Cutting P3:** phase 9 is the only P3 phase. Its C3 row and its C4 rows share no file, so either set, or the whole phase, can be dropped; nothing in phases 1–8 depends on it. If phase 9 is dropped, phase 8's hermetic run is the last browser check. C2 and C5 cost nothing and cannot be cut.

### Terms used in every phase
- **Shown findings** — every finding of the newest review of each agent (`agent_id`; null counts as one agent), dismissed ones included. They get cards.
- **Counted findings** — shown findings whose `dismissed_at` is null (D5). They drive the dot, the group counter, the stripe, the tag and the switch's number. An accepted finding still counts.
- **Anchor key** — `RIGHT:<start_line>`; a finding is anchored when an `add` or `ctx` line of the rendered patch has that new-side number, else it is *unanchored* (B6).

### Server shapes the implementer must match
```ts
// server/src/modules/_shared/file-role/constants.ts
export const ROLE_ORDER: readonly SmartDiffRole[];            // core, tests, wiring, docs, boilerplate
export interface RoleRule {
  role: Exclude<SmartDiffRole, 'core'>;
  names: readonly string[];   // tested against the last segment; `*` is the only wildcard
  dirs: readonly string[];    // a segment at any depth, never the last one
  roots: readonly string[];   // the first segment of a path with at least two segments
}
export const ROLE_RULES: readonly RoleRule[];                 // boilerplate, tests, wiring, docs — checking order

// server/src/modules/_shared/file-role/classify.ts
export function classifyFile(path: string): SmartDiffRole;

// server/src/modules/smart-diff/domain.ts
export interface ChangedFile { path: string; additions: number; deletions: number }
export interface FindingRef { file: string; startLine: number; dismissedAt: Date | null }
export interface ReviewFindings { agentId: string | null; createdAt: Date; findings: FindingRef[] }
export function countedFindings(reviews: ReviewFindings[]): FindingRef[];
export function buildSmartDiff(files: ChangedFile[], findings: FindingRef[]): SmartDiff;
```
- Wildcard match without a `RegExp`: split the pattern on `*`; the first part is a prefix, the last a suffix, middle parts are found left to right with `indexOf`; a pattern with no `*` is an equality test. Case-sensitive. The path is not normalised; `''` is `core`.
- Sorting by path is a code-unit comparison (`a < b`), not `localeCompare`, so the order is the same on every machine.
- When two reviews of one agent have the same `createdAt`, the one earlier in the input wins (the repository returns newest first).

### Seed fixture — PR #482 after `pnpm db:seed` (D10)
| Path | Lines | Role | Row |
|---|---|---|---|
| `src/middleware/ratelimit.ts` | +84 −0 | core | exists; unchanged |
| `src/api/public/webhooks.ts` | +31 −6 | core | exists; unchanged |
| `src/config.ts` | +4 −0 | core | exists; gains a patch |
| `src/api/users.ts` | +7 −2 | core | exists; gains a patch |
| `src/middleware/ratelimit.test.ts` | +40 −0 | tests | new |
| `src/api/public/index.ts` | +3 −0 | wiring | new |
| `tsconfig.json` | +2 −1 | wiring | new |
| `README.md` | +14 −2 | docs | new |
| `package-lock.json` | +62 −27 | boilerplate | new |

Sum: +247 −38, nine files — what the seeded `pull_requests` row and the PR header already say (`seed.ts:128-130`); `split_suggestion.total_lines` is 285.

Patches (the five new files get none, like the two untouched ones):
- `src/config.ts` — one hunk, header `@@ -9,3 +9,7 @@`, exactly four `+` lines and no `-` line; new-side line 12 is a `+` line that holds a visibly fake `sk_live_` placeholder with no run of 24 or more letters and digits after the prefix (for example `sk_live_EXAMPLE_NOT_A_REAL_KEY`), so no secret scanner reads it as a key.
- `src/api/users.ts` — one hunk, header `@@ -41,8 +41,13 @@`, exactly seven `+` lines and two `-` lines; new-side line 45 is a rendered line.
- Neither patch string ends with a newline: the client's `parsePatch` would render a trailing empty line (`client/src/components/diff-viewer/helpers.ts:17-35`).

### Client composition
```
page.tsx
├─ useRunSettledRefresh(prId)                        phase 9 — the C4 refresh, on any tab
└─ DiffTab { prId, pr, repoFullName, canComment }
   ├─ usePrComments · useCreatePrComment · usePrReviews(prId) · useSmartDiff(prId, pr.head_sha)
   ├─ SectionLabel + the comments switch
   ├─ totals row + OrderSwitch                       ?order=original
   ├─ smart: RoleGroup per non-empty group → DiffViewer(group files, commenting, findings, defaultOpen)
   │         then DiffViewer(files missing from the response), no header
   └─ flat:  DiffViewer(pr.files, commenting, findings)
DiffViewer → FileCard [FindingDot, UnanchoredFindings] → CodeLine [LineFindingTag, renderFinding(f)]
renderFinding(f) = <InlineFinding/> → FindingCard (unchanged)
```
`DiffFindingApi` is exactly the interface of `client/specs/L03-smart-diff.md:83-91`; its `findings` holds the **shown** findings.

### Refresh after a run (C4, Q5) — built in phase 9
```ts
// client/src/lib/hooks/reviews.ts
/** True only when a known, non-empty list of active runs became empty. */
export function runsJustSettled(previous: number | undefined, current: number | undefined): boolean;
/** Returns the refresh a finished run needs, and runs it by itself when the PR's active runs become empty. */
export function useRunSettledRefresh(prId: string | null | undefined): () => void;
```
- **The refresh** is one function with a stable identity (`useCallback` on the query client and `prId`). With a `prId` it invalidates `["pr-active-runs", prId]`, `["pr-runs", prId]`, `["reviews", prId]`, `intentKeys.detail(prId)` and `smartDiffKeys.pull(prId)`; without one it does nothing. Invalidating `["reviews", prId]` refetches it, because the page observes that query — the same effect as today's `refetchReviews()`.
- **The watcher** reads `usePrActiveRuns(prId).data?.length` inside the hook. The page's own `usePrActiveRuns(prId)` call has the same key, so there is no second request and the existing 4-second polling is what drives it, on every tab. One effect compares the count with the previous one, kept in a `useRef` together with the `prId` it belongs to, and calls the refresh when `runsJustSettled(previous, count)` is true. The ref is written inside the effect. There is no `useState`.
- **It does not fire on first load:** while the query has no data the count is `undefined` and the effect returns; the first known count has no previous one, so an empty first answer (`undefined → 0`) and a non-empty one (`undefined → 2`) both do nothing. A previous count stored for another `prId` is treated as `undefined`, so moving from a PR with running runs to a PR with none fires nothing.
- **It cannot loop, and the double fire is harmless.** On the Agent runs tab the SSE signal comes first: `RunStatus` → `onRunDone` → the refresh; its `pr-active-runs` invalidation brings the empty list, the watcher sees `n → 0` and runs the refresh a second time; that second `pr-active-runs` refetch answers empty again, `0 → 0` is not a transition, and it stops. The cost is one extra `GET` per key; every call is an idempotent invalidation. `onRunDone` is kept because the stream ends sooner than the next poll.
- **The data is there when it fires:** the executor inserts the review and its findings before it marks the run `done` (`server/src/modules/reviews/run-executor.ts:272-298`), so a list that has just become empty means the review is readable. A failed or cancelled run also empties the list; the refresh then brings the failed run into the run history, which is what `onRunDone` does today.
- **In `page.tsx`** the hook is called once, next to `usePrActiveRuns` and above the early returns; its result is passed as `onRunDone`. The inline body of `onRunDone`, `invalidateRunHistory`, the `refetch: refetchReviews` binding and the `intentKeys` import are removed; `invalidateActiveRuns` stays for `onRunsStarted`.

### Strings — `client/messages/en/prReview.json`, key `smartDiff`
| Key | Value | State |
|---|---|---|
| `coreLabel` · `wiringLabel` · `boilerplateLabel` · `groupedByRole` · `findingLines` · `largeTitle` · `largeBody` | unchanged | existing |
| `filesCount` | `{count, plural, one {# file} other {# files}}` | existing key, value changed (Q7; `client/specs/L03-smart-diff.md:130-131`) |
| `testsLabel` · `docsLabel` | `Tests` · `Docs` | new |
| `coreHint` | `The substance of the change — review closely` | new |
| `testsHint` | `Checks for the change` | new |
| `wiringHint` | `Hooks the core into the app` | new |
| `docsHint` | `Explains the change — read for context` | new |
| `boilerplateHint` | `Generated or mechanical — skim` | new |
| `smartOrder` · `originalOrder` | `Smart order` · `Original order` | new |
| `filesChanged` | `Files changed` | new (Q7; the section label of the flat list) |
| `totals` | `{files, plural, one {# file} other {# files}} · +{additions} −{deletions}` | new |
| `filesWithFindings` | `{count, plural, one {# file with findings} other {# files with findings}}` | new |
| `fileHasFindings` | `File has findings` | new |
| `lineTag.CRITICAL` · `lineTag.WARNING` · `lineTag.SUGGESTION` | `blocker` · `warning` · `suggestion` | new |
| `findingsOutsideDiff` | `Findings outside the diff` | new |
| `noReviewYet` | `No review has run yet — findings appear here after Run Review` | new |
| `groupingUnavailable` | `Grouping is unavailable — showing the original order` | new |
| `showComments` · `hideComments` | `Show comments ({count})` · `Hide comments ({count})` | new |

## Phases

### 1 · Contract and the file-role classifier — `@devdigest/shared` (authored, server; copy in client)

The enum that crosses the API boundary, in both copies, and the pure classifier with its one constants file. First, so every later phase compiles against five roles; nothing reads them yet.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts` | `SmartDiffRole` becomes `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`; no other line changes | onion-architecture, security, zod | dep-domain-framework-free |
| `client/src/vendor/shared/contracts/brief.ts` | The same line, copied by hand; the file stays byte-identical to the server file | — (excluded from review: `client/src/vendor/**`; this is a copy) | — |
| `server/src/modules/_shared/file-role/constants.ts` (new) | `ROLE_ORDER`, `RoleRule` and `ROLE_RULES` as in Design, holding the four pattern rows of `server/specs/L03-smart-diff.md:50-56` unchanged; the only file where a pattern or the role order is written; imports only the `SmartDiffRole` type | onion-architecture, security, fastify-best-practices | dep-inward-only, db-only-in-repository |
| `server/src/modules/_shared/file-role/classify.ts` (new) | `classifyFile(path)`: walks `ROLE_RULES` in order, returns the first matching rule's role, else `core`; the three match kinds and the `RegExp`-free wildcard of Design; synchronous, no I/O, no import beyond `./constants.js` and the type | onion-architecture, security, fastify-best-practices | dep-inward-only, db-only-in-repository |

**Tests (test-writer):**
- Add `server/test/smart-diff-classify.test.ts` (hermetic; imports only the two new files) — every row of the table at `server/specs/L03-smart-diff.md:60-71`, the three disputed cases named as such; the seeded paths: `src/config.ts` → core, `src/middleware/ratelimit.test.ts` → tests, `src/api/public/index.ts` and `tsconfig.json` → wiring, `README.md` → docs, `package-lock.json` → boilerplate; a directory at depth (`client/dist/a.js` → boilerplate, `server/src/x/__tests__/a.ts` → tests); root patterns only at the root (`packages/e2e/a.ts`, `src/docs/guide.txt`, `packages/.github/x.yml` → core); names (`vitest.config.ts`, `.env.local`, `docker-compose.dev.yml`, `.eslintrc.cjs`, `tsconfig.build.json` → wiring; `Cargo.lock`, `app.min.js`, `types.generated.ts` → boilerplate; `a.spec.ts` → tests; `README`, `CHANGELOG.txt` → docs); case sensitivity (`Index.ts`, `license` → core); a last segment equal to a directory pattern (`scripts/build`, `server/test` → core); `''` → core; `ROLE_ORDER` equals the five roles in reading order; `ROLE_RULES` lists boilerplate, tests, wiring, docs in that order and has no `core` entry; a 4 000-character path of repeated `.config` segments classifies within 100 ms.
- Extend `server/test/contracts.test.ts` — `SmartDiff` parses a body with one group per role in reading order; `SmartDiffRole.options` equals the five values in reading order; an unknown role is rejected.
- Expected to change: none

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test` · `cd reviewer-core && npm run typecheck` · `cd client && pnpm typecheck`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check` · `cd reviewer-core && npm run typecheck` · `cd client && pnpm typecheck && pnpm test`
**Done when:**
- B2 — `SmartDiffRole` has the five values in reading order in `server/src/vendor/shared/contracts/brief.ts`, and `client/src/vendor/shared/contracts/brief.ts` is byte-identical to it.
- B1 — every pattern and the role order appear only in `server/src/modules/_shared/file-role/constants.ts`, and the classifier test table passes with the three disputed cases.
- A2 (rule) — `classifyFile` returns `boilerplate` for `pnpm-lock.yaml`, `server/pnpm-lock.yaml` and `e2e/package-lock.json`.
- `classifyFile` is importable and callable with no app, container or request, and `pnpm arch:check` reports no new violation.

### 2 · Server module `smart-diff` — route, service, repository, domain

The grouping as an API: `GET /pulls/:id/smart-diff`. After the classifier, before any consumer.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/smart-diff/domain.ts` (new) | The three structural types, `countedFindings` (newest review per `agentId`, null as one agent; only findings with a null `dismissedAt`) and `buildSmartDiff` (always five groups in `ROLE_ORDER`; each file placed by `classifyFile`; files sorted by path; `finding_lines` = distinct `startLine` values of the findings whose `file` equals the path, ascending; a finding for a path outside the files is ignored; `pseudocode_summary` omitted; `split_suggestion` = `{ too_big: false, total_lines: <sum>, proposed_splits: [] }`), as in Design; pure | onion-architecture, security | dep-domain-framework-free, dep-inward-only |
| `server/src/modules/smart-diff/repository.ts` (new) | `SmartDiffRepository` over `Db`, the only file of the module that imports `src/db/`: `findPull(workspaceId, prId)` (workspace-scoped, `undefined` when absent), `files(prId)` → `ChangedFile[]` (`path`, `additions`, `deletions`; the patch is not selected), `reviews(prId)` → `ReviewFindings[]` newest first with each finding's `file`, `startLine`, `dismissedAt`; query builder only, no raw SQL; read-only | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-injection |
| `server/src/modules/smart-diff/service.ts` (new) | `SmartDiffService` with `constructor(deps: { repo: SmartDiffRepository })` and `forPull(workspaceId, prId): Promise<SmartDiffResponse>`: throws `NotFoundError('Pull request not found')` when `findPull` is empty, else returns `buildSmartDiff(files, countedFindings(reviews))`; no Fastify, no `Container`, no `src/db`, no GitHub, no LLM | onion-architecture, security | dep-inward-only, db-only-in-repository, di-composition-root-only |
| `server/src/modules/smart-diff/routes.ts` (new) | Default Fastify plugin: builds `new SmartDiffService({ repo: new SmartDiffRepository(container.db) })` once; `GET /pulls/:id/smart-diff` with `schema: { params: IdParams }`, `getContext`, one service call, return type `SmartDiffResponse`; no rate-limit override, no response schema | onion-architecture, security, fastify-best-practices | edge-thin-routes, zod-parse-at-boundary, di-composition-root-only, sec-missing-authz |
| `server/src/modules/index.ts` | Import and register `smartDiff` | onion-architecture, security | dep-inward-only |

**Tests (test-writer):**
- Add `server/test/smart-diff-domain.test.ts` (hermetic, no doubles) — five groups in `ROLE_ORDER` for an empty file list, each with `files: []`; files land in the group `classifyFile` gives; files inside a group are sorted by path in code-unit order (three or more files, an uppercase path before a lowercase one); `finding_lines` is distinct and ascending; `countedFindings` keeps only the newest review of each agent, treats two reviews with a null `agentId` as one agent, keeps one review per agent when a batch ran several agents, and drops dismissed findings; a finding for a file outside the PR is ignored; `split_suggestion` carries the sum of additions and deletions and `too_big: false`; `pseudocode_summary` is absent.
- Add `server/test/smart-diff.it.test.ts` (overrides: `secrets: new MockSecretsProvider()`, a GitHub double that counts every method call, `llm: { openrouter: new MockLLMProvider('openrouter') }`; every PR is inserted by the test — the seeded PR is covered in phase 3) — a PR with one file per role and no review answers `200`, the body parses with `SmartDiff`, the group roles are the five in order, the lock file is in `boilerplate`, every `finding_lines` is empty (B3); after inserting two reviews of one agent (the older with a finding the newer lacks) and one review of another agent, with one dismissed finding, a repeated line and a finding for a file not in the PR, `finding_lines` holds the newest-per-agent, non-dismissed, distinct lines ascending; a PR with no `pr_files` answers `200` with five empty groups and `total_lines: 0`; an unknown uuid answers `404` with code `not_found`; a non-uuid id answers `422`; a PR that belongs to another workspace answers `404`; after all requests the LLM mock's `calls` is empty and the GitHub double recorded no call.
- Expected to change: none

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check`
**Done when:**
- B2 — `GET /pulls/:id/smart-diff` answers with a body that parses as `SmartDiff` and always has five groups in `ROLE_ORDER`.
- B3 — the route answers for a PR with no review, and the integration test records no GitHub and no model call.
- Q1, D5 — `finding_lines` holds the lines of the newest review of each agent, without dismissed findings.
- D3 — files inside a group are ordered by path.
- `src/modules/smart-diff/repository.ts` is the module's only importer of `src/db/`, and `pnpm arch:check` reports no new violation and no new baseline entry.

### 3 · Seed — nine files and two patches for PR #482 (D10)

The demo PR shows all five groups and an anchored finding with no model call. Its own phase because it changes what every seeded database and every browser flow sees.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/db/seed.ts` | After the `pr_intent` block and outside `if (!pr)`: (1) read the paths `pr_files` already holds for PR #482 and insert each of the five new files of Design → Seed fixture that is missing; (2) for `src/config.ts` and `src/api/users.ts`, set `patch` to the fixture only where the row's `patch` is null. No `onConflictDoNothing()` for these rows, no delete, no overwrite of a non-null patch; the `if (!pr)` block stays as it is; the doc comment of `seed()` names the nine files | onion-architecture, security, drizzle-orm-patterns | sec-hardcoded-secret |
| `e2e/specs/seed-fixtures.md` | New section "PR #482 has nine files, one or more per role, and two patches": the nine paths with their roles; that `src/config.ts` must stay in a group that starts expanded (flows `05` and `11`); that `package-lock.json` is the only boilerplate file and `README.md` the only docs file (flow `11`); that the finding `Hardcoded Stripe secret key in commit` is anchored at `src/config.ts` line 12 inside the seeded patch; that the block runs outside `if (!pr)` and so reaches an already-seeded database on the next `pnpm db:seed`. In "PR #482 must exist with a completed run", the Files changed bullet names `05` and `11` | — (`.md`) | — |

How the change reaches each database, and what it means for the flows:
- **Fresh database** (CI, `npm run e2e:hermetic`, every testcontainer): the `if (!pr)` block inserts the four original rows, the new block adds five rows and two patches.
- **Already-seeded database:** the next `cd server && pnpm db:seed` adds the five rows and fills the two null patches; `./scripts/dev.sh` seeds on every start unless `--no-seed` is passed. A second run changes nothing.
- **Existing flows:** nothing in `01`–`10` asserts a file count or the absence of a file. `05` waits for `src/config.ts`, which stays listed (flat list now, core group from phase 7). `04` waits for `2 findings`; no finding is added. `10` reads the Intent card, which is not on this tab. No flow file changes in this phase.

**Tests (test-writer):**
- Extend `server/test/smart-diff.it.test.ts` — on the seeded PR the route answers nine files: `core` holds the four `src/` files in path order, `tests` holds `src/middleware/ratelimit.test.ts`, `wiring` holds `src/api/public/index.ts` and `tsconfig.json`, `docs` holds `README.md`, `boilerplate` holds `package-lock.json`; `finding_lines` is `[12]` for `src/config.ts` and `[45]` for `src/api/users.ts`; `total_lines` is 285. Read from `pr_files` directly, never through `GET /pulls/:id` (Constraints): the two patches are non-null, start with the hunk headers of Design and do not end with a newline; the other seven are null. A second `seed()` leaves nine rows. After deleting the five new rows and nulling the two patches (the shape of a database seeded before this change), `seed()` restores nine rows and both patches.
- Expected to change: none

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm test`
**Verify (phase):** `cd server && pnpm typecheck && pnpm test && pnpm arch:check`
**Done when:**
- D10 — after `pnpm db:seed` on a fresh database PR #482 has the nine `pr_files` rows of Design → Seed fixture, summing to +247 −38, with patches on `src/config.ts` and `src/api/users.ts` that contain new-side lines 12 and 45.
- D10 — running the seed on a database that holds the four original rows adds the five and fills the two patches, and running it again adds no row.
- `e2e/specs/seed-fixtures.md` states the nine files, their roles, the two patches and the flows that depend on them.
- No `sk_live_` literal in `seed.ts` has 24 or more consecutive letters or digits after the prefix.

### 4 · Client data layer — the smart-diff hook and the strings

The one data path for the new route, and every string the later client phases read. C5 is satisfied from here on by construction.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/lib/hooks/smart-diff.ts` (new) | `smartDiffKeys.pull(prId)` = `["smart-diff", prId]` and `smartDiffKeys.detail(prId, headSha)` = `["smart-diff", prId, headSha]`; `useSmartDiff(prId, headSha)` → `api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`)`, `enabled` only when both are set (D9); types by `import type`; no polling | frontend-ui-architecture, security | struct-one-way, logic-no-server-state-copy |
| `client/messages/en/prReview.json` | Under `smartDiff`: the new keys and the changed `filesCount` value of Design → Strings; every other existing key and value untouched | — | — |

**Tests (test-writer):**
- Add `client/src/lib/hooks/smart-diff.test.tsx` (mocked `fetch`, as `intent.test.tsx`) — `useSmartDiff("pr1", "sha1")` requests `/pulls/pr1/smart-diff` with `GET` and returns the body; it requests nothing when `prId` is null and nothing when `headSha` is null; a new `headSha` for the same PR triggers a new request; `invalidateQueries({ queryKey: smartDiffKeys.pull("pr1") })` refetches the `detail("pr1", "sha1")` query.
- Expected to change: none

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- D9 — `useSmartDiff` sends no request until both the PR id and the head SHA are known, and its key is `["smart-diff", prId, headSha]`.
- C5, D11 — `messages/en/prReview.json` holds every key of Design → Strings under `smartDiff`, with `coreLabel`, `wiringLabel` and `boilerplateLabel` unchanged.

### 5 · `diff-viewer` — findings support behind an optional prop (D7)

The shared viewer learns to draw a finding without knowing where the card comes from. With the prop absent it renders exactly as today, so the skills route and the smoke test are untouched.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/components/diff-viewer/findings.ts` (new) | `DiffFindingApi` exactly as `client/specs/L03-smart-diff.md:83-91`; pure helpers: `isCounted(f)` (`dismissed_at` is null), `findingsForFile(findings, path)`, `findingLineKey(f)` (`RIGHT:<start_line>`, through `lineKey`), `partitionFindings(fileFindings, renderedKeys)` → `{ anchored: Map<string, FindingRecord[]>; unanchored: FindingRecord[] }` in the pattern of `partitionThreads`, `mostSevere(findings)` → the `Severity` of the most severe one or null (`CRITICAL` > `WARNING` > `SUGGESTION`), and a sort that puts the most severe first | frontend-ui-architecture, security | struct-one-way, logic-pure-domain |
| `client/src/components/diff-viewer/FindingDot/FindingDot.tsx` (new) | A dot in `SEV[severity].c` with `role="img"` and `aria-label` from `prReview` `smartDiff.fileHasFindings` | frontend-ui-architecture, react-best-practices, security | split-pure, react-render-side-effect |
| `client/src/components/diff-viewer/FindingDot/index.ts` (new) | Re-export | frontend-ui-architecture, security | struct-one-way |
| `client/src/components/diff-viewer/LineFindingTag/LineFindingTag.tsx` (new) | The `SEV[severity].icon` and the word from `prReview` `smartDiff.lineTag.<SEVERITY>`, coloured with `SEV` | frontend-ui-architecture, react-best-practices, security | split-pure, react-render-side-effect |
| `client/src/components/diff-viewer/LineFindingTag/index.ts` (new) | Re-export | frontend-ui-architecture, security | struct-one-way |
| `client/src/components/diff-viewer/UnanchoredFindings/UnanchoredFindings.tsx` (new) | The end-of-file block: the label `prReview` `smartDiff.findingsOutsideDiff`, then `renderFinding(f)` for each finding, most severe first, each in an element keyed by `f.id`; renders nothing for an empty list | frontend-ui-architecture, react-best-practices, security | split-pure, react-render-side-effect |
| `client/src/components/diff-viewer/UnanchoredFindings/index.ts` (new) | Re-export | frontend-ui-architecture, security | struct-one-way |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx` | New optional props `findings?: DiffFindingApi` and `defaultOpen?: boolean` (initial `open` = `defaultOpen` when given, else the existing `AUTO_EXPAND_MAX_LINES` rule). With `findings`: derive the file's findings and their partition during render; show `FindingDot` after the path when the file has a counted finding (most severe counted one), next to the untouched comment count; pass each line its anchored findings; render `UnanchoredFindings` where outdated comments go, also when the file has no patch, only while `showFindings` is true. Without `findings`: no new element and no `prReview` lookup | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, split-pure, logic-no-effect-derivation, react-hooks-conditional, react-nested-component, react-render-side-effect |
| `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | New optional props for the line's findings and the `DiffFindingApi`. A line with a counted finding gets the left stripe and `LineFindingTag` at the right edge, both from the most severe counted one, kept when `showFindings` is false; while `showFindings` is true every finding of the line (dismissed ones too) is drawn under the line with `renderFinding`, most severe first, keyed by `f.id`, before the GitHub threads. A hunk line draws none | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, split-pure, logic-no-effect-derivation, react-hooks-conditional, react-nested-component, react-render-side-effect |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` | Accepts `findings` and `defaultOpen` and passes them to each `FileCard`; `FileCard` is keyed by `file.path` instead of the array index, because a group's file list can change between fetches | frontend-ui-architecture, react-best-practices, security | split-pure, react-render-side-effect |
| `client/src/components/diff-viewer/styles.ts` | The stripe variant of the line row (a parameter of `lineRowFor`, or a sibling helper), the tag, the dot and the unanchored-block styles; CSS variables only | frontend-ui-architecture, security | — |
| `client/src/components/diff-viewer/index.ts` | Also export the `DiffFindingApi` type | frontend-ui-architecture, security | struct-one-way |

Nothing under `client/src/components/diff-viewer/` imports from `client/src/app/`.

**Tests (test-writer):**
- Add `client/src/components/diff-viewer/findings.test.ts` — `partitionFindings`: a finding whose `RIGHT:<start_line>` is rendered is anchored, one whose line is not rendered or whose file has no lines is unanchored, two findings on one line share a key; `mostSevere` over a mixed list, a single item and an empty list; `findingsForFile` matches the path exactly; `isCounted` is false only for a dismissed finding.
- Add `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (real `shell.json` and `prReview.json` through `NextIntlClientProvider`; `renderFinding` is a test function that renders the finding's title) — no dot without findings, and none for a file that has only GitHub comments; a dot named "File has findings" for a file with a counted finding, while the comment count still shows its own number; no dot when the file's only finding is dismissed, and its card is still drawn; the tag reads `blocker`, `warning` and `suggestion` for the three severities; with two findings on one line both cards are drawn and the tag is the most severe one's; the card is the next thing after the line whose new-side number is `start_line`; a finding whose line is outside the patch, and a finding of a file with no patch, are listed under "Findings outside the diff"; with `showFindings: false` no card and no outside-the-diff block is drawn while the dot and the tag stay; `defaultOpen={false}` starts the card collapsed and a click on the path opens it; without the `findings` prop the output has no dot, tag or block.
- Expected to change: none (`client/src/test/smoke.test.tsx` renders `DiffViewer` without the prop and with `shell` messages only, and must stay unedited and green)

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- A4 — a file card with a counted finding shows a dot whose accessible name comes from `smartDiff.fileHasFindings`, independent of the GitHub comment count.
- B4, D8 — the line at `start_line` has the stripe and the tag `blocker` / `warning` / `suggestion`, taken from the most severe counted finding on that line.
- A5 — `renderFinding` is called for each finding of a line and its result is drawn under that line.
- B6 — a finding whose line is not rendered, or whose file has no patch, is drawn in the end-of-file block.
- D7 — `diff-viewer` imports nothing from `src/app/`, and without the `findings` prop it renders as before.
- C5 — the three new components take their text from `prReview.json`; no label literal is in a `.tsx` file of this phase.

### 6 · Files changed — findings in the list and the single switch

The tab starts drawing the review's findings, in the flat list it has today, with Accept and Dismiss and one switch for comments and findings. Grouping comes next and reuses all of it.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts` (new) | Pure: `findingsOfLatestReviews(reviews: ReviewRecord[]): FindingRecord[]` (the shown findings: newest `created_at` per `agent_id`, null as one agent, the earlier input element on a tie); `countedInDiff(findings, files): number` (counted findings whose `file` is a path of `files`) | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/InlineFinding/InlineFinding.tsx` (new) | Props `finding`, `prId`, `repoFullName`, `headSha`; calls `useFindingAction()` and renders the existing `FindingCard` with `defaultExpanded`, `pending`, the two link props and `onAction={(act) => action.mutate({ findingId: finding.id, action: act, prId })}`, as `FindingsPanel.tsx:99` does; imports `FindingCard` through `@/app/repos/[repoId]/pulls/[number]/_components/FindingCard` | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-no-cross-feature, split-pure, react-render-side-effect, sec-xss |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/InlineFinding/index.ts` (new) | Re-export | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/styles.ts` (new) | `s`: the totals row and its muted text; CSS variables only | frontend-ui-architecture, security, next-best-practices | — |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | Props become `{ prId, pr, repoFullName, canComment }` (`pr: PrDetail` replaces `files` and `filesCount`). Reads `usePrReviews(prId)` and derives the shown findings during render. One switch state for comments and findings, starting `true`; the button is shown when GitHub comments plus `countedInDiff` is above 0 and its label is `smartDiff.hideComments` / `smartDiff.showComments` with that sum; posting a comment sets it to `true`. Passes `commenting` (`showComments` = the switch) and a `DiffFindingApi` (`findings` = shown, `showFindings` = the switch, `renderFinding` returning `<InlineFinding …/>` from a stable callback that calls no hook) to `DiffViewer`. Section label `smartDiff.filesChanged`; under it the totals row with `smartDiff.totals` from `pr.files_count`, `pr.additions`, `pr.deletions`. The three hardcoded strings are gone | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, split-pure, logic-no-effect-derivation, logic-no-server-state-copy, react-hooks-conditional, react-nested-component, react-render-side-effect |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | `<DiffTab prId={prId} pr={pr} repoFullName={repoFullName} canComment={pr.status === "open"} />` | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-server-state-copy, react-render-side-effect |

**Tests (test-writer):**
- Add `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.test.ts` — `findingsOfLatestReviews`: only the newest review of an agent contributes; two agents each contribute their newest; reviews with a null `agent_id` are one agent; dismissed findings are kept in the result; an empty list gives an empty list; the result does not depend on the input order. `countedInDiff`: dismissed findings and findings for a file outside the PR are not counted.
- Add `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx` (hook modules mocked with stable objects, real `prReview.json` and `shell.json`) — a finding of the newest review is drawn under its line with its title, severity and rationale, and a finding of an older review of the same agent is not; a finding whose file is not in the PR is drawn nowhere; the switch is on at first render and reads "Hide comments (N)" with N = GitHub comments + counted findings; turning it off hides the GitHub thread and the finding card together and keeps the dot and the tag; with no comment and no counted finding there is no switch; the totals row reads "N files · +A −D".
- Add `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/InlineFinding/InlineFinding.test.tsx` (real hook, mocked `fetch`, a `QueryClient`) — the card starts open; Dismiss sends `POST /findings/<id>/dismiss` and invalidates `["reviews", prId]`; Accept sends `POST /findings/<id>/accept`; a click on the card's header hides the rationale and leaves the title (C2).
- Expected to change: none (no test renders `DiffTab` today)

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- A5, Q1 — an expanded file on Files changed shows each shown finding under its `start_line` as a `FindingCard` with severity, title and rationale.
- B5 — Accept and Dismiss on an inline card call `useFindingAction` with the PR id, and the card mutes after the reviews query refetches.
- B7, Q2 — one switch, on by default, hides GitHub threads and finding cards together and leaves dots, stripes and tags.
- C2 — a click on an inline card's header collapses it; `FindingCard` has no diff.
- C5 — `DiffTab.tsx` contains none of "Files changed ·", "Show comments", "Hide comments" as a literal.

### 7 · Files changed — groups by role and the order switch

The grouped view itself, on top of the hook of phase 4 and the findings of phases 5–6.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/constants.ts` (new) | `ROLE_META: Record<SmartDiffRole, { color; labelKey; hintKey; startsCollapsed }>` keyed by the exact enum values: core `var(--accent)`, tests `var(--ok)`, wiring `var(--pending)`, docs `var(--text-secondary)`, boilerplate `var(--stale)`; `startsCollapsed` true for `docs` and `boilerplate` only. No list of the role order (Q7); type by `import type` | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts` | Add pure `joinGroups(groups, files)` → `{ groups: { role; files: PrFile[] }[]; ungrouped: PrFile[] }` (response order kept; a response path with no `PrFile` skipped; a `PrFile` missing from the response goes to `ungrouped`) and `groupFindingMark(files, findings)` → `{ files: number; severity: Severity } | null` (number of files with a counted finding and the most severe one; null at 0) | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx` (new) | One group: a `<button type="button" aria-expanded>` header with chevron, a square in the role colour, the label, the muted hint, the findings mark (a dot in the severity colour and the number of files, with the accessible name `smartDiff.filesWithFindings`; absent when the mark is null) and `smartDiff.filesCount`; open state starts `!startsCollapsed`; the body is `DiffViewer` over the group's files with `commenting`, `findings` and `defaultOpen={false}` for a `startsCollapsed` role (D2), `undefined` otherwise | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, split-pure, react-hooks-conditional, react-nested-component, react-render-side-effect |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/RoleGroup/index.ts` (new) | Re-export | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/OrderSwitch/OrderSwitch.tsx` (new) | Two `<button type="button">` elements, `smartDiff.smartOrder` and `smartDiff.originalOrder`, the active one with `aria-pressed="true"`; props `value: "smart" | "original"` and `onChange`; no vendored primitive is edited | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-pure, react-render-side-effect |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/OrderSwitch/index.ts` (new) | Re-export | frontend-ui-architecture, security, next-best-practices | struct-one-way |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/styles.ts` | Group header, role square, hint, findings mark, the segmented switch, the skeleton rows, the muted notice line | frontend-ui-architecture, security, next-best-practices | — |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | Reads the order from `useSearchParams()` (`order=original` → original, anything else → smart) and writes it with `router.replace` on the current pathname, deleting the parameter for smart and keeping every other parameter (D4). Calls `useSmartDiff(prId, pr.head_sha)`. `OrderSwitch` sits at the right of the totals row. Smart order: `Skeleton` rows while the query is pending; on success one `RoleGroup` per non-empty group in response order (D1), then a `DiffViewer` over `ungrouped` with no header; on error the flat list with one muted line `smartDiff.groupingUnavailable`. Original order: the flat list of `pr.files`, no headers, findings kept. No files: the flat `DiffViewer`, which prints the existing "No changed files.". Section label is `smartDiff.groupedByRole` while groups are shown, else `smartDiff.filesChanged` | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, split-pure, logic-no-effect-derivation, logic-no-server-state-copy, react-hooks-conditional, react-nested-component, react-render-side-effect |

**Tests (test-writer):**
- Extend `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.test.ts` — `joinGroups`: files keep the response order inside a group, a response path with no `PrFile` is skipped, a `PrFile` missing from the response lands in `ungrouped`; `groupFindingMark`: two files with five findings give 2, a file whose only finding is dismissed is not counted, the severity is the most severe counted one, no counted finding gives null.
- Extend `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx` (`next/navigation` mocked: `useSearchParams`, `useRouter`, `usePathname`) — five header buttons in the order Core, Tests, Wiring, Docs, Boilerplate, each with its label, hint and "N files" ("1 file" for one); a group with no files has no header; Docs and Boilerplate start with `aria-expanded="false"` and their files are absent, and after a click on Boilerplate `package-lock.json` appears as a collapsed card; the Core header's mark has the accessible name "2 files with findings" and a group without counted findings has no mark; a click on Original order calls `router.replace` with a URL that contains `order=original` and keeps `tab=diff`; with `order=original` in the URL there is no header button, every file is listed in the order of `pr.files`, findings are still drawn, and Original order has `aria-pressed="true"`; a click on Smart order replaces the URL without `order`; while the smart-diff query is pending the totals row and the switch are present and no file is listed; when it fails the flat list is shown with "Grouping is unavailable — showing the original order"; a `PrFile` missing from the response is listed after the last group.
- Expected to change: none

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- A1, D1 — Files changed renders one header per non-empty group in the order the response gives, each with its label from `prReview.json` and its file count.
- A2, D2 — the `docs` and `boilerplate` groups start collapsed and their file cards start collapsed.
- A3 — a group header shows the number of its files that have a counted finding, in the colour of the most severe one, and shows nothing at 0.
- A6, D4 — Original order renders one flat list in the order of `PrDetail.files[]`, the choice is `?order=original` in the URL and survives a reload, and Smart order brings the groups back.
- The tab stays usable when the smart-diff request fails: the flat list plus `smartDiff.groupingUnavailable`.
- C5 — a search of the `DiffTab` folder's `.tsx` files finds no group label, hint or order label as a literal.

### 8 · e2e — the grouped tab on seeded data

One flow over the client ↔ API ↔ database seam, on the nine seeded files, read-only and with no model call. Before the P3 phase, so the P1 and P2 behaviour is proven in a browser first.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| Nothing — test-writer only | | | |

**Tests (test-writer):**
- Add `e2e/specs/11-pr-smart-diff.flow.json` — open `{BASE}/`, `wait --url /pulls`, `wait --text` the seeded PR title, click it, `wait --url /pulls/482`, `wait --load networkidle`; `find role button click --name "Files changed"`, `wait --url tab=diff`; `wait --text "Smart Diff · grouped by role"`; then, in reading order, `wait --text` for `The substance of the change`, `Checks for the change`, `Hooks the core into the app`, `Explains the change`, `Generated or mechanical`; `wait --text "src/config.ts"`; `wait --text "Hardcoded Stripe secret key in commit"` (the finding under line 12); `wait --text "blocker"` (the line tag); `find role button click --name "Boilerplate"` then `wait --text "package-lock.json"` (the group was collapsed: a click on an open group would hide the file and the wait would time out); `find role button click --name "Original order"`, `wait --url order=original`, `wait --text "README.md"` (in smart order the docs group is collapsed, so this text exists only in the flat list); `find role button click --name "Smart order"`, `wait --text "Generated or mechanical"`. Every click is preceded by a `wait --text` for its target's text. No click on Accept, Dismiss or Run Review: the seeded data stays as the other flows expect it.
- Expected to change: none — `e2e/specs/05-pr-diff.flow.json` stays unedited and must pass: `src/config.ts` is a core file and core starts expanded.

**Verify (phase):** `cd e2e && npm run typecheck && npm run e2e:hermetic`
**Done when:**
- Flow `11-pr-smart-diff` passes in the hermetic run: the five group hints, the seeded finding under `src/config.ts`, `package-lock.json` after expanding Boilerplate, and the round trip through `order=original`.
- Flows `01`–`10` pass in the same run with no edit to their files.

### 9 · P3 — the "no review yet" line and the refresh after a run (C3, C4)

Two independent items, last so they can be cut. The C3 row and the C4 rows share no file. C4 has two parts: the smart-diff queries are invalidated wherever the reviews query already is, and the page refreshes when the PR's active runs become empty, whatever tab the user is on (Q5). The strings exist since phase 4.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | **C3** — when the reviews query has answered with an empty list, one muted line `smartDiff.noReviewYet` under the totals row, in both orders; not shown while the query is loading | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-effect-derivation, react-render-side-effect |
| `client/src/lib/hooks/reviews.ts` | **C4** — (1) `useFindingAction` (when `prId` is given), `useDeleteRun` and `useDeleteReview` also invalidate `smartDiffKeys.pull(prId)` in `onSuccess`, next to their `["reviews", prId]` line. (2) New pure export `runsJustSettled(previous, current)`: true only when `previous` is a number above 0 and `current` is 0. (3) New hook `useRunSettledRefresh(prId)` as in Design → "Refresh after a run": a stable refresh function over the five keys; the watcher over `usePrActiveRuns(prId).data?.length`, with the previous count and its `prId` in a `useRef` that is written only inside the effect; no `useState`; no call during render. `intentKeys` is imported from `./intent` and `smartDiffKeys` from `./smart-diff`; neither of those files imports `reviews.ts` | frontend-ui-architecture, security | struct-one-way, logic-pure-domain, logic-no-effect-derivation, logic-no-server-state-copy |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | **C4** — `const refreshAfterRun = useRunSettledRefresh(prId)`, called next to `usePrActiveRuns` and above every early return; `onRunDone={refreshAfterRun}`. Removed: the inline body of `onRunDone`, `invalidateRunHistory`, the `refetch: refetchReviews` binding and the `intentKeys` import. Kept: `invalidateActiveRuns` for `onRunsStarted`, and every other line | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-server-state-copy, logic-no-effect-derivation, react-hooks-conditional, react-render-side-effect |

**Tests (test-writer):**
- Extend `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx` — **C3**: a PR with no review shows "No review has run yet — findings appear here after Run Review", no dot and no group mark; a PR with a review does not show the line; the line is absent while the reviews query is loading. **C4**: when the mocked reviews data changes from no review to a review with a finding in a core file, the file's dot and the Core header's mark appear in the same mounted tab, and the "no review yet" line goes.
- Extend `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/InlineFinding/InlineFinding.test.tsx` — **C4**: after Dismiss succeeds, the `["smart-diff", prId]` queries are invalidated as well as `["reviews", prId]`.
- Add `client/src/lib/hooks/reviews.test.tsx` (mocked `fetch` answering by URL, a `QueryClient` whose `invalidateQueries` is spied; as `intent.test.tsx`) — **C4**: `runsJustSettled` is true for `(2, 0)` and false for `(undefined, 0)`, `(undefined, 2)`, `(0, 0)`, `(2, 1)`, `(0, 2)` and `(2, undefined)`. `useRunSettledRefresh("pr1")`: a first answer with an empty active list invalidates nothing; a first answer with a running run invalidates nothing; after the active list goes from one run to none (the test changes the `fetch` answer and invalidates `["pr-active-runs", "pr1"]`) the keys `["reviews", "pr1"]`, `["pr-runs", "pr1"]`, `["pr-intent", "pr1"]`, `["smart-diff", "pr1"]` and `["pr-active-runs", "pr1"]` are each invalidated, and `["reviews", "pr1"]` exactly once after everything settles (the refresh's own re-read of the empty list does not fire it again); a second run that starts and ends fires it once more; rerendering with another `prId` whose list is empty, after a `prId` whose list was not, invalidates nothing; the returned function invalidates the same five keys when called and nothing when `prId` is null. `useDeleteRun` and `useDeleteReview` each invalidate `["reviews", prId]` and `["smart-diff", prId]` on success; `useFindingAction` without a `prId` invalidates neither.
- Expected to change: none (no test renders `page.tsx` or imports the three mutation hooks unmocked today)

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test` · `cd e2e && npm run e2e:hermetic`
**Done when:**
- C3 — a PR with no review shows the `smartDiff.noReviewYet` line and no counter with a zero.
- C4 — the success of `useFindingAction`, `useDeleteRun` and `useDeleteReview` invalidates the PR's smart-diff queries.
- C4, Q5 — when the PR's active runs go from non-empty to empty, the page refreshes the reviews, the run history, the intent and the smart-diff queries, on any tab; `onRunDone` runs the same function.
- C4 — the refresh does not run on a first load whose active list is empty, and runs once per transition.
- C4 — `useRunSettledRefresh` uses no `useState`, and `page.tsx` holds no copy of the active-runs list.
- Every flow, `11` included, passes in the hermetic run after this phase, with no edit to a flow file.

## Out of scope
- **C1, the sticky group header** (Q6): no sticky style on the group header, no measurement of the PR header, no change to `PrDetailHeader`.
- Everything else the umbrella spec excludes (`specs/L03-smart-diff.md:52-56`): `pseudocode_summary`, a real `split_suggestion`, the L08 prompt filter, classification by content or by a model, pattern overrides, a position column in `pr_files`, any change to the Agent runs tab.
- Any change to the patterns or their order (Q3); adapting them to this repository.
- A `ports.ts` for the `smart-diff` module; a getter in `platform/container.ts`; a rate-limit override or a response schema on the route.
- Making `PullsRepository.saveDetail` transactional, adding `ORDER BY` to `storedFilesAndCommits`, or any other change to the `pulls` module (Q7).
- Any edit to `FindingCard`, `FindingsPanel`, `FindingsTab`, `RunStatus`, `ReviewRunAccordion`, or under `client/src/vendor/ui`; a segmented-control primitive in the kit.
- Removing the SSE path of `onRunDone` now that the page-level refresh exists; changing the polling interval of `usePrActiveRuns`; invalidating the PR list after a run (it catches up on its own, `client/docs/data-flow.md:74-75`).
- Turning the `FileCard` header into a `<button>`, auto-expanding a file because it has a finding, drawing a finding's line range (`end_line`), a finding on the old side of the diff.
- Moving the strings `diff-viewer` already hardcodes or keeps in `shell.json` ("Add a comment on this line" in `CodeLine.tsx:49-50`, the `diffViewer.*` keys), and the toast fallback text in `DiffTab.tsx:37`: none is a Smart Diff label.
- Patches for the seven seeded files that have no finding; any new seeded finding or review.
- A browser assertion of header order; a flow that presses Accept, Dismiss or Run Review, so the page-level refresh has no flow (it needs a review run, which needs a model).
- Documentation text. After the last phase `doc-writer` updates: `server/README.md` (API map: the `smart-diff` route), `server/docs/architecture.md` (the table of which module reads or writes which tables: `smart-diff` reads `pull_requests`, `pr_files`, `reviews`, `findings` and writes none), `client/docs/data-flow.md` (the `["smart-diff", prId, headSha]` row and what invalidates it; "A live review run, end to end", steps 4–5: the page-level refresh when the active runs become empty; "Example: accepting a finding": the smart-diff key is invalidated too), `client/docs/ui-architecture.md` (URL state: `order`), `client/README.md` (route map, if it lists query parameters), `e2e/README.md`, `e2e/specs/README.md` and `e2e/docs/coverage-strategy.md` (flow `11`), and the status of the three spec rows. A short `README.md` for `server/src/modules/_shared/file-role/` is its call, since L08 will reuse the classifier.

## Risks
- **The seed block inserts duplicates on a re-run.** — `pr_files` has no unique index, so the block inserts only paths it did not find; phase 3 pins "a second `seed()` leaves nine rows".
- **A smart-diff integration test wipes the seeded files.** — `GET /pulls/:id` with the GitHub mock replaces them; the phase 3 test line forbids that call and reads the table directly.
- **A secret scanner or GitHub push protection reads the seeded `sk_live_` line as a key.** — the placeholder has no run of 24 letters or digits after the prefix; phase 3 has a Done-when line for it.
- **A grouping request lands between the delete and the insert of a detail refresh and reads no files.** — accepted (Q7): the client join lists every `PrFile` missing from the response after the last group, so no file disappears, and the next fetch heals it.
- **`diff-viewer` reads the `prReview` namespace.** — only inside three leaf components that render when findings are passed (Q7), so the skills route and `smoke.test.tsx` (which provide `shell` only) never look it up; the phase 5 test line pins that the smoke test stays unedited.
- **`/pr-self-review` reports `renderFinding` as a render factory.** — `react-best-practices` flags `renderThing()` functions; the rule is not in its `critical_rules`, so it is a WARNING at most, and D7 stands (Q7). The function returns a real component element with a stable identity and calls no hook.
- **GitHub comments are now shown by default.** — intended (Q2); the only reader of the old default was `DiffTab` itself, and no test or flow depended on it.
- **Index keys in `DiffViewer` attach a card's open state to the wrong file when a group's list changes.** — phase 5 keys `FileCard` by path.
- **The page-level refresh fires twice at the end of a run watched on the Agent runs tab.** — once from the SSE signal and once from the poll; both are idempotent invalidations, the second re-read of the active list is `0 → 0` and ends it (Design → "Refresh after a run"); phase 9 pins "exactly once after everything settles" for the watcher and "no fire on first load".
- **The watcher fires up to one polling interval (4 s) after the run ends when the user is not on the Agent runs tab.** — accepted: it replaces "never, until a reload".
- **`page.tsx` has no component test, so its wiring is checked by reading.** — the page holds one hook call and one prop; everything that can go wrong is inside `useRunSettledRefresh`, which phase 9 tests with a real `QueryClient`.
- **The refresh replaces `refetchReviews()` with an invalidation of `["reviews", prId]`.** — the same request for an observed query; the page observes it on every tab.
- **Integration files skip silently and look green.** — a phase is not closed on a run that prints `skipped` for `smart-diff.it.test.ts` (`server/INSIGHTS.md:167-187`).
- **The client `typecheck` covers test files.** — no existing test renders `DiffTab` or `page.tsx`, so phases 6, 7 and 9 should leave it clean; the implementer's bar is "clean outside test files".
- **The hermetic run rewrites `client/.next` under a running dev server.** — stop `pnpm dev` before phases 8 and 9, or clear `client/.next` afterwards (`e2e/INSIGHTS.md:65-80`).
- **On a machine with a GitHub token the API asks GitHub for `acme/payments-api#482`.** — as today: the call fails and the persisted detail is served; flow `05` already depends on that.
- **The planner ran nothing.** — the fixture sums (+247 −38), the two hunk headers, the classification of the nine seeded paths and the no-loop argument for the refresh were derived by reading; phase 1's rows for the seeded paths, phase 3's `total_lines: 285` and phase 9's "exactly once" assertion catch a slip.

## Resolved
The nine open questions of revision 1, as answered by the user on 2026-10-06 (`specs/L03-smart-diff.md:168-174`).

1. **Namespace of `diff-viewer`'s new strings** — as recommended (Q7): the three labels are read from `prReview.smartDiff` by leaf components that render only when findings are passed. Phase 5.
2. **Sticky offset (C1)** — option (c) (Q6): C1 is not built. Phase 10 of revision 1 is removed; nothing touches `PrDetailHeader`.
3. **Does `DiffFindingApi.findings` include dismissed findings?** — as recommended (Q7): it holds every shown finding, dismissed ones included, and the viewer derives the marks from the non-dismissed ones. Phases 5 and 6.
4. **A role-order list in the client** — as recommended (Q7): none; groups are rendered in the order the response carries. Phase 7.
5. **"1 file" and the key for "Files changed"** — as recommended (Q7): `filesCount` keeps its key and becomes a plural form; `filesChanged` is the section label of the flat list. Phases 4, 6 and 7.
6. **`renderFinding` and the render-factory rule** — as recommended (Q7): it stays a function (D7); a non-blocking WARNING from `/pr-self-review` is expected and accepted.
7. **Header order in the flow** — as recommended (Q7): the flow asserts that the five headers are present; their order is pinned by the `DiffTab` test and the server integration test. Phase 8.
8. **C4 only on the Agent runs tab** — option (b), fix it (Q5): the page refreshes when the PR's active runs become empty, on any tab. Phase 9.
9. **A grouping request inside a detail refresh** — as recommended (Q7): accepted; such files are listed ungrouped until the next fetch, and the `pulls` module is not changed.

## Open questions
None.

## Delivery

Not phases; done by the user and the main session after phase 9 (or after phase 8, if phase 9 is cut).

- **Workflow** (`.claude/agents/README.md`, Feature workflow): save this plan verbatim as `specs/L03-smart-diff-plan.md` and keep its row in `specs/README.md`; per phase run `implementer`, then `test-writer`, and commit the closed phase; then `plan-verifier` (the branch is cut from `origin/main`, so no base ref is needed) and `architecture-reviewer` in parallel; then `doc-writer` with the list under Out of scope; record the insight candidates; run `/pr-self-review` and push only on a pass verdict. The three spec files and the `specs/README.md` rows that are still uncommitted belong in the first commit.
- **A7 — test PR** (the user, in the fork, added to DevDigest as a repository): at least one lock file, one logic file under `server/src/` or `client/src/`, one test, one config or barrel file and one Markdown file, so that all five groups appear; after Run review, at least one finding in a core file.
- **A7 — demo video, 1–3 minutes** (the user): the script at `specs/L03-smart-diff.md:151-155`. With phase 9 built, the marks appear on Files changed within a few seconds of the run ending even when the user returns to that tab while the run is in flight; without phase 9, wait on Agent runs for the run to end before returning.
- **B8 — PR description** (the main session): what each agent did per phase, what `plan-verifier` found and how each gap was closed, the nine answers under Resolved (C1 not built among them), and whether phase 9 was built or cut.
- **Acceptance** — the checklist at `specs/L03-smart-diff.md:196-220`, walked on the test PR and on the seeded PR #482 after a fresh `pnpm db:seed`.
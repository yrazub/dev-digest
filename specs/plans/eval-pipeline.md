# Implementation Plan: Eval Pipeline (L06 homework)

**Goal:** Turn accepted and dismissed findings into per-agent eval cases, replay an agent on its case set in the background with a stored configuration snapshot, score each run in code only (recall, precision, citation accuracy), and show the results in an Evals tab, an Eval Dashboard and a Compare modal. `./scripts/verify-l06.sh`, run from the repository root, proves the result with no key and no model call. · **Packages:** server, client, e2e, plus one repository-root file (`scripts/verify-l06.sh`; there is no root `package.json`) and the client's synced contract copy. `reviewer-core` and `mcp` do not change. ·
**Spec:** `specs/eval-pipeline.md` (SPEC-2026-10-31-eval-pipeline), `server/specs/eval-pipeline.md`, `client/specs/eval-pipeline.md`, all `Status: approved` · **Execution mode:** multi-agent ·
**Review answers** (`.devdigest/sdd/eval-pipeline/review.md`; every recommended answer accepted):
- Q1 → `AgentsService` moves to narrow dependencies. `AgentsRepository.deleteById` deletes the agent's `eval_cases` and the agent in one transaction. `pnpm arch:baseline` drops the `agents/service.ts` entry.
- Q2 → the boot reap is a second awaited call in the existing `try` of `server/src/app.ts`, made through the eval module's own repository. `ReviewService` is not touched.
- Q3, Q4, Q6, Q9 and F18 → already in the specs: the recharts trend, `formatCostUsd`, the renamed test files and selection, the slug trim, and the "hunk lines" wording.
- Q8 (the root `.npmrc` fallback) → superseded by the user's decision of 2026-11-01, after phase 14 was blocked. On pnpm 12.4.2 a root `package.json` makes `pnpm verify:l06` install the root project, writing `node_modules/` and `pnpm-lock.yaml` at the root, and the `.npmrc` fallback does not prevent it. There is no root `package.json` and no root `.npmrc`. The command is `./scripts/verify-l06.sh`, which calls pnpm and npm only inside each package. The spec change goes through `spec-creator` (R-SRV-44, AC-95–AC-97).
- Q5 → the checkboxes are native `<input type="checkbox">` elements.
- Q7 → `verify-l06.sh` runs the eval `.it` files with `--no-file-parallelism` and fails when vitest reports any skipped test.
- Q10 → `cases_total` is the snapshot taken at start. A run whose cases were all deleted ends `done` with null metrics. Aggregates are computed from the stored rows.
- Q11 → each checkbox `aria-label` uses the fixed format `YYYY-MM-DD HH:mm · v<n>` in local time.
- R1–R9 accepted:
  - R8 (report handoff): `implementer`, `test-writer` and `doc-writer` save their full reports under `.devdigest/sdd/eval-pipeline/reports/`.
  - Run `/execute-plan` with `--per-chat 3`.
  - R9: the screenshot rows of phases 9–13 need the user's `./scripts/dev.sh` running.
  - The seed test is `server/test/eval-seed.it.test.ts`.

**Assumptions:**
1. **Error message text.** The backticks in the spec's message texts only mark placeholders. The literal messages are:
   - `No diff available for ${file}`
   - `An eval run takes at most 50 cases; this agent has ${n}`
   - `All ${n} cases failed: ${firstError}`
   - `No API key for ${provider}. Add it in Settings.`
   - For the 409 (the spec gives only its code): `An eval run of this agent is already running`.
2. **"Hunk lines" (R-SRV-4).** This counts every line of the file section that belongs to a hunk: each `@@` header plus its body lines. The stored section is normalised to exactly `diff --git a/<f> b/<f>`, `--- a/<f>`, `+++ b/<f>` and the hunks, so git's `index …` and mode lines are dropped (R-SRV-3 lists only those three header lines).
3. **Local controls instead of vendored ones.** The vendored `IconBtn` has no `disabled` and no `aria-expanded` (`client/src/vendor/ui/primitives/IconBtn.tsx:4-18`). So the case row's Delete and expand controls are native `<button>`s styled like `IconBtn` (26×26, `aria-label`). The vendored `Drawer` has no Esc handling and uses other colours (`client/src/vendor/ui/kit/Drawer.tsx:20-38`), so the run drawer is a local panel. Both follow the same generic reading the user accepted in Q5.
4. **FindingCard eval-control precedence.** Order: saved this session → in eval set → no agent → open (no decision) → pending → ready.
5. **Sparklines.** The vendored `Sparkline` takes `number[]` and divides by `length − 1` (`client/src/vendor/ui/charts/Sparkline.tsx:15-19`). Null points are dropped, and a single point is repeated once so a flat line is drawn.
6. **Trend data.** The trend chart and the metric-card sparklines draw the done runs among the runs loaded on the agent view: the newest 20, plus each "Show more" page.
7. **No separate eval-cases port for agent delete.** Q1's one-transaction `deleteById` already performs the cascade. `AgentsService` gets `{ repo, llm }`.
8. **Zero cost delta.** A cost delta of 0 renders as `±$0.0000`. A non-zero delta renders as the sign (`+` or `−`) followed by `formatCostUsd(|Δ|)`.
9. **Compare state lives in the URL.** The modal is open exactly while `?compare=` names two valid runs. Open = `router.replace` that adds the parameter; close = `router.replace` that removes it. "Open once" (R-WEB-53) then holds with no effect.

## Context read
| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` | No monorepo workspace. Contracts are defined once in `server/src/vendor/shared` and the client copy is synced. Do not touch: migrations, lock files, `client/src/vendor/**`. Per-package package managers. |
| `server/CLAUDE.md` | Module layout (`routes.ts` · `service.ts` · `repository/<aggregate>.repo.ts`), schema-first routes, test naming (`test/<module>-<topic>.test.ts`, `.it.test.ts`), the split test commands, and "do not add a second reaper". |
| `client/CLAUDE.md` | Pages stay thin. Data goes only through `src/lib/hooks/<resource>.ts`. Strings go through `next-intl` (`messages/en/<ns>.json`). The client takes type-only imports from `@devdigest/shared`. Component folder naming. |
| `reviewer-core/CLAUDE.md` | The engine is pure and is consumed only through `src/index.ts`. Nothing in it changes. |
| `e2e/CLAUDE.md` | Flows are JSON. `wait` steps are the assertions. Deterministic locators only. Seeded read-only data. `npm run e2e:hermetic`. |
| `TESTING.md` | server-unit vs server-integration (`*.it.test.ts`, which self-skip without Docker); client jsdom with `fetch` mocked; e2e over seeded data with no LLM. |
| `specs/eval-pipeline.md` + the two module specs | Every criterion cited below, the contract shapes (server spec "Contracts"), the run order, the seeded fixture, the verification selection, and the client Layout and Strings. |
| `.devdigest/sdd/eval-pipeline/review.md`, `discovery.md` | The answers and recommendations applied here. |
| `.claude/skills/pr-self-review/routing.json` | Skills and `critical_rules` per file glob. |
| `.claude/skills/onion-architecture/SKILL.md` | The placement table (`:33-41`), rule IDs (`:54-115`), and "touching legacy" (`:132`, now: touching = migrate + re-baseline). |
| `.claude/skills/frontend-ui-architecture/SKILL.md` | Rule IDs (`:68-133`) and the placement questions (`:36-42`). |
| `server/.dependency-cruiser.cjs`, `server/.dependency-cruiser-known-violations.json` | The composition root (`:12`), `dep-domain-framework-free` (`:18-27`), `db-only-in-repository` (`:52-63`), `dep-no-cross-module` (`:66-73`), `di-narrow-deps` (`:82-89`). The baseline entry for `agents/service.ts` is at `:189-199`. |
| `server/src/modules/brief/{routes,service,ports}.ts` | The pattern copied for the new module: construction in `routes.ts`, narrow deps, structural ports, `ConfigError` → 400 `AppError`, an in-flight async wrapper, `req.log` passed in, the per-route rate-limit const. |
| `server/src/modules/agents/{service,routes,repository}.ts`, `server/src/platform/container.ts` | `AgentsService(container)` (`service.ts:57`), the route construction (`routes.ts:72`), `deleteById` (`repository.ts:76-82`), `container.agentsRepo` (`container.ts:113-115`), `container.llm` (`:236-244`). |
| `server/src/modules/reviews/{helpers,domain,diff-loader,run-executor}.ts`, `repository/skill.repo.ts` | `taskLine` (`helpers.ts:56-66`), `renderSkillBlocks` (`domain.ts:21-35`), the patch rebuild (`diff-loader.ts:33-44`), the enabled-linked-skills query (`skill.repo.ts:12-19`), and the run-executor imports (`run-executor.ts:9,11`). |
| `reviewer-core/src/review/run.ts`, `src/index.ts` | `ReviewInput` (`:57-125`), `ReviewOutcome` (`:127-153`), and `onEvent` emitting model text (`:167-168`). `reviewPullRequest`, `ReviewInput` and `ReviewOutcome` are exported (`index.ts:45-51`). |
| `server/src/app.ts` | The boot reaper's `try` block (`:81-86`). |
| `server/src/db/schema/eval.ts`, `server/src/db/schema.ts` | The current eval tables (`eval.ts:7-35`) and the `schema` object that lists every table (`schema.ts:44`, `:57-100`). |
| `server/src/db/seed.ts` | `SMART_DIFF_PATCHES` (`:45-60`), the `if (!pr)` block (`:212-312`), the seeded agents (`:516-579`), the skill links (`:581+`), `return` (`:679`). |
| `server/src/adapters/mocks.ts` | `MockLLMProvider` (`:54-121`) and `MockGitClient.diff` (`:286-330`). |
| `server/test/contracts-sync.test.ts`, `agents-versions.it.test.ts:167`, `reviews-helpers.test.ts`, `reviews-domain.test.ts` | Existing tests the phases touch or must keep green. |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/{FindingCard,FindingsPanel,ReviewRunAccordion,DiffTab}/**` | FindingCard props and action row (`FindingCard.tsx:27-43`, `:97-118`). FindingsPanel takes findings only (`:15-25`). The accordion owns `review` (`:161-166`). DiffTab's `renderFinding` (`:81-87`). InlineFinding (`:10-33`). |
| `client/src/app/agents/_components/AgentEditor/*`, `client/src/components/app-shell/nav.ts` | `TABS` (`constants.ts:11-15`), the tab switch and Config fallback (`AgentEditor.tsx:23-27`), `APP_NAV` Skills Lab (`nav.ts:30-37`). |
| `client/src/lib/{api,format-cost}.ts`, `client/src/lib/hooks/brief.ts` | `ApiError.code` (`api.ts:8-16`), the 204 handling (`:62`), `formatCostUsd` (`format-cost.ts:2-7`), and the hook/key-factory shape. |
| `client/src/vendor/ui/{primitives/Button,primitives/IconBtn,kit/Modal,kit/Drawer,charts/Sparkline}.tsx`, `icons.tsx` | `Button` spreads `...rest` (so `aria-describedby` works). The other limits are in Assumption 3. All needed icons exist. |
| `client/package.json:25` | `recharts` is already a dependency, so the plan adds no new dependency. |
| `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/INSIGHTS.md`, root `INSIGHTS.md` | Entries cited under Constraints. |

## Constraints
- **Architecture:** a module never imports another module, not even `import type`. The eval module reaches `reviews` and `agents` through `_shared/`, the container, or its own structural ports — `server/.dependency-cruiser.cjs:66-73`, `server/INSIGHTS.md:104-110`.
- **Architecture:** a `_shared/` helper takes structural input and imports nothing from `src/db` — `server/INSIGHTS.md:53-58`.
- **Architecture:** `modules/<m>/domain.ts` imports no `db`, `platform`, `adapters`, service, repository or route — `server/.dependency-cruiser.cjs:18-27`. `eval/domain.ts` additionally imports **only** `@devdigest/shared`, because `eval-scorer-purity.test.ts` scans it (R-SRV-24, R3).
- **Architecture:** new services get narrow dependencies, and a service one module uses is built in that module's `routes.ts` — `.claude/skills/onion-architecture/SKILL.md:35`, `:44`; `server/src/modules/brief/routes.ts:21-29`.
- **Architecture:** a task that edits a baselined service migrates it and re-runs `pnpm arch:baseline` in the same change (this applies to `agents/service.ts`) — `.claude/skills/onion-architecture/SKILL.md:132`; root `INSIGHTS.md:503-505` (**Skill:** `onion-architecture`).
- **Architecture:** a route handler calls exactly one service method (`edge-thin-routes`). The 201/200 choice for case creation is the only edge logic.
- **Architecture:** a JSON column is parsed with its contract when it is read, in the repository: `expected_output` with `EvalExpectation`, `input_meta` with `EvalCaseMeta`, `skills` with `z.array(EvalSkillRef)`, `actual_output` with the result's `actual_output` schema (`zod-parse-at-boundary`). A repository returns contract types, never `$inferSelect` rows.
- **Architecture:** a missing provider key is a `ConfigError` (500) from `container.llm`. The eval service maps it to `AppError('eval_unavailable', …, 400)` itself — `server/INSIGHTS.md:60`, `server/src/modules/brief/service.ts:122-131`.
- **Architecture:** the client imports only types from `@devdigest/shared`. Enum values the UI needs are spelled out locally — `client/INSIGHTS.md:137-148`.
- **Security (NFR-5):**
  - The executor never passes `onEvent` to `reviewPullRequest()`, because events carry model text (`reviewer-core/src/review/run.ts:167-168`).
  - Log lines carry ids, counts, durations and error messages only.
  - Every pull-request, case, finding, prompt or model text renders as React text nodes. No `Markdown`, no `SafeMarkdown`, no `dangerouslySetInnerHTML`.
  - Route ids are `IdParams` (uuid) and every query is scoped by `workspace_id`.
- **Insights:** a promise left running after the response must never reject unhandled. Use an async wrapper with `try/finally`, never `.finally()` on a stored promise — `server/INSIGHTS.md:308-312`, `server/src/modules/brief/service.ts:133-143`.
- **Insights:** timing and concurrency over a model call are tested with a `ScriptedLLM`-style subclass of `MockLLMProvider` (a gate promise plus a started promise) — `server/INSIGHTS.md:12`.
- **Insights:** a per-route rate limit is proven with `NODE_ENV: 'production'`, `API_RATE_LIMIT_MAX: '10000'`, an unreachable `DATABASE_URL`, and a probe that fails param validation (422 ten times, 429 on the 11th) — `server/INSIGHTS.md:116-117`, `server/test/brief-rate-limit.test.ts`.
- **Insights:** an `.it` test that builds the app passes `MockSecretsProvider` and `MockGitHubClient`; otherwise it reads the developer's real keys — `server/INSIGHTS.md:157`.
- **Insights:** the default workspace holds the seeded agents, and from phase 7 on "Security Reviewer" holds seeded eval cases and runs. Eval `.it` tests other than the seed and overview tests create their own agents (in a fresh workspace where counts matter) — `server/INSIGHTS.md:124`.
- **Insights:** seed blocks live outside `if (!pr)`, never overwrite a row, and their test counts rows after a second `seed()` — `server/INSIGHTS.md:46-51`, `:73-77`, `:125`.
- **Insights:** `pnpm db:generate` hangs on an interactive rename prompt only when a column is dropped. This change only adds columns and a table. If it still prompts, run it under `expect`, answering Enter — `server/INSIGHTS.md:150-156`.
- **Insights:** run the integration lane with `--no-file-parallelism`. Never start a second test command, in any package, while a server run is in flight — `server/INSIGHTS.md:248-269`, `:295-306`. The `.it` lane also needs `cd mcp && npm ci` once (`mcp-stdio.it.test.ts`) — `TESTING.md:127-128`.
- **Insights:** `pnpm typecheck` in `server/` never checks `test/**` — `server/INSIGHTS.md:83-84`. The client's `typecheck` does check tests, and a vitest path filter that contains brackets matches nothing — `client/INSIGHTS.md:92-96`.
- **Insights:** pnpm ≥10 verifies dependencies before running a script and can install or write lock and workspace files — root `INSIGHTS.md:416-431`.
- **Insights:**
  - Native checkbox instead of the vendored `Checkbox` — `client/INSIGHTS.md:60`.
  - The vendored `Tabs` are plain `<button>`s — `:61`.
  - A component that starts reading the router or the query client needs `next/navigation` mocked and a `QueryClientProvider`; a hooks-module mock spreads `vi.importActual` — `:49-55`.
  - A polling hook is tested by changing the `fetch` answer and calling `qc.refetchQueries` — `:97-101`.
  - Mutation mocks return one stable object — `:150-165`.
  - State-dependent styles are functions returning complete objects, never a shorthand plus longhand — `:177-181`.
  - In ICU, a straight apostrophe before `{` starts a literal — `:103`.
  - Pass `now` to `NextIntlClientProvider` for deterministic relative times — `:72`.
  - The vendored primitives fix their own sizes — `:65`.
- **Insights:** a screen phase carries a `Verify (manual, screenshots)` line against the decoded design values, run by a short-lived sub-agent — root `INSIGHTS.md:475-480`.
- **Insights (e2e):**
  - `find --name` is a case-insensitive substring match that takes the first hit, and `find` does not wait, so `wait --text` comes first — `e2e/INSIGHTS.md:24-28`, `:35-40`.
  - A negative wait goes after a positive one — `:46`.
  - Stop the user's dev stack, or use a separate worktree, before `e2e:hermetic` — `:90-99`.
  - `e2e/specs/README.md` is exempt from "do not touch README" — root `INSIGHTS.md:469-473`.
- **Workflow (R8, this run only):**
  - `implementer`, `test-writer` and `doc-writer` save their full report to `.devdigest/sdd/eval-pipeline/reports/phase-<n>-<agent>.md` (git-ignored, `.gitignore:21`). They return only: the status line, Deviations, the Verification lines, the "Existing tests failing" table, the insight candidates, and the report path.
  - `test-writer` receives the implementer report's path.
  - `/execute-plan` runs with `--per-chat 3`.
  - The main session never starts the stack. Before the screenshot rows of phases 9–13 it asks the user to run `./scripts/dev.sh`. After phase 7 the stack must be restarted, because `dev.sh` migrates and seeds (`scripts/dev.sh:91-95`).
- **Do not touch:**
  - `server/src/db/migrations/**`. The 0017 files come only from `pnpm db:generate`.
  - Every lock file. No dependency is added.
  - `client/src/vendor/**`, except the synced `contracts/eval-pipeline.ts` copy and the one export line in `client/src/vendor/shared/index.ts` (phase 1).
  - `server/package.json` (skip-worktree).
  - `.github/workflows/**`.
  - The repository root gets no `package.json`, `.npmrc`, `pnpm-workspace.yaml`, lockfile or `node_modules/` (user decision 2026-11-01, Q8 superseded).
  - `reviewer-core/**`, `mcp/**`, `evals/**`.
  - `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`.
  - `server/src/modules/reviews/{diff-loader,run-executor,service}.ts` and `reviews/repository/skill.repo.ts` (R1, R2).
  - Every `CLAUDE.md`, `README.md`, `TESTING.md` and `docs/**`: doc-writer writes those after verification. Exceptions: `e2e/specs/README.md` and `e2e/specs/seed-fixtures.md` (phase 15).

## Phases

### 1 · Contracts — server shared + client copy (`server`, client copy)

This phase defines every eval contract once and copies the file byte for byte into the client, so every later phase types against it. It comes first because it is the API boundary.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/vendor/shared/contracts/eval-pipeline.ts` (new) | Every schema in the server spec section "Contracts", exactly as written, each with a same-named inferred type. Imports use `.js` suffixes: `Severity`, `FindingCategory` from `./findings.js`; `EvalCase`, `Provider`, `ReviewStrategy` from `./knowledge.js`; `EvalRunRecord` from `./eval-ci.js`. | onion-architecture, zod, security | dep-domain-framework-free |
| `server/src/vendor/shared/index.ts` | Add `export * from './contracts/eval-pipeline.js';` after the `eval-ci.js` line. | onion-architecture, zod, security | dep-domain-framework-free |
| `client/src/vendor/shared/contracts/eval-pipeline.ts` (new) | A copy: byte-identical sync of the server file. No other edit. | — (excluded from routing) | — |
| `client/src/vendor/shared/index.ts` | A copy of the same single export line, in the same position. No other edit. | — (excluded from routing) | — |

**Tests (test-writer):**
- Extend `server/test/contracts-sync.test.ts`: `eval-pipeline.ts` joins the `it.each` list next to `brief.ts` and `review-api.ts`.
- Add `server/test/eval-contracts.test.ts`:
  - `EvalExpectation` rejects `start_line > end_line`, `start_line: 0` and an empty `file`, and accepts both kinds;
  - `EvalSuiteRun` parses with `recall`, `precision`, `citation_accuracy` and `cost_usd` all null;
  - `EvalCaseRecord` rejects `owner_kind: 'skill'`.
- Expected to change: `server/test/contracts-sync.test.ts` — its file list grows from two entries to three.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · then, not in parallel, `cd client && pnpm typecheck`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` · then `cd client && pnpm typecheck`
**Done when:**
- AC-92 / R-SRV-42 — `eval-pipeline.ts` exports every contract named in the server spec, both barrels export it, and `contracts-sync.test.ts` proves the client copy byte-identical.

### 2 · Tables and the generated migration 0017 (`server`)

This phase extends `eval_cases` and `eval_runs`, adds `eval_suite_runs`, and generates the migration. It comes before any code that writes these tables.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/db/schema/eval.ts` | Add `evalSuiteRuns` with every column of the server spec table "New `eval_suite_runs`":<br>• `agent_id` → `agents.id` on delete cascade;<br>• `workspace_id` → `workspaces.id` on delete cascade;<br>• `provider`, `strategy` and `status` as text enums;<br>• `skills` jsonb not null.<br>Indexes:<br>• `(agent_id, started_at desc)`;<br>• a partial **unique** index on `agent_id` `where status = 'running'` (R-SRV-27).<br>`evalRuns` gains `suiteRunId` (`suite_run_id` uuid not null → `eval_suite_runs.id` on delete cascade) and `error` text. `evalCases` gains:<br>• `createdAt` (timestamptz not null default now);<br>• `sourceFindingId` (uuid → `findings.id` on delete set null) with a partial unique index `where source_finding_id is not null` (R-SRV-11).<br>New imports: `agents` from `./agents`, `findings` from `./reviews`. | onion-architecture, security, drizzle-orm-patterns | dep-inward-only |
| `server/src/db/schema.ts` | Import `evalSuiteRuns` with the other eval tables (`:44`) and add it to the `schema` object next to `evalRuns` (`:83-84`). | onion-architecture, security, drizzle-orm-patterns, postgresql-table-design | dep-inward-only |
| `server/src/db/migrations/0017_<generated>.sql`, `meta/0017_snapshot.json`, `meta/_journal.json` | **Generated** by `cd server && pnpm db:generate`, never hand-edited. Before finishing, read the SQL: it holds one `CREATE TABLE`, the `ALTER TABLE … ADD COLUMN`s, the FKs and the three indexes, and no `RENAME` or `DROP`. | — (excluded from routing) | — |

**Tests (test-writer):**
- No new test file. Every `*.it.test.ts` migrates a fresh testcontainer from zero, so the integration lane is the check that 0017 applies. The tables are exercised from phase 4 on.
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- Groundwork for R-SRV-11, R-SRV-15, R-SRV-27, R-SRV-35 and R-SRV-39: `0017_*.sql` exists, was produced by `pnpm db:generate`, and the integration lane migrates every fresh database through it with no failure.

### 3 · Pure eval domain + the shared prompt pieces (`server`)

This phase writes every rule that decides from data alone: the fragment cut, the case naming, the match rule, the per-case score and the run aggregate. It also moves the task-line wording and the skill-block rendering into `_shared/` so the eval module can use them (R1, R3). It comes before any I/O phase because those phases call these functions.

Exact signatures of `server/src/modules/eval/domain.ts` (imports only from `@devdigest/shared`):

```ts
export const FRAGMENT_CUT_LINES = 1500;
export const CASE_SLUG_MAX = 34;
export function rawDiffFromPatches(files: { path: string; patch: string | null }[]): string;
export function cutFileSection(raw: string, file: string, range: { start_line: number; end_line: number }): string | null;
export function caseName(kind: EvalExpectationKind, title: string): string;
export function findingMatches(f: { file: string; start_line: number; end_line: number }, e: EvalExpectation): boolean;
export function scoreCase(
  e: EvalExpectation,
  kept: Pick<Finding, 'file' | 'start_line' | 'end_line' | 'title' | 'severity' | 'category'>[],
  dropped: number,
): { pass: boolean; recall: number | null; precision: number | null; citation_accuracy: number | null;
     actual_output: { findings: EvalFoundFinding[]; dropped: number } };
export function aggregateRun(rows: {
  kind: EvalExpectationKind; error: string | null; pass: boolean | null;
  actual_output: { findings: { matches: boolean }[]; dropped: number } | null; cost_usd: number | null;
}[]): { recall: number | null; precision: number | null; citation_accuracy: number | null;
        cases_passed: number; cases_errored: number; cost_usd: number | null };
export function outcomeOf(row: { error: string | null; pass: boolean | null }): EvalCaseOutcome;
```

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/_shared/review-prompt.ts` (new) | Move `taskLine`'s wording here unchanged, as `taskLine(pull: { number: number; title: string; author: string }): string`. Move `PromptSkill` and `renderSkillBlocks` here unchanged. The file has no imports. | onion-architecture, security, fastify-best-practices | dep-inward-only, dep-domain-framework-free |
| `server/src/modules/reviews/helpers.ts` | Replace the `taskLine` body with `export { taskLine } from '../_shared/review-prompt.js';`. Drop the now-unused `PullRow` import if nothing else uses it. `run-executor.ts` is not edited: `PullRow` satisfies the structural parameter. | onion-architecture, security | dep-inward-only, dep-no-cross-module |
| `server/src/modules/reviews/domain.ts` | Replace `PromptSkill` and `renderSkillBlocks` with re-exports from `../_shared/review-prompt.js`. Everything else is unchanged. | onion-architecture, security | dep-domain-framework-free |
| `server/src/modules/eval/domain.ts` (new) | The signatures above.<br>• `rawDiffFromPatches`: the `diff --git` / `---` / `+++` / patch lines, as `diff-loader.ts:33-44` builds them; files with a null patch are skipped.<br>• `cutFileSection`: R-SRV-3 / R-SRV-4 / R-SRV-8 by text (F10), normalised per Assumption 2. It returns `null` when there is no section, the section has no hunk, or the cut leaves no hunk. The overlap test is new-side `[c, c+d−1]` against `[start_line, end_line]`.<br>• `caseName`: R-SRV-12. The slug is cut to 34 characters and trailing `-` is trimmed again; an empty slug becomes `finding`.<br>• `findingMatches`: R-SRV-19.<br>• `scoreCase`: the per-case columns of the server spec, below the Contracts block.<br>• `aggregateRun`: R-SRV-18 / R-SRV-20–R-SRV-23 over the non-errored rows. TP is the matching-finding count of `must_find` rows and FP the same count of `must_not_flag` rows. Citation accuracy is Σ kept ÷ Σ (kept + dropped). `cost_usd` is the sum over non-errored rows, null when any of them is null.<br>• `outcomeOf`: `errored` when `error` is set, else `pass` / `fail`. | onion-architecture, security | dep-domain-framework-free, dep-inward-only |

**Tests (test-writer):**
- Add `server/test/eval-domain.test.ts`:
  - `findingMatches`: touching ends on both sides, a different file, a range fully inside and fully outside;
  - `scoreCase` and `aggregateRun` over a mixed fixture: several matches on one `must_find` case (one pass, each match adds to TP); an unmatched finding (in neither TP nor FP, counted for citation); an errored row excluded; a `must_not_flag` miss;
  - nulls for each zero denominator (R-SRV-23);
  - the per-case columns;
  - `cutFileSection` under and over 1,500 hunk lines with overlapping and non-overlapping hunks, a missing file, and git's `index` line removed;
  - `rawDiffFromPatches` skipping a null patch;
  - `caseName` with an empty title, a 60-character title, and a title whose 34-character cut ends in `-`.
- Add `server/test/eval-scorer-purity.test.ts`: read `src/modules/eval/domain.ts` as text and assert every `import … from` names `@devdigest/shared`; score a fixture next to a `new MockLLMProvider()` and assert its `calls` stay empty.
- Expected to change: none. `server/test/reviews-helpers.test.ts` and `server/test/reviews-domain.test.ts` keep passing through the re-exports.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Done when:**
- AC-5 / R-SRV-4 — `cutFileSection` keeps only the overlapping hunks, headers unchanged, above 1,500 hunk lines, and `eval-domain.test.ts` shows it.
- AC-32–AC-36 / R-SRV-19–R-SRV-23 — the match rule and the three metrics, including nulls, pass `eval-domain.test.ts`.
- AC-37 / R-SRV-24 — `eval-scorer-purity.test.ts` passes.
- R-SRV-12 — naming passes all three title cases.
- R1 groundwork for R-SRV-17 — `taskLine` and `renderSkillBlocks` live in `_shared/review-prompt.ts`, and `reviews` behaviour is unchanged (its tests stay green).

### 4 · Eval module: case create, list and delete (`server`)

This phase registers the new `eval` module with the three case routes. Run routes follow in phase 6, after the agent-delete cascade.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/eval/ports.ts` (new) | Structural ports only, with no Drizzle types:<br>• `EvalStore` (case section), with:<br>&nbsp;&nbsp;– `findFindingSource(workspaceId, findingId)`, returning the finding's id, file, lines, title, severity, category, `accepted`, `dismissed`, the review's `agentId`, the PR `{ id, number, title, body, author, base, headSha }` and the repo `{ owner, name }`, or `undefined`;<br>&nbsp;&nbsp;– `agentExists(workspaceId, agentId)`;<br>&nbsp;&nbsp;– `caseBySourceFinding(findingId)`;<br>&nbsp;&nbsp;– `insertCase(values): Promise<{ record: EvalCaseRecord; created: boolean }>`;<br>&nbsp;&nbsp;– `listCases(agentId)`;<br>&nbsp;&nbsp;– `deleteCase(workspaceId, caseId): Promise<boolean>`;<br>&nbsp;&nbsp;– `prPatches(prId)`.<br>• `EvalLog` (`info(fields, msg)`).<br>• `EvalGit`, typed as `Pick<GitClient, 'diff'>` from `@devdigest/shared`. | onion-architecture, security | dep-domain-framework-free |
| `server/src/modules/eval/repository.ts` (new) | `class EvalRepository implements EvalStore`, constructed with `Db`. It delegates to the `repository/*.repo.ts` functions, the way `reviews/repository.ts` does. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, zod-parse-at-boundary, sec-injection, sec-missing-authz |
| `server/src/modules/eval/repository/case.repo.ts` (new) | Case reads and writes. `listCases`: `owner_kind = 'agent'` and `owner_id = agentId`, ordered `created_at desc` (R-SRV-13). `insertCase` catches a unique violation (`23505`) on `source_finding_id`, re-reads the existing case and returns `created: false` (R-SRV-11). Rows are mapped to `EvalCaseRecord`, with the JSON columns parsed (`EvalExpectation`, `EvalCaseMeta`) and a null `input_diff` read as `''`. No update method exists (R-SRV-10). `deleteCase` is scoped by `workspace_id`; `eval_runs` rows go by the existing cascade. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, zod-parse-at-boundary, sec-injection, sec-missing-authz |
| `server/src/modules/eval/repository/source.repo.ts` (new) | `findFindingSource` (findings → reviews → pull_requests → repos, scoped by `reviews.workspace_id`), `agentExists`, and `prPatches(prId)` (`pr_files` path and patch, ordered by `path`). These are the module's own copies, per R2. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-missing-authz |
| `server/src/modules/eval/service.ts` (new) | `EvalService(deps: { store: EvalStore; git: EvalGit })` with:<br>• `createCase(workspaceId, findingId)`, following the server spec "Case creation, in order":<br>&nbsp;&nbsp;1. `NotFoundError`.<br>&nbsp;&nbsp;2. `ValidationError` "Accept or dismiss the finding first".<br>&nbsp;&nbsp;3. `ValidationError` "No agent for this finding".<br>&nbsp;&nbsp;4. An existing case returns `{ case, created: false }`.<br>&nbsp;&nbsp;5. Diff: `git.diff(repo, base, headSha)`; if that throws or has no files, `rawDiffFromPatches(await store.prPatches(prId))`.<br>&nbsp;&nbsp;6. `cutFileSection`; `null` → `ValidationError` "No diff available for <file>".<br>&nbsp;&nbsp;7. Insert with `caseName`, `input_files: [file]` and `EvalCaseMeta` (`pr_body` null when empty).<br>• `listCases(workspaceId, agentId)`, 404 for a foreign or unknown agent.<br>• `deleteCase(workspaceId, caseId)`, 404 when nothing was deleted.<br>It imports no container and no Fastify. | onion-architecture, security | dep-inward-only, db-only-in-repository, sec-missing-authz |
| `server/src/modules/eval/routes.ts` (new) | The default plugin. It builds `new EvalService({ store: new EvalRepository(container.db), git: container.git })` and declares:<br>• `POST /findings/:id/eval-case` (`IdParams`, no body; reply 201 when `created`, else 200);<br>• `GET /agents/:id/eval-cases`;<br>• `DELETE /eval-cases/:id` (reply 204).<br>Each handler uses `getContext` and calls one service method. | onion-architecture, security, fastify-best-practices | edge-thin-routes, di-composition-root-only, zod-parse-at-boundary, sec-missing-authz |
| `server/src/modules/eval/constants.ts` (new) | The module limits that are not domain rules: `MAX_CASES_PER_RUN = 50`, `RUN_CONCURRENCY = 3`, `RUN_PAGE_DEFAULT = 20`, `RUN_PAGE_MAX = 100`, `RECENT_RUNS = 6`, `RECALL_TREND_POINTS = 10`. | onion-architecture, security | dep-inward-only |
| `server/src/modules/index.ts` | `import evalModule from './eval/routes.js'`, added to `modules` after `brief`. | onion-architecture, security | di-composition-root-only |

**Tests (test-writer):**
- Add `server/test/eval-pipeline.it.test.ts`, building the app with `MockSecretsProvider`, `MockGitHubClient` and `MockGitClient`. The test inserts its own agent, review (with `agent_id`) and findings on a test PR with `pr_files` patches.
  - 201 for an accepted finding (`must_find`) and for a dismissed one (`must_not_flag`), with `owner_id` = the review's agent, the stored fragment (hunk headers kept), `input_files` and `input_meta` (R-SRV-1–R-SRV-5).
  - The clone diff is used when `MockGitClient` returns files; with `diff: ''` the `pr_files` fallback is used.
  - 422 for an open finding, a null agent, a deleted agent, and a file with no hunk (R-SRV-6–R-SRV-8). After each, assert no row was written.
  - 200 with `created: false` on a repeat (R-SRV-9).
  - Accepting a dismissed finding later leaves the case's expectation unchanged (R-SRV-10).
  - Two concurrent POSTs for one finding produce one row (R-SRV-11).
  - `GET /agents/:id/eval-cases` with 8 cases returns 8, newest first (R-SRV-13).
  - Deleting a case answers 204. Insert an `eval_suite_runs` row and an `eval_runs` row for the case directly first, and assert the suite row's columns are unchanged afterwards (R-SRV-14).
  - 404 for each of the three routes with another workspace's id (R-SRV-37).
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- AC-2, AC-3, AC-4, AC-6 / R-SRV-1–R-SRV-5 — case creation stores the expectation, the file section with its hunk headers, and the PR meta.
- AC-9, AC-11, AC-12 / R-SRV-6–R-SRV-8 — each refusal answers 422 and writes nothing.
- AC-15, AC-17, AC-18 / R-SRV-9–R-SRV-11 — a repeat answers 200 with the same case, a re-decision leaves the case, and a race stores one case.
- AC-21 / R-SRV-13 — 8 cases listed.
- AC-25 / R-SRV-14 — delete answers 204 and changes no `eval_suite_runs` column.
- AC-50 (case routes) / R-SRV-37 — foreign ids answer 404.
- All of the above are shown by `eval-pipeline.it.test.ts`.

### 5 · Agent delete removes eval cases; `AgentsService` on narrow dependencies (`server`)

`eval_cases.owner_id` has no FK, so the agent delete must remove the cases in code (F7). That edits the baselined `AgentsService`, which is therefore migrated here (Q1). It comes before the run phase so the run tests can rely on the cascade.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/agents/repository.ts` | `deleteById(workspaceId, id)` runs one `db.transaction`: delete `eval_cases` where `workspace_id = workspaceId`, `owner_kind = 'agent'` and `owner_id = id`, then delete the agent (scoped as today). `eval_suite_runs` and their `eval_runs` go by FK cascade. It still returns `rows.length > 0`, and nothing is deleted when the agent is not in the workspace. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-missing-authz |
| `server/src/modules/agents/service.ts` | The constructor becomes `constructor(private deps: { repo: AgentsRepository; llm: (p: Provider) => Promise<LLMProvider> })`. `this.repo` reads `deps.repo`, and `listModels` uses `deps.llm`. The `Container` import is removed. Behaviour is otherwise unchanged. | onion-architecture, security | dep-inward-only, di-composition-root-only |
| `server/src/modules/agents/routes.ts` | Line 72 becomes `new AgentsService({ repo: app.container.agentsRepo, llm: (p) => app.container.llm(p) })`. | onion-architecture, security, fastify-best-practices | edge-thin-routes, di-composition-root-only |
| `server/.dependency-cruiser-known-violations.json` | **Regenerated** with `cd server && pnpm arch:baseline` after the edit, never hand-edited. Its only change is that the `src/modules/agents/service.ts` `di-narrow-deps` entry (`:189-199`) is gone. If any other entry changes, stop and report it. | — (no skill glob; triggers `arch_check`) | — |

**Tests (test-writer):**
- Extend `server/test/eval-pipeline.it.test.ts`: create an agent with two cases and one `eval_suite_runs` row (with one `eval_runs` row), inserted directly. `DELETE /agents/:id` answers 200, and afterwards no case, suite run or result row of that agent remains, while another agent's cases are untouched (R-SRV-35).
- Expected to change: `server/test/agents-versions.it.test.ts:167` — `new AgentsService({ db } as unknown as Container)` becomes `new AgentsService({ repo: new AgentsRepository(db), llm: async () => { throw new Error('unused'); } })`. The assertions are unchanged.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism` (may fail only in `agents-versions.it.test.ts`)
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- AC-48 / R-SRV-35 — deleting an agent removes its cases, runs and results in the same request (`eval-pipeline.it.test.ts`).
- `AgentsService` no longer imports `Container`, and the baseline lost exactly its `di-narrow-deps` entry, with `pnpm arch:check` green.

### 6 · Run executor, run routes, rate limit, boot reap (`server`)

This phase starts a run, executes it in the background three cases at a time with the stored snapshot, scores and stores each case, aggregates from the stored rows, and reaps orphaned runs on boot.

Executor contract:

```ts
export type ReviewEngine = (input: ReviewInput) => Promise<ReviewOutcome>;   // types from @devdigest/reviewer-core
export interface EvalRunJob {
  runId: string;
  snapshot: EvalConfigSnapshot;
  skills: { name: string; version: number; body: string }[];
  cases: EvalCaseRecord[];
  llm: LLMProvider;
}
export class EvalRunExecutor {
  constructor(deps: { store: EvalExecutorStore; review: ReviewEngine; parseDiff: (raw: string) => UnifiedDiff; concurrency?: number });
  /** Never rejects. */
  run(job: EvalRunJob, log: EvalLog): Promise<void>;
}
```

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/eval/ports.ts` | Extend `EvalStore`:<br>• `countCases(agentId)`;<br>• `casesForRun(agentId)`;<br>• `agentSnapshot(workspaceId, agentId)` (the agent row's `version`, `systemPrompt`, `provider`, `model`, `strategy`, `name`), or `undefined`;<br>• `promptSkills(agentId)`;<br>• `hasRunningRun(agentId)`;<br>• `insertRun(...): Promise<EvalSuiteRun | 'conflict'>`;<br>• `storeResult(runId, row): Promise<'stored' | 'case_gone' | 'run_gone'>`;<br>• `resultsOf(runId)`;<br>• `finishRun(runId, aggregate | { failed: string }): Promise<boolean>`;<br>• `listRuns(agentId, limit, offset)`;<br>• `runDetail(workspaceId, runId)`;<br>• `reapRunning(): Promise<number>`.<br>Add `EvalExecutorStore = Pick<EvalStore, 'storeResult' | 'resultsOf' | 'finishRun'>` and `ReviewEngine`. | onion-architecture, security | dep-domain-framework-free |
| `server/src/modules/eval/repository/run.repo.ts` (new) | `insertRun` catches `23505` from the partial unique index and returns `'conflict'`.<br>`storeResult` inserts the `eval_runs` row and bumps `cases_done` in one transaction (R-SRV-39). A `23503` on the `case_id` FK maps to `'case_gone'` and one on the `suite_run_id` FK to `'run_gone'`; the constraint name decides.<br>`resultsOf` joins `eval_cases` for the kind.<br>`finishRun` sets status, metrics, counts, cost, `finished_at` and error, and returns false when the row is gone.<br>`listRuns` orders `started_at desc` and returns `{ runs, total }` with `agent_name` joined.<br>`runDetail` returns results ordered by case name, with `kind`, `expectation`, `case_name` and `outcome` mapped.<br>`reapRunning` sets every `running` row to `failed`, `error: 'Interrupted by server restart'`, `finished_at: now()`, and returns the count. JSON columns are parsed on read. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, zod-parse-at-boundary, sec-injection, sec-missing-authz |
| `server/src/modules/eval/repository/source.repo.ts` | Add `agentSnapshot`, `countCases` and `casesForRun`. Add `promptSkills(agentId)`: the enabled linked skills in `agent_skills.order`, a copy of `reviews/repository/skill.repo.ts:12-19` (R2). | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-missing-authz |
| `server/src/modules/eval/repository.ts` | Delegate the new port methods. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository |
| `server/src/modules/eval/run-executor.ts` (new) | The contract above. It reviews cases through a worker pool of `concurrency` (default `RUN_CONCURRENCY`, R-SRV-36). Each case gets one `review` call (R-SRV-17, R-SRV-25) with:<br>• `systemPrompt`, `model`, `strategy` from the snapshot;<br>• `skills: renderSkillBlocks(job.skills)` from `_shared/review-prompt.ts`;<br>• `diff: parseDiff(case.input_diff)`;<br>• `prDescription: meta.pr_body ?? undefined`;<br>• `task: taskLine({ number: meta.pr_number, title: meta.pr_title, author: meta.pr_author })`;<br>• `llm`;<br>• **no** `onEvent`, `callers`, `repoMap`, `specs`, `memory`, `intent` or `scopeFilter`.<br>Results are built with `scoreCase(expectation, outcome.review.findings, outcome.dropped.length)`. A throw becomes an errored row with `error = err.message` (R-SRV-31). `'case_gone'` is skipped silently; `'run_gone'` stops the run quietly (F16, R-SRV-48).<br>At the end it calls `aggregateRun(await store.resultsOf(runId))`. If every stored row errored and there is at least one, it calls `finishRun` failed with "All n cases failed: <first error>" (R-SRV-32); otherwise `done` (R-SRV-18), with null metrics when no row remains (Q10).<br>Any throw outside a case is caught and finishes the run failed with its message. The whole body sits in `try/catch`, so the returned promise never rejects.<br>Exactly two `log.info` lines are written: at start `{ runId, agentId, cases }`, at end `{ runId, status, passed, errored, recall, precision, citation, costUsd, durationMs }`. | onion-architecture, security | dep-inward-only, db-only-in-repository, sec-secret-exposure |
| `server/src/modules/eval/service.ts` | Extend `EvalService` deps with `llm: (p: Provider) => Promise<LLMProvider>` and `executor: EvalRunExecutor`. Add:<br>• `startRun(workspaceId, agentId, log)`, following "Run, in order":<br>&nbsp;&nbsp;1. `NotFoundError`.<br>&nbsp;&nbsp;2. `countCases`: 0 → `ValidationError` "This agent has no eval cases"; > 50 → `ValidationError` "An eval run takes at most 50 cases; this agent has n".<br>&nbsp;&nbsp;3. `deps.llm(provider)`: `ConfigError` → `AppError('eval_unavailable', 'No API key for <provider>. Add it in Settings.', 400)`.<br>&nbsp;&nbsp;4. `hasRunningRun` → `AppError('eval_run_in_progress', …, 409)`.<br>&nbsp;&nbsp;5. Read the snapshot, skills and cases once.<br>&nbsp;&nbsp;6. `insertRun` (`'conflict'` → the same 409).<br>&nbsp;&nbsp;7. `void this.deps.executor.run(job, log)`.<br>&nbsp;&nbsp;8. Return the run.<br>• `listRuns(workspaceId, agentId, limit, offset)`, 404 for an unknown agent.<br>• `getRun(workspaceId, runId)`, 404.<br>Nothing here touches `reviews`, `findings`, `agent_runs` or a run bus (R-SRV-26). | onion-architecture, security | dep-inward-only, db-only-in-repository, sec-missing-authz |
| `server/src/modules/eval/routes.ts` | `export const EVAL_RUN_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } }`. Build the executor with `review: reviewPullRequest` (from `@devdigest/reviewer-core`) and `parseDiff: parseUnifiedDiff` (from `../../adapters/git/diff-parser.js`, wiring only). Pass `llm: (p) => container.llm(p)`. New routes:<br>• `POST /agents/:id/eval-runs` (`config: EVAL_RUN_RATE_LIMIT`, reply 202, passes `req.log`);<br>• `GET /agents/:id/eval-runs` with route-local query schema `{ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) }`;<br>• `GET /eval-runs/:id`. | onion-architecture, security, fastify-best-practices | edge-thin-routes, di-composition-root-only, zod-parse-at-boundary, sec-missing-authz |
| `server/src/modules/eval/constants.ts` | No new value needed beyond phase 4. If the executor needs a named constant, add it here. | onion-architecture, security | dep-inward-only |
| `server/src/app.ts` | In the existing `try` (`:81-86`), after the review reap, add `const evalReaped = await new EvalRepository(container.db).reapRunning();` and `if (evalReaped > 0) app.log.info({ reaped: evalReaped }, 'reaped stale running eval_suite_runs on boot');` (Q2). No second `try` and no second reaper. | onion-architecture, security, fastify-best-practices | di-composition-root-only |
| `server/src/adapters/mocks.ts` | Add `export class ScriptedLLMProvider extends MockLLMProvider`. Its constructor is `(id, script: (req: StructuredRequest<unknown>, callIndex: number) => Promise<unknown> | unknown)`. `completeStructured` records the call in `calls`, awaits `script(req, n)` (a rejection propagates), validates the value against `req.schema` like the base class, and returns the same result shape. The tests build their gate and started promises inside `script` (R5). | onion-architecture | adapter-implements-port |

**Tests (test-writer):**
- Add `server/test/eval-executor.test.ts` (hermetic, fake `EvalExecutorStore`, fake `review`):
  - with 7 cases the in-flight count never exceeds 3 (R-SRV-36);
  - every `ReviewInput` has the snapshot's prompt, model, strategy and skill blocks, the parsed fragment, the description, and the task line from the stored meta, and has `callers`, `repoMap`, `specs`, `memory`, `intent`, `scopeFilter` and `onEvent` all `undefined` (R-SRV-17);
  - a `review` that throws for one case gives that case's errored row and leaves the others intact;
  - `'run_gone'` stops the run quietly and the promise resolves.
- Add `server/test/eval-rate-limit.test.ts`, as `brief-rate-limit.test.ts` does: `POST /agents/not-a-uuid/eval-runs` answers 422 ten times and 429 on the 11th (R-SRV-34).
- Add `waitForEvalRun(app, runId)` to `server/test/helpers/runs.ts`. It polls `GET /eval-runs/:id` until `status !== 'running'`, with a timeout.
- Extend `server/test/eval-pipeline.it.test.ts`:
  - 202 `running` with the snapshot stored (version, prompt, provider, model, strategy, skills `[{ name, version }]` in link order), including for a disabled agent (R-SRV-15, R-SRV-16);
  - the run reaches `done` with one result per case, `cases_done` equal to the number of cases, the mock's `completeStructured` calls equal to the number of cases, and no new `reviews`, `findings` or `agent_runs` row (R-SRV-18, R-SRV-25, R-SRV-26, R-SRV-39);
  - 409, and two concurrent POSTs create at most one run (R-SRV-27);
  - 422 for 0 and for 51 cases (R-SRV-28, R-SRV-29);
  - 400 `eval_unavailable` when the secrets mock has no key for the agent's provider and no `llm` override exists (R-SRV-30);
  - with `ScriptedLLMProvider`: one throwing case gives an errored row left out of the metrics (R-SRV-31), and all throwing gives `failed` with the "All n cases failed" text (R-SRV-32);
  - a case deleted while its review is held by the gate: the run ends `done` with no row for it and the case in no count or metric (R-SRV-48, AC-99);
  - deleting the agent mid-run removes the run, and the process logs no unhandled rejection (F16);
  - boot reap: insert a `running` row, build a second app on the same database, and the row is `failed` "Interrupted by server restart" (R-SRV-33);
  - the runs page with `limit`, `offset` and `total` (R-SRV-38);
  - the detail with results, outcome and `matches` flags (R-SRV-40);
  - 404 for the three run routes with another workspace's id (R-SRV-37).
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- AC-28, AC-29 / R-SRV-15, R-SRV-16 — POST answers 202 `running` with the stored snapshot, for enabled and disabled agents.
- AC-30 / R-SRV-17 — the engine input carries only the allowed slots (`eval-executor.test.ts`).
- AC-31 / R-SRV-18, R-SRV-39 — the run ends `done` with one result per remaining case and the aggregates.
- AC-38, AC-39 / R-SRV-25, R-SRV-26 — one model call per case, and no review, finding or agent-run rows.
- AC-40–AC-43 / R-SRV-27–R-SRV-30 — 409, 422, 422, 400 with no run written.
- AC-44, AC-45 / R-SRV-31, R-SRV-32 — errored and failed runs.
- AC-46 / R-SRV-33 — boot reap.
- AC-47 / R-SRV-34 — 429 on the 11th request.
- AC-49 / R-SRV-36 — at most 3 cases in flight.
- AC-50 (run routes) / R-SRV-37 — foreign ids answer 404.
- R-SRV-38, R-SRV-40 — the runs page and the run detail.
- AC-99 / R-SRV-48 — a mid-run delete leaves the case out of every count.

### 7 · Overview route and the seeded eval fixture (`server`)

This phase adds the dashboard overview and the seeded cases and runs that the dashboard, Compare and e2e rely on.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/eval/repository/overview.repo.ts` (new) | `overview(workspaceId): Promise<EvalOverview>`. It returns every agent of the workspace, enabled or not, ordered by name, each with:<br>• its latest `done` run as an `EvalSuiteRun` or null;<br>• `running`;<br>• `cases_total` and `runs_total`;<br>• `recall_trend`: the `recall` of its last 10 `done` runs, oldest first.<br>It also returns `recent_runs`: the 6 newest runs of the workspace in any status, with `agent_name` (R-SRV-41). | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, zod-parse-at-boundary, sec-missing-authz |
| `server/src/modules/eval/repository.ts` | Delegate `overview`. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository |
| `server/src/modules/eval/ports.ts` | Add `overview(workspaceId)` to `EvalStore`. | onion-architecture, security | dep-domain-framework-free |
| `server/src/modules/eval/service.ts` | `overview(workspaceId)` passes through. | onion-architecture, security | dep-inward-only |
| `server/src/modules/eval/routes.ts` | `GET /evals/overview`. | onion-architecture, security, fastify-best-practices | edge-thin-routes, sec-missing-authz |
| `server/src/db/seed-eval.ts` (new) | `export async function seedEvalFixture(db: Db, input: { workspaceId: string; prId: string; patches: Record<string, string> })`, following the server spec "Seeded eval data" exactly:<br>• Find "Security Reviewer" and return if it is missing.<br>• Insert each of `must-find-stripe-key` and `no-n-plus-one-user-list` only when the agent has no case of that name. The fragment is `diff --git` / `---` / `+++` plus the seeded patch for `src/config.ts` / `src/api/users.ts`. The meta is PR #482 (title, body, author `marisa.koch`, head `a1b2c3d4e5f6`, repo `acme/payments-api`). `source_finding_id` is null.<br>• Insert the two runs only when the agent has no run:<br>&nbsp;&nbsp;– `started_at` `2026-10-30T10:00:00.000Z` and `2026-10-31T10:00:00.000Z`, `finished_at` one minute later;<br>&nbsp;&nbsp;– the older prompt is the agent's prompt + `\n\nFlag every database query inside a loop as a performance problem.`;<br>&nbsp;&nbsp;– the agent's `version`, `provider`, `model` and `strategy` at seed time;<br>&nbsp;&nbsp;– `skills` from its enabled linked skills, which is `[]` for this agent;<br>&nbsp;&nbsp;– the metrics, counts and costs of the table;<br>&nbsp;&nbsp;– the four `eval_runs` rows with the per-case outcomes, findings (with `matches`) and `dropped` counts the spec lists.<br>The values are typed with `satisfies` against the contracts, so `pnpm typecheck` catches drift (`server/INSIGHTS.md:125`). | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-hardcoded-secret |
| `server/src/db/seed.ts` | Before `return` (`:679`), and so after the agents and skills blocks and outside `if (!pr)`: call `seedEvalFixture(db, { workspaceId, prId: pr!.id, patches: SMART_DIFF_PATCHES })`. Reuse the existing `SMART_DIFF_PATCHES` text; do not add a second copy of the seeded `sk_live_` patch. | onion-architecture, security, drizzle-orm-patterns | db-only-in-repository, sec-hardcoded-secret |

**Tests (test-writer):**
- Add `server/test/eval-seed.it.test.ts`:
  - after `seed()` twice, "Security Reviewer" has exactly two cases and two runs;
  - the runs hold the spec's values: prompts, metrics 1 / 0.5 / 0.6667 and 1 / 1 / 1, passed / total, costs, `finished_at`, `skills: []`;
  - the cases hold their expectations and `source_finding_id: null`;
  - a third `seed()` after editing one run's `recall` leaves the edit in place (undone in `finally`) (R-SRV-43).
- Extend `server/test/eval-pipeline.it.test.ts` with `GET /evals/overview` in a fresh workspace:
  - an agent with runs, whose `latest` is the newest `done` run even when a newer `failed` run exists;
  - a disabled agent;
  - an agent with no run (`latest: null`, empty trend);
  - `running: true` while a run is held;
  - `recall_trend` capped at 10, oldest first;
  - `recent_runs` capped at 6 across agents, any status, with `agent_name` (R-SRV-41).
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- R-SRV-41 (server data of AC-56, AC-64, AC-65, AC-76, AC-77, AC-91) — `GET /evals/overview` answers every agent with its latest done run, running flag, counts and recall trend, plus the 6 newest runs.
- R-SRV-43 (data of AC-93, AC-94) — `pnpm db:seed` inserts the two cases and two runs once, with the spec's values (`eval-seed.it.test.ts`).

### 8 · Client data layer, strings and shared eval components (`client`)

This phase adds the hooks, the polling and invalidation rules, and the pieces both the Evals tab and the dashboard use. No screen yet.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/lib/hooks/evals.ts` (new) | `evalKeys` factory: `cases(agentId)` → `["eval-cases", agentId]`, `runs(agentId, limit)` → `["eval-runs", agentId, limit]`, `run(runId)` → `["eval-run", runId]`, `overview()` → `["eval-overview"]`. The hooks of the client spec "Route and data":<br>• `useAgentEvalCases(agentId)`;<br>• `useCreateEvalCase(agentId)` (POST `/findings/:id/eval-case`, takes `findingId`);<br>• `useDeleteEvalCase(agentId)`;<br>• `useAgentEvalRuns(agentId, limit)`;<br>• `useStartEvalRun(agentId)`;<br>• `useEvalRun(runId)`;<br>• `useEvalOverview()`.<br>`refetchInterval` is a function returning `2000` while the latest data holds a `running` run (or an agent with `running: true`), else `false` (R-WEB-20).<br>R-WEB-21: `useAgentEvalRuns`, `useEvalRun` and `useEvalOverview` each keep a ref of the run ids they last saw `running`. An effect fires when `data` changes, and for each id now `done` or `failed` it invalidates `["eval-runs", agentId]`, `["eval-run", runId]`, `["eval-overview"]` and `["eval-cases", agentId]`. Mutations invalidate as in the spec table. Type-only imports from `@devdigest/shared`. | frontend-ui-architecture, security | struct-one-way, logic-no-server-state-copy, logic-no-effect-derivation |
| `client/messages/en/eval.json` | Keys used by the shared pieces:<br>• `dashboard.runningProgress` "Running… {done}/{total}";<br>• `runs.errored` "{errored} of {total} cases errored";<br>• `runs.failed`;<br>• `runs.status.{running,done,failed}`;<br>• `runs.outcome.{pass,fail,errored}`;<br>• `kind.{must_find,must_not_flag}` ("must find", "must not flag");<br>• the drawer labels (close, matches, dropped).<br>Existing keys are kept. | — | — |
| `client/src/components/eval/helpers.ts` (new) | Pure:<br>• `pct(v)` → `"NN%"` / `"—"`;<br>• `deltaPoints(newV, oldV)` → `round(new·100) − round(old·100)` or null;<br>• `deltaText(n)` → `"▲ +Npt"` / `"▼ −Npt"` / `"±0pt"`;<br>• `formatRunTime(iso)` → local `YYYY-MM-DD HH:mm` (Q11);<br>• `runCheckboxLabel(run)` → `"<formatRunTime> · v<n>"` (R-WEB-48);<br>• `latestDone(runs)`, `previousDone(runs)`;<br>• `runningRun(runs)`. | frontend-ui-architecture, security | logic-pure-domain, split-pure |
| `client/src/components/eval/constants.ts` (new) | Metric colours (recall `var(--accent)`, precision `var(--ok)`, citation `var(--warn)`), the outcome icons, and the local `EVAL_KINDS` / `RUN_STATUSES` value lists (type-checked against the contract types). | frontend-ui-architecture, security | logic-pure-domain |
| `client/src/components/eval/styles.ts` (new) | `s` with the Layout values for the metric bar, runs table (header and row grids for with and without the checkbox column), drawer, and the one-line ellipsis style (R-WEB-44). Every state-dependent style is a function returning a complete object. | frontend-ui-architecture, security | split-pure |
| `client/src/components/eval/MetricBar.tsx` (new) | The Layout "Metric bar": track plus fill, and the text `pct(value)` beside it (R-WEB-49). An empty track and `"—"` when null (R-WEB-39). | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, split-pure, react-nested-component, sec-xss |
| `client/src/components/eval/DeltaLabel.tsx` (new) | Renders `deltaText`, coloured `var(--ok)` / `var(--crit)` / muted. Renders nothing when the delta is null. | frontend-ui-architecture, react-best-practices, security | split-pure, react-nested-component |
| `client/src/components/eval/RunsTable.tsx` (new) | The Layout "Runs table" / Evals-tab "Runs". Props: `runs`, `onOpen(run, el)`, optional `selection { selected: string[]; onToggle(id) }`.<br>• With `selection`, the first column is a native `<input type="checkbox">` with `aria-label={runCheckboxLabel(run)}`, `disabled` for `failed` / `running` (R-WEB-38, R-WEB-48), and click propagation stopped.<br>• Without `selection` there is no checkbox column, and a status chip sits in the version cell.<br>• A row is `role="button"`, `tabIndex={0}`, and opens on click, Enter or Space (outside the checkbox).<br>• Running and failed rows show "Running… k/N" / "failed" in `var(--crit)` with the error text in the metric columns (R-WEB-19, R-WEB-25).<br>• A done row with `cases_errored > 0` shows `runs.errored` under the pass cell (R-WEB-24).<br>• Cost uses `formatCostUsd`.<br>• Every text is a text node. | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, split-pure, logic-no-server-state-copy, react-nested-component, react-render-side-effect, sec-xss |
| `client/src/components/eval/RunDrawer.tsx` (new) | The Layout "Run drawer": a local right-side panel, `role="dialog"`, `aria-modal`, width 440. It reads `useEvalRun(runId)`. For each result: outcome icon, case name, kind pill, findings (`file:start-end` + title, "matches" mark), dropped count, error text. A close `<button aria-label>`. An Esc `keydown` listener in an effect. On close, focus returns to the element passed as `returnFocusTo` (R-WEB-26, R-WEB-50). | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, logic-no-effect-derivation, react-hooks-conditional, sec-xss |
| `client/src/components/eval/index.ts` (new) | Re-exports `MetricBar`, `DeltaLabel`, `RunsTable`, `RunDrawer` and the helpers, following the `client/src/components/context-attach-list/index.ts` pattern. | frontend-ui-architecture, security | struct-one-way |

**Tests (test-writer):**
- Add `client/src/lib/hooks/evals.test.tsx`. The runs list and the overview refetch every 2,000 ms while a run is `running` and stop otherwise; test this by changing the mocked `fetch` answer and calling `qc.refetchQueries`, per `client/INSIGHTS.md:97-101`. A `running` → `done` transition invalidates the four keys, checked with an `invalidateQueries` spy. Create and delete invalidate `["eval-cases", agentId]`, and start invalidates runs and overview (R-WEB-20, R-WEB-21).
- Add `client/src/components/eval/helpers.test.ts`: `pct`, `deltaPoints` / `deltaText` including ±0 and nulls, and `formatRunTime` producing `2026-10-30 10:00` for a local-time ISO built in the test.
- Add `client/src/components/eval/MetricBar.test.tsx`: the percentage text, and "—" for null.
- Add `client/src/components/eval/RunsTable.test.tsx`:
  - running, failed (with error) and errored rows;
  - checkbox names and the disabled state for `failed` / `running`;
  - a checkbox click does not open the row;
  - a row click and Enter call `onOpen`;
  - costs as `$0.0040` / "—";
  - one-line ellipsis `title` on long names.
- Add `client/src/components/eval/RunDrawer.test.tsx`: outcomes, a "matches" mark, the dropped count and the error. Esc and the close button call `onClose`, and focus returns. Text with `<b>` renders literally.
- Expected to change: none.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Done when:**
- AC-55 / R-WEB-20 — a running run is re-read every 2 s, and the state comes from the server (`evals.test.tsx`).
- AC-56 / R-WEB-21 — completion invalidates the four keys.
- AC-59, AC-60 / R-WEB-24, R-WEB-25 — errored and failed rows render their texts.
- AC-61 / R-WEB-26 — the drawer lists outcomes, findings, dropped and errors, and closes on Esc with focus returned.
- AC-74 / R-WEB-39 (bars, cost cells), AC-79 / R-WEB-44 (table), AC-84 / R-WEB-49 — shown by the component tests.

### 9 · FindingCard "Turn into eval case" and the agent-id threading (`client`)

This phase gives every FindingCard its producing agent and the one-click case creation. It comes before the Evals tab so the tab can be filled from real findings.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseAction/helpers.ts` (new) | Pure `evalActionState({ accepted, dismissed, agentId, inSet, pending, saved, error })` → one of `saved`, `inSet`, `noAgent`, `open`, `pending`, `ready`, in Assumption 4's order. `kindOf(f)` → `must_find` / `must_not_flag`. | frontend-ui-architecture, security | logic-pure-domain, split-pure |
| `…/FindingCard/_components/EvalCaseAction/EvalCaseAction.tsx` (new) | Props `{ f, agentId }`. Reads `useAgentEvalCases(agentId)` (`inSet` = a case whose `source_finding_id === f.id`) and `useCreateEvalCase(agentId)`. Renders by state:<br>• the ghost `sm` `FlaskConical` button `prReview.finding.toEval`, with `title` from `toEvalHint.accepted` / `.dismissed` (R-WEB-1);<br>• disabled inside a `<span title=…>` wrapper, with a visually hidden `<span id>` referenced by the button's `aria-describedby`, for `open` (R-WEB-4), `noAgent` (R-WEB-5) and `pending` (R-WEB-7);<br>• `saved`: `evalSaved.<kind>` plus a `MonoLink` "View in Evals" to `/agents/<agentId>?tab=evals` (R-WEB-3);<br>• `inSet`: `inEvalSet` plus the same link (R-WEB-8);<br>• a failed mutation: the API's message in `role="status"`, 12 px `var(--crit)` (R-WEB-6). | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, logic-no-server-state-copy, react-hooks-conditional, sec-xss |
| `…/FindingCard/_components/EvalCaseAction/styles.ts` (new) | The Layout "FindingCard action row" line values (12 px, secondary / crit). | frontend-ui-architecture, security | split-pure |
| `…/FindingCard/_components/EvalCaseAction/index.ts` (new) | One-line re-export. | frontend-ui-architecture, security | — |
| `…/FindingCard/FindingCard.tsx` | New required prop `agentId: string | null`. Render `<EvalCaseAction f={f} agentId={agentId} />` inside `s.actions` after Dismiss. The saved, in-set or error line sits under the row, and the row keeps its existing gap and margins. | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way, split-no-nested-definitions, react-nested-component |
| `…/FindingsPanel/FindingsPanel.tsx` | New prop `agentId: string | null`, passed to every `FindingCard` (R-WEB-2). | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |
| `…/ReviewRunAccordion/ReviewRunAccordion.tsx` | Pass `agentId={review.agent_id}` to `FindingsPanel`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |
| `…/DiffTab/helpers.ts` | Add pure `agentIdByReview(reviews: ReviewRecord[]): Map<string, string | null>` (review id → `agent_id`). | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `…/DiffTab/DiffTab.tsx` | `useMemo` the map from `reviews`. `renderFinding` passes `agentId={map.get(finding.review_id) ?? null}` to `InlineFinding`, and its dependency list includes the map. | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-effect-derivation |
| `…/DiffTab/_components/InlineFinding/InlineFinding.tsx` | New prop `agentId: string | null`, passed to `FindingCard`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |
| `client/messages/en/prReview.json` | Under `finding`: `toEval`, `toEvalHint.accepted`, `toEvalHint.dismissed`, `toEvalOpen`, `toEvalNoAgent`, `evalSaved.must_find`, `evalSaved.must_not_flag`, `viewInEvals`, `inEvalSet`, with the texts in the client spec "Strings". The apostrophes around `must find` are curly or doubled (`client/INSIGHTS.md:103`). | — | — |

**Tests (test-writer):**
- Rewrite and extend `…/FindingCard/FindingCard.test.tsx`, mocking `@/lib/hooks/evals` with stable objects and `vi.importActual`:
  - accepted and dismissed cards show the enabled button with their hints;
  - an open card and a null-agent card show it disabled, with the tooltip text as `title` and as `aria-describedby`;
  - pending disables it;
  - success shows the saved line and a link to `/agents/a1?tab=evals` with no navigation;
  - the 422 "No diff available for src/config.ts" message appears in `role="status"`;
  - a case with `source_finding_id === f.id` shows "In eval set" (R-WEB-1, R-WEB-3–R-WEB-8).
- Extend `…/DiffTab/helpers.test.ts`: `agentIdByReview`.
- Expected to change, because the components now render a FindingCard that needs `agentId` and the eval hooks (mock `@/lib/hooks/evals` or wrap in a `QueryClientProvider`):
  - `…/FindingCard/FindingCard.test.tsx`: every render passes `agentId`.
  - `…/FindingsPanel/FindingsPanel.test.tsx`: passes `agentId`, plus a case asserting the card receives it (R-WEB-2).
  - `…/DiffTab/_components/InlineFinding/InlineFinding.test.tsx`: passes `agentId`, plus the same assertion.
  - `…/ReviewRunAccordion/ReviewRunAccordion.test.tsx`: the eval hooks are mocked, plus a case asserting `review.agent_id` reaches the card.
  - `…/DiffTab/DiffTab.test.tsx`: the eval hooks are mocked, plus a case asserting an inline card gets its review's agent id.

**Verify (code):** `cd client && pnpm typecheck` (may fail only in the five test files listed as expected to change) · `cd client && pnpm test` (same)
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):** On the user's running stack (`./scripts/dev.sh`, restarted after phase 7), in one tab:
1. Open `http://localhost:3000`, follow the seeded repo to PR #482, and open its Findings tab. Expand a finding. The action row (`flex`, gap 6, margin-top 12) shows Accept, Dismiss, then "Turn into eval case" (ghost, `sm`, `FlaskConical`). It is disabled, and hovering shows "No agent for this finding", because the seeded review has no agent. Compare with the design artboard "PR detail Overview" (`findings.jsx` `ActionRow`), minus Learn and Reply.
2. If the user has a review run by an agent, accept one of its findings, press the button, and screenshot the "Saved as must find · View in Evals" line (12 px, `var(--text-secondary)`, link as `MonoLink`).
3. Console: no React warnings (keys, `act`, style-property).

Use scaled screenshots or region zooms, and close the tab at the end.
**Done when:**
- AC-1 / R-WEB-1 — accepted and dismissed cards show the button with their hints.
- AC-7 / R-WEB-3 — success shows the saved line and the Evals link, with no reload.
- AC-8, AC-10 / R-WEB-4, R-WEB-5 — open and no-agent cards show it disabled with their tooltips.
- AC-13 / R-WEB-6 — the API's error is shown.
- AC-14 / R-WEB-7 — the button is disabled while pending.
- AC-16 / R-WEB-8 — "In eval set" is shown.
- R-WEB-2 — the agent id reaches the card from both the Findings panel and Files changed.
- All of the above are shown by the tests listed.

### 10 · Evals tab in the Agent editor (`client`)

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/app/agents/_components/AgentEditor/constants.ts` | `TABS` gains `{ key: "evals", labelKey: "editor.tabs.evals", icon: "Gauge" }` after `context`, and the doc comment is updated (R-WEB-9). | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `client/src/app/agents/_components/AgentEditor/AgentEditor.tsx` | Render `<EvalsTab agentId={agent.id} />` for `tab === "evals"`. The Config fallback condition also excludes `evals`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way, split-no-nested-definitions |
| `client/src/app/agents/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` (new) | Layout "Evals tab", `maxWidth: 720`:<br>• Header: `SectionLabel` `Gauge` plus the `MonoLink` "View full dashboard →" to `/evals/<agentId>` (R-WEB-15).<br>• `MetricStrip`.<br>• The scoring note.<br>• Cases header: "Eval cases", a "k / n passing" `Badge`, "N cases", and `RunEvalButton`.<br>• The case list newest first (R-WEB-10), or `evalsTab.emptyCases` with the run button disabled (R-WEB-11).<br>• Delete-confirm `Modal` with Delete and Cancel (R-WEB-12), which calls `useDeleteEvalCase` (R-WEB-13).<br>• The "Runs" section: shared `RunsTable` without selection over `useAgentEvalRuns(agentId, limit)` with a "Show more" button adding 20, and the shared `RunDrawer` on open (R-WEB-17, R-WEB-26).<br>• The outcome per case from `useEvalRun(latestDone?.id)`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, logic-no-server-state-copy, logic-no-effect-derivation, react-hooks-conditional, react-nested-component, sec-xss |
| `…/EvalsTab/CaseRow.tsx` (new) | Layout "Case row":<br>• outcome icon (pass / fail / errored / never run);<br>• name in mono with ellipsis and `title`;<br>• kind pill;<br>• sub-line `<file>:<start>-<end> — <title>` (`<file>:<line>` when start equals end);<br>• a native expand `<button aria-expanded aria-label>` showing `input_diff` in a `<pre>` as text (R-WEB-14);<br>• a native 26×26 Delete `<button aria-label="Delete case <name>">`, `disabled` while a run is `running`, keeping its label (R-WEB-57, Assumption 3). | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/EvalsTab/MetricStrip.tsx` (new) | Four tiles: recall, precision, citation with `DeltaLabel` against `previousDone`, and "Cases passed" k/N (R-WEB-18). No delta with fewer than two done runs (R-WEB-40). "—" for null. | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-pure, react-nested-component |
| `…/EvalsTab/helpers.ts` (new) | Pure:<br>• `caseLocation(case)`;<br>• `outcomeByCase(detail)`;<br>• `passingCount(cases, outcomes)`;<br>• `deleteDisabled(runs)`. | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `…/EvalsTab/styles.ts` (new) | Layout "Evals tab" and "Case row" values (`s`), with state styles as functions. | frontend-ui-architecture, security, next-best-practices | split-pure |
| `…/EvalsTab/index.ts` (new) | One-line re-export. | frontend-ui-architecture, security, next-best-practices | — |
| `client/src/components/eval/RunEvalButton.tsx` (new) | Shared by the tab and the agent view. Props `{ agentId, caseCount, runs, kind }`.<br>• Label `dashboard.runEval` "Run eval (N)" (R-WEB-27).<br>• Disabled with `dashboard.runningProgress` while a run is `running` (R-WEB-19), and disabled when `caseCount === 0`.<br>• Calls `useStartEvalRun(agentId).mutate()` once per press (R-WEB-16).<br>• An `ApiError` with `code === "eval_unavailable"` shows the message plus a link to `/settings/api-keys` (R-WEB-22). Any other error shows the message next to the button (R-WEB-23). | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, logic-no-server-state-copy, react-hooks-conditional, sec-xss |
| `client/src/components/eval/index.ts` | Export `RunEvalButton`. | frontend-ui-architecture, security | struct-one-way |
| `client/messages/en/eval.json` | `evalsTab.emptyCases` changed to the R-WEB-11 text. New: `evalsTab.viewDashboard`, `scoringNote`, `deleteConfirm`, `passing`, `casesCount`, `runsHeading`, `noKey`, `dashboard.showMore`, and the expand / delete `aria-label` texts. | — | — |

**Tests (test-writer):**
- Add `…/EvalsTab/EvalsTab.test.tsx` (fetch mocked or `@/lib/hooks/evals` mocked with stable objects):
  - rows with both kinds and every outcome icon, including never run, and the `file:line` / `file:start-end` sub-lines;
  - the empty state with the run button disabled;
  - Delete opens the confirm and confirm removes the row;
  - Delete is disabled with its `aria-label` while running;
  - the expand toggle shows the fragment as text;
  - the dashboard link;
  - "Run eval (N)" calls start once, also for a disabled agent;
  - "Running… 2/5" disabled;
  - running, errored and failed rows;
  - the metric strip with a delta, and without one for a single done run;
  - "Show more";
  - `eval_unavailable` shows the Settings link, and a generic error shows its message;
  - the drawer opens and closes on Esc.
- Add `client/src/components/eval/RunEvalButton.test.tsx` covering its states.
- Extend `client/src/app/agents/_components/AgentEditor/AgentEditor.test.tsx`: the tab list is Config, Skills, Context, Evals in that order, and `tab="evals"` renders the Evals tab with the eval hooks mocked.
- Expected to change: `AgentEditor.test.tsx`. The order test's filter list gains "Evals". Existing assertions otherwise hold.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):** On the user's running stack, in one tab:
1. Open `http://localhost:3000/agents`, select "Security Reviewer", then the Evals tab (`?tab=evals`). Compare with the design artboard "Agents → Evals tab" (`screen_agents.jsx` `EvalsTab`, `EvalMetricStrip`, `EvalCaseRow`):
   - body padding 28 and `maxWidth: 720`;
   - metric strip tiles: padding `11px 13px`, radius 9, value 22 px in the metric colour, delta "▲ +0pt" style;
   - scoring note 11.5 px;
   - case rows: padding `10px 12px`, radius 7, mono name 12.5 px weight 600, kind pills (must find accent, must not flag muted), sub-line 11.5 px;
   - "Run eval (2)" secondary `sm` with `Play`;
   - the Runs section below with the two seeded runs.
2. Expand one case and check the `<pre>` (mono 12 px, max-height 320).
3. Open a run row and check the drawer (width 440, right side).
4. Console: no React warnings.

Use scaled screenshots, one tab, closed at the end.
**Done when:**
- AC-19 / R-WEB-9 — the tab is listed and rendered for `?tab=evals`.
- AC-20 / R-WEB-10 — rows show name, kind and location.
- AC-22 / R-WEB-11 — the empty state disables the run button.
- AC-23, AC-24 / R-WEB-12, R-WEB-13 — deletion asks for confirmation, then removes the row.
- AC-26 / R-WEB-14 — the fragment is shown as text.
- AC-27 / R-WEB-15 — the dashboard link is shown.
- AC-51 / R-WEB-16 — the run button starts a run.
- AC-52 / R-WEB-17 — the runs list is shown.
- AC-53 / R-WEB-18 — the metric strip is shown.
- AC-54 / R-WEB-19 — "Running… k/N" disabled.
- AC-57, AC-58 / R-WEB-22, R-WEB-23 — the errors are shown.
- AC-62 / R-WEB-27 — "Run eval (N)".
- AC-75 / R-WEB-40 (strip) — no delta with fewer than two done runs.
- AC-98 / R-WEB-57 — Delete is disabled while a run is running.
- All of the above are shown by `EvalsTab.test.tsx` and `RunEvalButton.test.tsx`.

### 11 · Sidebar item and the `/evals` overview (`client`)

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/components/app-shell/nav.ts` | Skills Lab gains `{ key: "eval", icon: "Gauge", href: "/evals" }` after `conventions` (R-WEB-28). `shell.json` `nav.eval` already exists. | frontend-ui-architecture, security | struct-one-way |
| `client/src/app/evals/page.tsx` (new) | A thin client page that renders `<EvalOverview />`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |
| `client/src/app/evals/_components/EvalOverview/EvalOverview.tsx` (new) | `AppShell` with crumb `page.crumbSkillsLab` › `page.crumbEvalDashboard`. Page container `padding: 20px 28px 40px`, `maxWidth: 980`. The Layout "Overview header" without a Run-all button. The "Agents" section: one `AgentRow` per `EvalOverview.agents` entry, disabled agents included (R-WEB-42), or an `EmptyState` `dashboard.noAgents` with a link to `/agents` (R-WEB-41). The "Recent eval runs · all agents" section with `RecentRunRow`s (R-WEB-30). Navigation through `router.push(`/evals/${agentId}`)` (R-WEB-31). Reads `useEvalOverview()`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, logic-no-server-state-copy, react-nested-component, sec-xss |
| `…/EvalOverview/AgentRow.tsx` (new) | A `<button>` with the Layout "Overview Agents" values:<br>• icon box;<br>• name with ellipsis and `title`;<br>• model chip;<br>• sub-line `dashboard.lastRun` (version, `formatRunTime`, passed / total) or `dashboard.noAgentRuns`;<br>• a 60×24 `Sparkline` of the recall trend when a done run exists (R-WEB-56, Assumption 5);<br>• mini metrics Recall, Prec, Cite ("—" for null);<br>• `ChevronRight`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/EvalOverview/RecentRunRow.tsx` (new) | A `<button>` grid row `180px 150px 70px 1fr 1fr 1fr 80px`: agent name, run time, version, three `MetricBar`s, passed / total. A running row shows "Running… k/N" and a failed row "failed" in place of the bars. | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/EvalOverview/helpers.ts` (new) | Pure `sparklinePoints(trend)` (Assumption 5) and `lastRunParams(latest)`. | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `…/EvalOverview/styles.ts` (new) | Layout values; hover is a function returning a complete object. | frontend-ui-architecture, security, next-best-practices | split-pure |
| `…/EvalOverview/index.ts` (new) | One-line re-export. | frontend-ui-architecture, security, next-best-practices | — |
| `client/messages/en/eval.json` | `dashboard.lastRun`, `noAgentRuns`, `noAgents`, `recentAll`, the overview subtitle, and the mini-metric labels. | — | — |

**Tests (test-writer):**
- Extend `client/src/components/app-shell/nav.test.ts`: Skills Lab items are `skills`, `agents`, `conventions`, `eval`, and `eval` has icon `Gauge` and href `/evals` (R-WEB-28).
- Add `client/src/app/evals/_components/EvalOverview/EvalOverview.test.tsx` (`next/navigation` mocked with one stable router):
  - an agent with a done run (metrics, last-run line, sparkline present);
  - an agent with none ("No eval runs yet");
  - a disabled agent listed;
  - no agents gives the empty state with the `/agents` link;
  - six recent runs with agent names, a running and a failed row;
  - clicking an agent row and a recent row calls `push("/evals/<id>")`.
- Add `…/EvalOverview/helpers.test.ts`: `sparklinePoints` with nulls and with a single point.
- Expected to change: none.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):** On the user's running stack, in one tab:
1. The sidebar Skills Lab reads Skills, Agents, Conventions, Eval Dashboard (`Gauge`).
2. Open `http://localhost:3000/evals` and compare with the design artboard "Eval dashboard" (`screen_skills.jsx` `AgentEvalOverview`):
   - container `padding: 20px 28px 40px`, `maxWidth: 980`;
   - h1 22 px weight 700;
   - agent rows: padding `14px 16px`, radius 10, a 34×34 icon box, name 14.5 px weight 700, model chip mono 10.5 px, sparkline 60×24, mini metrics 18 px in their colours, `ChevronRight`;
   - the recent-runs panel grid `180px 150px 70px 1fr 1fr 1fr 80px`, row padding `10px 16px`;
   - "Security Reviewer" shows 100 / 100 / 100 and the two seeded runs appear in the feed.
3. Hover a row (`var(--bg-hover)`).
4. Console: no React warnings.

One tab, scaled screenshots, closed at the end.
**Done when:**
- AC-63 / R-WEB-28 — the sidebar item is present.
- AC-64 / R-WEB-29 — rows with the latest done metrics or "No eval runs yet".
- AC-65 / R-WEB-30 — the six recent runs with agent names.
- AC-66 / R-WEB-31 — navigation to `/evals/<agentId>`.
- AC-76 / R-WEB-41 — the empty state.
- AC-77 / R-WEB-42 — disabled agents listed.
- AC-91 / R-WEB-56 — the sparkline.
- All of the above are shown by `EvalOverview.test.tsx` and `nav.test.ts`.

### 12 · The agent's dashboard view `/evals/:agentId` (`client`)

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/app/evals/[agentId]/page.tsx` (new) | Thin: `useParams<{ agentId: string }>()` → `<Suspense><AgentEvalView agentId={agentId} /></Suspense>`, as `client/src/app/agents/[id]/page.tsx` does. | frontend-ui-architecture, react-best-practices, security, next-best-practices | struct-one-way |
| `client/src/app/evals/[agentId]/_components/AgentEvalView/AgentEvalView.tsx` (new) | `AppShell` crumb `page.crumbSkillsLab` › `page.crumbEvalDashboard` › the agent's name.<br>• The back link "All agents".<br>• Header: name, model chip, subtitle "Regression harness · N runs on M cases", an agent `Dropdown` from `useAgents()` that navigates with `router.push`, and `RunEvalButton` (R-WEB-16, R-WEB-19).<br>• `RegressionBanner` when `precisionDip(runs)` is set (R-WEB-54).<br>• `MetricCards`.<br>• `TrendCard`.<br>• The "Recent runs" header with the selection hint.<br>• The shared `RunsTable` **with** `selection`: state `selected: string[]`, toggled through `toggleSelection` (R-WEB-33, R-WEB-37, R-WEB-38, R-WEB-48).<br>• `useAgentEvalRuns(agentId, limit)` with `limit` starting at 20 and "Show more" adding 20 while `total > runs.length` (R-WEB-43).<br>• `RunDrawer` on row open.<br>No Compare button yet (phase 13). | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, logic-no-server-state-copy, logic-no-effect-derivation, react-hooks-conditional, react-nested-component, sec-xss |
| `…/AgentEvalView/MetricCards.tsx` (new) | Three cards per Layout "Metric cards": value 30 px with "%" suffix, a 56×20 sparkline, and a `DeltaLabel` against the previous done run (R-WEB-32). No delta with fewer than two done runs (R-WEB-40). "—" for null (R-WEB-39). Not the vendored `MetricCard`. | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-pure, react-nested-component |
| `…/AgentEvalView/TrendCard.tsx` (new) | A `Card` with `SectionLabel` `TrendingUp` "Metric trend" and the legend. A `recharts` `ResponsiveContainer` (height 200) with `LineChart` and three `Line`s in the metric colours, dots shown, `connectNulls={false}`. The data is `trendPoints(runs)` (done runs oldest first, nulls kept). The tooltip `content` renders `trendTooltipLabel(point)` as text (R-WEB-55). | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/AgentEvalView/RegressionBanner.tsx` (new) | Layout "Regression banner" with `dashboard.regression` "Precision dipped {n} pts on v{version}". | frontend-ui-architecture, react-best-practices, security, next-best-practices | split-pure |
| `…/AgentEvalView/helpers.ts` (new) | Pure:<br>• `toggleSelection(selected, id)`: keeps at most two, drops the earliest-selected, and removes `id` if already selected;<br>• `precisionDip(runs)` → `{ n, version } | null`, comparing shown percentages;<br>• `trendPoints(runs)`;<br>• `trendTooltipLabel(point)` → `"v{version} · {formatCostUsd(cost)}"`;<br>• `metricSpark(runs, metric)`. | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `…/AgentEvalView/styles.ts` (new) | Layout values for the back link, header, banner, cards and trend card. | frontend-ui-architecture, security, next-best-practices | split-pure |
| `…/AgentEvalView/index.ts` (new) | One-line re-export. | frontend-ui-architecture, security, next-best-practices | — |
| `client/messages/en/eval.json` | `dashboard.allAgents`, `regression`, `selectHint`, `selected`, the subtitle, the card labels, and `metricTrend` (kept). | — | — |

**Tests (test-writer):**
- Add `client/src/app/evals/[agentId]/_components/AgentEvalView/AgentEvalView.test.tsx` (`next/navigation` and the hooks mocked):
  - cards with "▲ +50pt", "▼ −8pt" and "±0pt";
  - null metrics give "—" with no delta;
  - a single done run gives no delta;
  - checkbox names "2026-10-30 10:00 · v1" with `TZ` handled by building the ISO in local time;
  - failed and running checkboxes disabled;
  - selecting a third run drops the earliest;
  - the banner shown and hidden;
  - the trend card's title present;
  - "Show more" requests limit 40;
  - ellipsis `title` on the agent name;
  - "Run eval (N)" starts a run.
- Add `…/AgentEvalView/helpers.test.ts`: `toggleSelection`, `precisionDip`, `trendPoints` keeping nulls as gaps, and `trendTooltipLabel` giving "v3 · $0.0040" and "v3 · —". This is the pure helper the client spec names; jsdom gives `ResponsiveContainer` no size, so the chart itself is not rendered in tests.
- Expected to change: none.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):** On the user's running stack, in one tab:
1. Open `http://localhost:3000/evals`, click "Security Reviewer", and compare `/evals/<id>` with the design artboard "Eval dashboard" (`ScreenEval`, `MetricCard`):
   - back link "All agents" (12.5 px weight 600);
   - h1 22 px with the model chip, and the subtitle "Regression harness · 2 runs on 2 cases";
   - agent `Dropdown` (width 220) and "Run eval (2)" primary `sm`;
   - three metric cards: padding 16, radius 9, value 30 px, "±0pt" on Recall and "▲ +50pt" on Precision;
   - the Metric trend card (height 200, three coloured lines, dots); hover a point and read the tooltip "v1 · $0.0040";
   - the runs table header grid `34px 150px 70px 1fr 1fr 1fr 90px 80px` with the 16×16 checkboxes, and costs "$0.0040" / "$0.0030".
2. Tab to a checkbox and toggle it with Space.
3. Console: no React warnings, and no recharts width or height warning.

One tab, scaled screenshots, closed at the end.
**Done when:**
- AC-67 / R-WEB-32 — metric cards with signed point deltas.
- AC-68 / R-WEB-33 — the runs table with checkboxes.
- AC-72 / R-WEB-37 — a third pick drops the earliest.
- AC-73 / R-WEB-38 — failed and running checkboxes disabled.
- AC-75 / R-WEB-40 — no delta with fewer than two done runs.
- AC-78 / R-WEB-43 — "Show more".
- AC-79 / R-WEB-44 — ellipsis with the full text as tooltip.
- AC-83 / R-WEB-48 — checkbox names.
- AC-89 / R-WEB-54 — the banner.
- AC-90 / R-WEB-55 — the tooltip label helper.
- AC-54 / R-WEB-19 on the dashboard — "Running… k/N" disabled.
- All of the above are shown by `AgentEvalView.test.tsx` and its `helpers.test.ts`.

### 13 · Compare modal, word diff and `?compare=` (`client`)

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/components/eval/word-diff.ts` (new) | Pure `wordDiff(oldText, newText): { type: 'same' | 'add' | 'del'; text: string }[]`. Split on `/(\s+)/` keeping whitespace tokens, LCS over tokens with typed-array rows, adjacent same-type tokens merged (R-WEB-36). | frontend-ui-architecture, security | logic-pure-domain |
| `client/src/components/eval/helpers.ts` | Add:<br>• `costDelta(oldUsd, newUsd)` → `"−$0.0010"` / `"+$…"` / `"±$0.0000"` / null when either is null (R-WEB-35, Assumption 8);<br>• `orderPair(a, b)` (older by `started_at`);<br>• `sameConfig(a, b)` (`system_prompt`, `model` and `skills` equal);<br>• `configDiffers(a, b)` (`model` or `skills` differ);<br>• `flippedCases(oldDetail, newDetail)` → `{ name, old, new }[]` over case names present in both with different `outcome` (R-WEB-51). | frontend-ui-architecture, security | logic-pure-domain |
| `client/src/components/eval/CompareModal.tsx` (new) | Vendored `Modal` with width 960, title "Compare runs · v<old> → v<new>", and the subtitle. The body `<div>` has padding `16px 18px`, `maxHeight: 560`, `overflow: auto` (R-WEB-45). Content in order:<br>• Four tiles: Recall, Precision, Citation (old, `ArrowRight`, new, `DeltaLabel`) and Cost (`formatCostUsd` old and new plus `costDelta`) (R-WEB-35).<br>• The configuration block with each run's model and `name@vN` list when `configDiffers` (R-WEB-46).<br>• The prompt diff: legend plus a box of `<span>` text nodes styled add / del / same (R-WEB-36).<br>• Or `dashboard.compare.noChange` in place of both when `sameConfig` (R-WEB-47).<br>• "Cases that changed result" from `flippedCases`, or `noFlips`.<br>• Footer: Close (ghost).<br>It reads `useEvalRun` for both ids. No HTML is built from prompt text. | frontend-ui-architecture, react-best-practices, security | split-no-nested-definitions, split-pure, react-nested-component, sec-xss |
| `client/src/components/eval/styles.ts` | Layout "Compare modal" values (tiles, legend swatches, diff box, token styles as functions). | frontend-ui-architecture, security | split-pure |
| `client/src/components/eval/index.ts` | Export `CompareModal` and `wordDiff`. | frontend-ui-architecture, security | struct-one-way |
| `client/src/app/evals/[agentId]/_components/AgentEvalView/AgentEvalView.tsx` | The Compare button in the runs header: icon `GitMerge`, `sm`, primary when exactly two runs are selected, else ghost and disabled (R-WEB-34).<br>• Pressing it sets `?compare=<olderId>,<newerId>` with `router.replace` (R-WEB-52).<br>• The modal renders while `parseCompareParam(search.get("compare"))` yields two ids whose `useEvalRun` details are both `done` and belong to `agentId` (R-WEB-53, Assumption 9). Any other value renders nothing.<br>• Close removes the parameter with `router.replace`.<br>• The `selected` state is initialised from a valid parameter through the `useState` initialiser. | frontend-ui-architecture, react-best-practices, security, next-best-practices | logic-no-effect-derivation, logic-no-server-state-copy, react-hooks-conditional |
| `client/src/app/evals/[agentId]/_components/AgentEvalView/helpers.ts` | Add pure `parseCompareParam(value): [string, string] | null` (two comma-separated non-empty ids, otherwise null). | frontend-ui-architecture, security, next-best-practices | logic-pure-domain |
| `client/messages/en/eval.json` | `dashboard.compare.*` (`title`, `subtitle`, `promptDiff`, `old`, `new`, `noChange`, `configuration`, `flipped`, `noFlips`, `close`) and the Compare button label. | — | — |

**Tests (test-writer):**
- Add `client/src/components/eval/word-diff.test.ts`: an insertion, a deletion, identical prompts (all `same`), and kept whitespace and newlines.
- Extend `client/src/components/eval/helpers.test.ts`: `costDelta` (0.004 → 0.003 gives "−$0.0010", a null gives null), `sameConfig`, `configDiffers`, `flippedCases`.
- Add `client/src/components/eval/CompareModal.test.tsx`:
  - four tiles with "50%" → "100%" and "▲ +50pt", "±0pt", and "$0.0040" → "$0.0030" with "−$0.0010";
  - the configuration block only when the model or skills differ;
  - the no-change text;
  - flipped cases;
  - a body `maxHeight` of 560;
  - prompt text containing `<script>` rendered literally.
- Extend `…/AgentEvalView/AgentEvalView.test.tsx`:
  - Compare is disabled with 0, 1 or 3 selected and enabled with 2;
  - pressing it calls `replace` with `?compare=<older>,<newer>`;
  - a valid parameter renders the modal with both runs selected;
  - unknown, failed, running and other-agent ids render no modal;
  - close calls `replace` without `compare`.
- Extend `…/AgentEvalView/helpers.test.ts`: `parseCompareParam`.
- Expected to change: none.

**Verify (code):** `cd client && pnpm typecheck` · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):** On the user's running stack, in one tab:
1. On `/evals/<Security Reviewer id>`, tick both seeded runs and press Compare. The URL gains `?compare=…`. Compare with the design artboard "Compare runs" (`RunCompare`, `CompareMetric`):
   - modal width 960, title "Compare runs · v1 → v1";
   - tiles: padding `12px 14px`, radius 9, new value 21 px in the metric colour;
   - Precision "50% → 100% ▲ +50pt", Citation "67% → 100% ▲ +33pt", Cost "$0.0040 → $0.0030 −$0.0010";
   - "System prompt diff" with legend swatches 11×11, the removed sentence struck through on `var(--code-del)`, and the diff box mono 12.5 px with line-height 1.75;
   - "Cases that changed result" listing `no-n-plus-one-user-list: fail → pass`;
   - the body scrolls inside 560 px.
2. Reload the page: the modal reopens from the URL.
3. Close it: the parameter is removed.
4. Console: no React warnings.

One tab, scaled screenshots, closed at the end.
**Done when:**
- AC-69 / R-WEB-34 — Compare is enabled only with exactly two runs selected.
- AC-70 / R-WEB-35 — four tiles with old, new and signed deltas, cost through `formatCostUsd`.
- AC-71 / R-WEB-36 — word-level prompt diff.
- AC-74 / R-WEB-39 (cost) — "—" and no delta for a null cost.
- AC-80 / R-WEB-45 — body at most 560 px, scrolling.
- AC-81 / R-WEB-46 — configuration block when model or skills differ.
- AC-82 / R-WEB-47 — "No config change between these runs".
- AC-86 / R-WEB-51 — flipped cases.
- AC-87 / R-WEB-52 — `?compare=` held while open.
- AC-88 / R-WEB-53 — the modal opens from the URL only for two valid done runs.
- All of the above are shown by `CompareModal.test.tsx`, `word-diff.test.ts` and `AgentEvalView.test.tsx`.

### 14 · `scripts/verify-l06.sh` (repository root)

This phase comes after every eval test exists, so the script selects them all. The repository root gets no `package.json`, `.npmrc`, `pnpm-workspace.yaml` or lockfile. The script is run directly as `./scripts/verify-l06.sh` and calls pnpm and npm only inside `server/`, `client/` and `reviewer-core/`. Each of those has its own `package.json` and lockfile, and the two pnpm packages have their own `pnpm-workspace.yaml` (`server/pnpm-workspace.yaml`, `client/pnpm-workspace.yaml`), so pnpm never resolves a project at the root (root `INSIGHTS.md:416-431`).

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `package.json` (root) — **delete** | The blocked first run left an untracked root `package.json`. Delete it. Also delete these root files if present: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and `node_modules/`, left by the earlier `pnpm verify:l06` run. `node_modules/` is git-ignored (`.gitignore:1`), so check with `ls -a`, not `git status`. Create none of them (R-SRV-44). | — (no skill glob) | — |
| `scripts/verify-l06.sh` (new, executable: `chmod +x`, so git records mode `100755`, because it is run as `./scripts/verify-l06.sh`) | `#!/usr/bin/env bash` and `set -euo pipefail`. The header comment names the command `./scripts/verify-l06.sh`, never `pnpm verify:l06`. Resolve `ROOT` from `${BASH_SOURCE[0]}`. `export npm_config_verify_deps_before_run=false` and `export pnpm_config_verify_deps_before_run=false` (the same setting under pnpm's own prefix).<br>**Docker check**, before any server step: `docker info >/dev/null 2>&1`, else print `Docker is required for the eval integration tests` to stderr and `exit 1` (R-SRV-47).<br>A `step <name> <cmd…>` helper prints the step name, runs the command in a subshell inside its package, and on failure prints `FAILED: <name>` and exits with that code (R-SRV-45). Steps, in order:<br>1. `server`: `pnpm typecheck`.<br>2. `server`: the hermetic lane, `pnpm exec vitest run --exclude '**/*.it.test.ts'` with the files of the bash glob `test/eval-*.test.ts` (minus `*.it.test.ts`) plus `test/contracts-sync.test.ts`.<br>3. `server`: the integration lane, `pnpm exec vitest run --no-file-parallelism --reporter=default --reporter=json --outputFile.json=<mktemp file>` with the files of `test/eval-*.it.test.ts`. A `node -e` check then fails the step with `eval integration tests were skipped` when the JSON's `numPendingTests + numTodoTests > 0` or `numPassedTests === 0` (Q7).<br>4. `server`: `pnpm arch:check`.<br>5. `client`: `pnpm typecheck`.<br>6. `client`: `pnpm exec vitest run app/evals/ EvalsTab components/eval/ FindingCard FindingsPanel InlineFinding app-shell/nav hooks/evals`.<br>7. `reviewer-core`: `npm run typecheck`.<br>8. `reviewer-core`: `npm test`.<br>The script installs nothing, reads no secret and sets no key (R-SRV-46). It ends by printing `verify-l06 passed`. | — (no skill glob) | — |

**Tests (test-writer):**
- No test file. R-SRV-44–R-SRV-47 are verified by the commands of `Verify (phase)`, as the server spec says. test-writer runs them and reports each line.
- Expected to change: none.

**Verify (code):** `./scripts/verify-l06.sh` (from the repository root, alone, with no other test command in flight)
**Verify (phase):** from the repository root, one at a time:
1. `./scripts/verify-l06.sh`. It exits 0, prints all eight step names and `verify-l06 passed`. Afterwards `ls -a` at the root shows no `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` or `node_modules`.
2. `HOME="$(mktemp -d)"` holding only a `.docker` symlink to the real `~/.docker`, with `DOCKER_HOST=unix://<real home>/.docker/run/docker.sock`, then `./scripts/verify-l06.sh`. It exits 0, proving no key is read (`server/INSIGHTS.md:157`).
3. `DOCKER_HOST=unix:///nonexistent.sock ./scripts/verify-l06.sh; echo "exit=$?"`. It prints "Docker is required for the eval integration tests" and `exit=1`, and no `==> server` step ran.
4. `test -x scripts/verify-l06.sh && echo executable` prints `executable`, and `git ls-files package.json .npmrc pnpm-lock.yaml pnpm-workspace.yaml` prints nothing.

**Done when:**
- AC-95 / R-SRV-44, R-SRV-45 — `./scripts/verify-l06.sh`, run from the repository root, runs every named step inside its package, fails on a skipped integration test, and exits 0 only when all pass. The root holds no `package.json`, `pnpm-workspace.yaml`, `.npmrc`, lockfile or `node_modules` before or after the run.
- AC-96 / R-SRV-46 — it is green with no key reachable.
- AC-97 / R-SRV-47 — with Docker unreachable it prints the message and exits 1 before any server step.

### 15 · Browser flow over the seeded eval runs (`e2e`)

This phase is the deterministic flow for the dashboard and Compare over the phase-7 fixture, with no model call.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| Nothing — test-writer only | — | — | — |

**Tests (test-writer):**
- Add `e2e/specs/15-eval-dashboard.flow.json`:
  1. Open `{BASE}/evals`, `wait --text "Security Reviewer"`.
  2. Click the agent row: `find role button --name "Security Reviewer"`. Either matching button leads to the same agent.
  3. `wait --url "/evals/"`, `wait --text "Recent runs"`, then `wait --text "2026-10-30"` and `wait --text "2026-10-31"` (AC-93).
  4. `find role checkbox --name "2026-10-30" click`, `find role checkbox --name "2026-10-31" click`.
  5. `wait --text "Compare"` and click it.
  6. `wait --text "+50pt"` and `wait --text "Flag every database query inside a loop"` (the removed prompt sentence) (AC-94).
  7. `wait --url "compare="`.

  The date parts match the fixed-format checkbox names (Q11) for any local zone from UTC−10 to UTC+13.
- Add to `e2e/specs/seed-fixtures.md`: the eval fixture contract — agent "Security Reviewer", the two case names, run dates `2026-10-30T10:00Z` / `2026-10-31T10:00Z`, precision 0.5 → 1, the added prompt sentence, costs 0.004 / 0.003 — and which flow relies on it.
- Add the flow's row to `e2e/specs/README.md`.
- Expected to change: none.

**Verify (phase):** the main session first asks the user to stop their dev stack, or uses a separate worktree (`e2e/INSIGHTS.md:90-99`). Then `cd e2e && npm run typecheck && npm run e2e:hermetic`, run alone with no other test command in flight. Every flow passes, including `15-eval-dashboard`.
**Done when:**
- AC-93 — on the freshly seeded hermetic stack, `/evals/<Security Reviewer>` shows the two seeded runs with no API key and no model call.
- AC-94 — comparing them shows the prompt diff and "+50pt".
- Both are shown by `15-eval-dashboard.flow.json` passing in `npm run e2e:hermetic`.

## Out of scope
- **Every Non-goal of `specs/eval-pipeline.md`:**
  - agent export;
  - stretch items 1, 2, 4 and 5 (no Case Editor; the `caseEditor.*` strings stay unused);
  - skill-owned cases;
  - "Run all agents", "Promote vN", the "30 days" filter, per-case Run and Edit;
  - cancelling a run;
  - a `devdigest-mcp` eval tool;
  - an automated "prompt change moves metrics" test;
  - fixing the unwrapped PR title in the task line;
  - updating a case when its finding is re-decided.
- **Any change to `reviewer-core/**`, `mcp/**` or `evals/**`,** or to `knowledge.ts` / `eval-ci.ts`.
- **Refactoring `ReviewService`, `reviews/run-executor.ts`, `reviews/diff-loader.ts` or `reviews/repository/skill.repo.ts`.** The eval module keeps its own copies of the two small reads (R2), and `ReviewService` stays baselined (Q2).
- **CI workflow changes:** `.github/workflows/**` is unchanged. The new test files fall under the existing package path filters.
- **Documentation, written by `doc-writer` after verification** (server and client spec "Documentation"):
  - `server/README.md` API map (the `eval` module and its seven routes);
  - `server/docs/schema.md` (the three tables, and the note that `eval_cases.owner_id` has no FK so the agent delete removes cases);
  - `server/docs/architecture.md` (the eval run's background lifecycle and the boot reap);
  - `server/src/modules/eval/README.md`;
  - `client/README.md` route map (`/evals`, `/evals/:agentId` with `?compare=`, `?tab=evals`);
  - `client/docs/data-flow.md` (eval query keys, the polling rule, the invalidations);
  - a `./scripts/verify-l06.sh` row in the root `CLAUDE.md` Commands table and in `TESTING.md`.
- **The course delivery items** (demo video, screenshot, PR) are tracked by the main session.

## Risks
- **An orphaned or stuck run.** A run left `running` while the process lives would block the agent behind the 409. The executor's whole body is in `try/catch` and finishes the run `failed` on any throw outside a case. A vanished run row is a quiet stop. `eval-pipeline.it.test.ts` covers the mid-run agent delete and asserts no unhandled rejection.
- **FK-violation mapping depends on drizzle-kit's generated constraint names.** `storeResult` must tell `case_id` from `suite_run_id`. The repository reads the names from the generated schema, not guessed literals, and the mid-run delete test pins both paths.
- **Interference between `.it` files.** Seeded eval rows (from phase 7) and the shared database could break count assertions in other `.it` files. The eval tests use their own agents and a fresh workspace where counts matter (Constraints). The integration lane always runs with `--no-file-parallelism`.
- **Self-skipping integration tests.** `.it` files self-skip under Docker load and count as green. `verify-l06.sh` fails on any skipped integration test (Q7), and the Docker check runs first.
- **pnpm writing files at the root.** On pnpm 12.4.2 a root `package.json` makes `pnpm verify:l06` install the root project, writing `node_modules/` and `pnpm-lock.yaml` at the root (seen in the first phase-14 run), and a root `.npmrc` does not prevent it. So there is no root `package.json`. The script is run directly and calls pnpm only inside `server/` and `client/`, which each have their own `pnpm-workspace.yaml`. Phase 14's Verify checks the root with `ls -a`.
- **Word-diff cost.** LCS over tokens is O(n·m). Prompts of a few thousand tokens are fine with typed-array rows. If a real prompt is visibly slow, report it as an insight; the algorithm can change later without changing the spec.
- **Hook churn in existing PR-detail tests.** Adding hooks under `FindingCard` breaks five existing test files at once. Phase 9 lists every one of them as expected to change, and the hook lives in the `EvalCaseAction` leaf so the mocks stay small.
- **recharts in jsdom.** `ResponsiveContainer` measures 0 in jsdom, so a chart test would prove nothing. The tooltip text is tested through the pure helper, and the chart itself is checked in the phase-12 screenshot row.
- **The hermetic e2e run and the dev server share `client/.next`.** The phase-15 Verify asks the user to stop the dev stack, or uses a worktree, first.
- **Migrating `AgentsService` could break agent routes.** The agents `.it` files (`agents-versions`, `agents-skills`, `project-context`) run in phase 5's integration lane, and `arch:check` must show only the removed baseline entry.

## Open questions
- **OQ-1 (non-blocking; picked: no-agent first).** When a finding is both undecided and has no agent, which tooltip does the disabled button show? Options: "No agent for this finding" first (it never clears for that review) or "Accept or dismiss the finding first". The plan uses no-agent first (Assumption 4).
- **OQ-2 (non-blocking; picked: loaded runs).** Should the trend chart and metric-card sparklines draw only the runs loaded on the view (newest 20, more with "Show more"), or every done run of the agent? Every done run would need another request. The plan uses the loaded runs (Assumption 6).
- **OQ-3 (non-blocking; picked: native buttons).** The vendored `IconBtn` cannot be disabled and has no `aria-expanded`, so the case row's Delete and expand controls are native buttons styled like `IconBtn`, as Q5 did for the checkbox. If the user wants a different reading of R-WEB-12 / R-WEB-57, it goes back to `spec-creator`.

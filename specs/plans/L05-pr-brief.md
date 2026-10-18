# Implementation Plan: PR Why + Risk Brief (L05 homework)

**Goal:** A cached, SHA-bound PR Brief on the Overview tab: one structured `risk_brief` model call over computed facts, its answer validated against the PR's files and blast map, and a Review focus jump into Files changed. · **Packages:** server, client, e2e (and the client's synced contract copy) ·
**Spec:** `specs/L05-pr-brief.md` (SPEC-2026-10-17-pr-brief), `server/specs/L05-pr-brief.md`, `client/specs/L05-pr-brief.md`; approved again 2026-10-18 after the AC-19 / R-WEB-19 / EC-32 rewording (commit `8bde729`) · **Execution mode:** multi-agent ·
**Review answers:**
- Q1 → the linked issue is the first bare `#N` in text order on the sanitised description, using the intent boundaries `(?<![\w/&#])#(\d+)(?![\w-])` with N > 0; `owner/repo#N` and URLs do not count.
- Q2 → findings come from the single newest `reviews` row of kind `review` for the PR (any agent), non-dismissed findings only.
- Q3 → `none_attached` wins over `not_cloned`.
- Q4 → the issue body is cut only as a trim step (R-SRV-17 as written).
- Q5 → blast callers are dropped one at a time from the end; `omitted` is the number dropped.
- Q6 → `trimmed` / `over_budget` wins over a degraded-but-used reason.
- Q7 → `+c,0` hunks are left out of the ranges sent and out of the move targets; a file with no new-side range keeps the model's line.
- Q8 → Risk areas render in every IntentCard state.
- Q9 → approved: `sanitizeText` and `capWords` move to `server/src/modules/_shared/text/`; `intent/domain.ts` re-exports them.
- Q10 → approved: a `container.blast` getter, used by `blast/routes.ts`.
- Q11 → the model call passes `reasoning: false`.
- Q12 → resolved by the spec change.
- Q13 → a hermetic `server/test/contracts-sync.test.ts`; CI unchanged.
- Q14 → no 16,000-token run cap in the workspace read.
- Q15 → the seed keeps `blast: null`.
- R1–R7 accepted, except the `--exact` part of R4 (see Assumptions). R8 applied in the spec. R9 not chosen.

**Assumptions:**
- `reasoning: false` is added to the R-SRV-19 call (Q11). Providers without the switch ignore it.
- `--exact` is not added to flows 05/11. The tab's accessible name includes its count ("Files changed" followed by `9`: the count is a child text node, `client/src/vendor/ui/kit/Tabs.tsx:44-48`), so `--exact "Files changed"` would match nothing. The tab bar renders before the brief in DOM order (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:131-142`), and agent-browser takes the first match, so flows 05/11 stay unchanged.
- If `container.blast.forPull` throws, the brief records `blast_radius` as `missing` / `no_data` and goes on (AC-53).
- UI copy that the client spec does not spell out is fixed in phase 6, with these values: `loadFailed` "The brief could not be loaded.", `retry` "Try again", `noApiKey` "Add the key in Settings", `footer.generated` "generated {time}", `inputs.item` "{kind} ({reason})", `inputs.omitted` "{count} left out", plus one label per `inputs.kind.*` / `inputs.reason.*` value.
- The seeded brief's `generated_at` is the fixed `2026-10-18T00:00:00.000Z`.
- Q13: `server-unit.yml` is left unchanged.

## Context read
| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` | Contracts live once in `server/src/vendor/shared`; the client copy is synced. Do-not-touch: migrations, lock files, `client/src/vendor/**`. Per-package package managers. |
| `server/CLAUDE.md` | Module layout (`routes.ts`, `service.ts`, `repository.ts`); schema-first routes; `*.it.test.ts` split; split test commands; rate limit off under `NODE_ENV=test`. |
| `client/CLAUDE.md` | Pages thin; data only through `src/lib/hooks/*`; `next-intl` strings; type-only imports from `@devdigest/shared`; component folder naming. |
| `e2e/CLAUDE.md` | Flows are JSON data; `wait` steps are the assertions; deterministic locators; seeded read-only data; `npm run e2e:hermetic`. |
| `TESTING.md` | server-unit vs server-integration (`*.it.test.ts`); client jsdom with `fetch` mocked; e2e on seeded data with no LLM. |
| `specs/L05-pr-brief.md` + module specs | Every criterion cited below; contract shapes (server spec "Contracts"); generation order; seeded brief; client Layout and Strings. |
| `.claude/skills/pr-self-review/routing.json` | Skills and `critical_rules` per file glob. |
| `.claude/skills/onion-architecture/SKILL.md` | Placement table (`:33-41`), rule IDs (`:54-115`). |
| `server/.dependency-cruiser.cjs` | `dep-no-cross-module` exempts `_shared` (`:66-73`); the composition root may import modules (`:12`, `:98-103`). |
| `server/src/modules/intent/{service,domain,prompt,routes}.ts` | Patterns copied: provider resolved before GitHub, `AppError(…,400)` for a missing key, `withTimeout` with `AbortController`, `wrapUntrusted` fences, per-route rate limit. |
| `server/src/modules/blast/*`, `server/src/platform/container.ts` | `BlastService` construction to move (Q10). |
| `server/src/modules/project-context/*` | `forRun`, `mergeEffective`, the store port; the base for the workspace read. |
| `server/src/db/seed.ts`, `e2e/specs/seed-fixtures.md` | Seed blocks outside `if (!pr)`; PR #482 patches and lines; contracts of flows 10 and 12. |
| `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/src/components/diff-viewer/**` | Page tab state, `OverviewTab`, `IntentCard`, `DiffTab`, `RoleGroup`, `FileCard`, `CodeLine`. |
| `e2e/specs/05,10,11,12*.flow.json` | Locators and waits that the Overview change touches. |

## Constraints
- **Architecture:** a module never imports another module, not even `import type`; reach the other modules through the container and declare structural ports — `server/.dependency-cruiser.cjs:66-73`, `server/INSIGHTS.md:97-102`.
- **Architecture:** `_shared/` helpers take structural inputs and import no `src/db` — `server/INSIGHTS.md:47-52`. `_shared/` code stays free of I/O and Fastify by convention — `server/INSIGHTS.md:189-196`.
- **Architecture:** a service built and used by one module is constructed in that module's `routes.ts`; one shared by several modules goes in `container.ts` — `.claude/skills/onion-architecture/SKILL.md:35`. A new service gets narrow dependencies (`di-narrow-deps`) — `server/.dependency-cruiser.cjs:81-89`.
- **Architecture:** the request logger is passed to the service as a parameter, because a service cannot import Fastify — `server/src/modules/blast/service.ts:14-20`.
- **Architecture:** JSON columns are parsed on read in the repository, an unreadable row is reported through an `onUnreadable` callback, and the route answers `null` — `server/INSIGHTS.md:188`, `server/src/modules/intent/service.ts:282-287`.
- **Architecture:** a missing provider key surfaces as `ConfigError` (500) from `container.llm`, and the service maps it to its own 400 `AppError` — `server/INSIGHTS.md:54`, `server/src/modules/intent/service.ts:269-275`.
- **Contracts:** the client imports only types from `@devdigest/shared` (a value import breaks the webpack build); enum lists the UI needs are spelled out locally — `client/INSIGHTS.md:128-139`.
- **Insights:** `withTimeout` does not cancel the provider call; pass an `AbortController` signal and abort on timeout — `server/INSIGHTS.md:144`, `server/src/modules/intent/service.ts:381-404`.
- **Insights:** `OutputTruncatedError` (an answer cut at `maxTokens`) is not retried, so it maps to 502 — `server/src/modules/intent/service.ts:155-156`.
- **Insights:** never pass a function with an optional second parameter bare to `.map` (`capWords(s, max)`); write `.map((x) => capWords(x, MAX))` — `server/INSIGHTS.md:264-268`.
- **Insights:** seed blocks live outside `if (!pr)` and never overwrite a row; `pr_brief` has a primary key, so `onConflictDoNothing()` is safe — `server/INSIGHTS.md:40-45`, `server/src/db/seed.ts:333-369`.
- **Insights:** an `.it` test that builds the app passes `MockSecretsProvider` and `MockGitHubClient`, or it reads the developer's real keys — `server/INSIGHTS.md:141`.
- **Insights:** prove "no external call" with a `Proxy` around the mocks — `server/INSIGHTS.md:72-75`. A `PUT /settings` persists across an `.it` file, so it is undone in `finally` — `server/INSIGHTS.md:57`.
- **Insights:** `pnpm typecheck` never checks `server/test/**`, so test type errors show only in vitest — `server/INSIGHTS.md:77`. The client's `typecheck` does cover tests (`noUncheckedIndexedAccess`), and a vitest path filter with brackets matches nothing — `client/INSIGHTS.md:86-90`.
- **Insights:** `pr_files` has no order column; read it ordered by `path` — `server/INSIGHTS.md:60-66`.
- **Insights:** only `<main>` scrolls; scroll an element into view, never `window` — `client/INSIGHTS.md:11-19`.
- **Insights:** a component that picks one of several bodies from a query takes the choice from one pure mode function, because TanStack keeps `data` together with `isError` — `client/INSIGHTS.md:40-46`.
- **Insights:** a component test that starts reading the URL or the query client needs a `next/navigation` mock and a `QueryClientProvider`; a hooks-module mock spreads `vi.importActual` to keep key factories — `client/INSIGHTS.md:49-55`.
- **Insights:** a mutation mock returns one stable object — `client/INSIGHTS.md:141-160`.
- **Insights:** a state-dependent style is a function in `styles.ts` that returns one complete object; never spread a `borderColor` over a `border` (the target file card) — `client/INSIGHTS.md:168-172`.
- **Insights:** in `messages/en/*.json`, a straight apostrophe before `{` starts an ICU literal — `client/INSIGHTS.md:97`.
- **Insights:** agent-browser `find --name` is a case-insensitive substring match that takes the first hit; `find` does not wait, so `wait --text` before a click; CSS-uppercased labels are asserted with `wait --fn` on lowercased `innerText` — `e2e/INSIGHTS.md:23-38`, `:61-75`.
- **Insights:** a hermetic e2e run shares `client/.next` with a running dev server, so stop the dev stack first or run from a separate worktree — `e2e/INSIGHTS.md:87-106`. Never start a second test command while one runs, and run the integration lane serially — `server/INSIGHTS.md:277-289`, `:230-251`; root `INSIGHTS.md:393-408`.
- **Insights:** a phase that builds a screen carries a manual screenshot check against the decoded design values — root `INSIGHTS.md:452-456`.
- **Insights:** a "do not touch README.md" constraint exempts `e2e/specs/README.md`, where test-writer adds the flow's row — root `INSIGHTS.md:446-450`.
- **Insights:** the local `next-best-practices` skill describes Next 16 while the client runs Next 15; prefer nextjs.org docs when they disagree — root `INSIGHTS.md:184-193` (**Skill:** `next-best-practices`).
- **Do not touch:**
  - `server/src/db/migrations/**`: no schema change, `pr_brief` exists — `server/src/db/schema/reviews.ts:83-88`.
  - Every lock file; no new dependency.
  - `client/src/vendor/**`, except the two synced contract copies in phase 1.
  - `server/package.json` (skip-worktree).
  - `.github/workflows/**`.
  - Every `CLAUDE.md`, `README.md` and `docs/**` (doc-writer, after verification), except `e2e/specs/README.md` and `e2e/specs/seed-fixtures.md` in phase 9.

## Phases

### 1 · Contracts — server shared + client copy

This phase adds the brief contracts once in `@devdigest/shared` and copies the two files byte for byte into the client, so every later phase types against them. It comes first because it is the API boundary.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts` | Add `ReviewFocusItem` and change `PrBrief` exactly as in the server spec section "Contracts → `contracts/brief.ts`" (`summary`, `intent: Intent.nullable()`, `blast: BlastRadius.nullable()`, `risks`, `review_focus`, `history`). Each schema keeps its inferred type under the same name. `Risk` is unchanged. | onion-architecture, zod, security | dep-domain-framework-free |
| `server/src/vendor/shared/contracts/review-api.ts` | Add `BriefInputKind`, `BriefInputStatus`, `BriefInputReason`, `BriefInput`, `PrBriefRecord`, `PrBriefResponse` exactly as in the server spec section "Contracts → `contracts/review-api.ts`", importing `PrBrief` from `./brief.js`. Each has a same-named type. | onion-architecture, zod, security | dep-domain-framework-free |
| `client/src/vendor/shared/contracts/brief.ts` | A copy: a byte-identical sync of the server file. No other edit. | — (excluded from routing) | — |
| `client/src/vendor/shared/contracts/review-api.ts` | A copy: a byte-identical sync of the server file. No other edit. | — (excluded from routing) | — |

**Tests (test-writer):**
- Add `server/test/contracts-sync.test.ts`: reads `../client/src/vendor/shared/contracts/brief.ts` and `review-api.ts` and asserts each is byte-identical to its `server/src/vendor/shared` counterpart.
- Extend `server/test/contracts.test.ts`:
  - `PrBrief` parses with `intent: null` and `blast: null`;
  - `ReviewFocusItem` rejects `line: 0` and an empty `file`;
  - `PrBriefRecord` parses a full record, and `PrBriefRecord.omit({ stale: true })` parses the stored form;
  - `BriefInputReason` holds all 17 values of the spec.
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · then, not in parallel, `cd client && pnpm typecheck`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` · then `cd client && pnpm typecheck`
**Done when:**
- AC-63 / R-SRV-22 — `PrBrief` holds `summary` and `review_focus` items `{ file, line, reason }`; the six brief contracts exist in `review-api.ts`; `contracts-sync.test.ts` passes, proving both client copies byte-identical.

### 2 · Server groundwork — shared text rules, `container.blast`, workspace document read

The approved structural changes (Q9, Q10) and the R-SRV-24 read land here, before any brief code depends on them. Intent and blast behaviour does not change; their existing tests prove it.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/_shared/text/plain-text.ts` (new) | Moves `sanitizeText`, `SanitizeResult`, `capWords` and their regex constants (`INVISIBLE_RE`, `HTML_COMMENT_RE`, `UNTERMINATED_COMMENT_RE`) out of `intent/domain.ts`, bodies unchanged, together with the "Scanning cost" note item 1 that explains `HTML_COMMENT_RE`. Pure: imports nothing outside the standard library. | onion-architecture, fastify-best-practices, security | dep-inward-only, dep-domain-framework-free |
| `server/src/modules/intent/domain.ts` | Removes those definitions, imports them from `../_shared/text/plain-text.js`, and re-exports `sanitizeText`, `capWords` and `type SanitizeResult` so that `intent/service.ts`, `intent/prompt.ts` and `test/intent-domain.test.ts` keep their imports. | onion-architecture, security | dep-domain-framework-free |
| `server/src/platform/container.ts` | Adds a lazy `get blast(): BlastService` (private `_blast`) that mirrors `intent`. It builds `new BlastService({ store: new BlastRepository(this.db), source: this.repoIntel, repoIntelEnabled: this.config.repoIntelEnabled, callerLimit: MAX_CALLERS_PER_SYMBOL })`, with a doc comment saying that `brief` reaches it. | onion-architecture, fastify-best-practices, security | di-composition-root-only |
| `server/src/modules/blast/routes.ts` | Uses `container.blast` instead of constructing the service. The route, its schema and its answer are unchanged. Imports of `BlastRepository`, `BlastService` and `BlastSource` that are no longer needed go away. | onion-architecture, fastify-best-practices, security | edge-thin-routes, sec-missing-authz |
| `server/src/modules/project-context/ports.ts` | Adds `ProjectContextStore.workspaceAttachments(workspaceId): Promise<WorkspaceAgentAttachments[]>`, where `WorkspaceAgentAttachments = { agentName: string; agentPaths: string[]; skills: { name: string; paths: string[] }[] }`. It covers the enabled agents of the workspace; each agent's paths and its enabled linked skills in `agent_skills.order` are in stored order. | onion-architecture | dep-domain-framework-free |
| `server/src/modules/project-context/repository.ts` | Implements `workspaceAttachments`: `agents` filtered by `workspace_id` and `enabled = true`, each with `agentPaths` and the same skill query as `runAttachments` (enabled skills only). | onion-architecture, drizzle-orm-patterns, security | db-only-in-repository, sec-missing-authz |
| `server/src/modules/project-context/domain.ts` | Adds pure `mergeWorkspace(agents: readonly WorkspaceAgentAttachments[]): string[]`. It sorts agents by `agentName` in code-unit order, applies `mergeEffective` per agent (agent paths, then skill paths), and keeps each path once at its first position across all agents. | onion-architecture | dep-domain-framework-free |
| `server/src/modules/project-context/service.ts` | Adds `forWorkspace(input: { workspaceId: string; repo: { owner: string; name: string; clonePath: string \| null } }): Promise<ProjectContextForWorkspace>`, returning `{ attached: number; notCloned: boolean; documents: { path: string; text: string }[]; skipped: { path: string; reason: ContextSkipReason }[] }`. It reads each merged path once with `files.read` and `MAX_CONTEXT_DOC_BYTES`, using the same `not_cloned`, `miss` and `empty` handling as `forRun` and the same reasons. It applies **no** run cap (Q14) and calls no LLM. | onion-architecture, security | dep-inward-only, sec-path-traversal |

**Tests (test-writer):**
- Extend `server/test/project-context-service.test.ts`, `forWorkspace` with a fake store and `MockCloneFiles`:
  - two enabled agents attached out of name order come back in name order;
  - a path attached to both agents appears once, at its first position;
  - a skill path follows its agent's own paths;
  - `notCloned: true` with every path skipped `not_cloned` when `clonePath` is null;
  - a missing file is skipped `not_found`;
  - no `over_cap` skip even when the documents exceed 16,000 tokens.
- Extend `server/test/project-context-domain.test.ts`: `mergeWorkspace` ordering and de-duplication.
- Extend `server/test/project-context.it.test.ts`: `workspaceAttachments` on real Postgres returns enabled agents only, leaves out a disabled skill's paths, and is scoped to the workspace.
- Expected to change: none. `test/intent-domain.test.ts`, `test/intent-*.test.ts`, `test/blast-service.test.ts` and `test/blast.it.test.ts` must pass unedited; that is the proof for Q9 and Q10.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- R-SRV-24 (AC-66) — `container.projectContext.forWorkspace` returns the union of the documents attached to every enabled agent and its enabled linked skills, agents in name order, each path once, read with the per-document rules and no run cap.
- Groundwork for R-SRV-29/R-SRV-30 and NFR-5 — `container.blast` exists, and `pnpm arch:check` reports no new violation and no new baseline entry.

### 3 · Brief rules and prompt — pure (`server`)

This phase holds every decision the brief makes from data alone: hunk ranges, linked issue, findings selection, the trim sequence, input statuses, validation and caps, plus the two messages. They are testable without Postgres, and phase 4 only wires I/O around them.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/brief/constants.ts` (new) | The named constants of the server spec "Configuration and limits": `INPUT_BUDGET_TOKENS = 8000`, `OUTPUT_MAX_TOKENS = 2000`, `CALL_TIMEOUT_MS = 60_000`, `MAX_REPAIR_RETRIES = 1`, `MAX_REVIEW_FINDINGS = 20`, `ISSUE_BODY_CUT_TOKENS = 1000`, `DESCRIPTION_CUT_TOKENS = 1500`, `MAX_RISKS = 6`, `MAX_REVIEW_FOCUS = 6`, `SUMMARY_MAX_CHARS = 600`, `BRIEF_SCHEMA_NAME = 'PrBriefDraft'`. | onion-architecture | dep-domain-framework-free |
| `server/src/modules/brief/domain.ts` (new) | Pure; imports `zod`, `@devdigest/shared`, `../_shared/text/plain-text.js`, `../_shared/file-role/classify.js`, `./constants.js`. The exports, in order, follow below. | onion-architecture, security | dep-inward-only, dep-domain-framework-free, sec-injection |
| `server/src/modules/brief/prompt.ts` (new) | `buildBriefMessages(facts: BriefFacts, notes: { missing: BriefInput[]; trimmed: BriefInput[] }): ChatMessage[]` returns exactly two messages. The trusted system message and the user message are described below. | onion-architecture, security | dep-inward-only, sec-injection |

`server/src/modules/brief/domain.ts` exports:
1. `BriefModelOutput` (zod, the module-local schema of the server spec: kind enum `security | db_migration | breaking_api | perf | deps | config | other`, `summary` min 1, `line` int ≥ 1) and its type.
2. `parseNewSideRanges(patch: string | null): { start: number; end: number }[] | null` — `null` for no patch. Only the `+c[,d]` numbers of `@@` lines are read; a missing `d` is 1; `d = 0` hunks are left out (Q7); `end = c + d − 1`.
3. `formatRanges(ranges): string` — each as `+<start>..<end>`.
4. `findLinkedIssueNumber(sanitizedBody: string): number | null` — Q1.
5. `selectReviewFindings(rows: { file: string; line: number; severity: Severity; title: string; dismissed: boolean }[]): string[]` — non-dismissed only, stable order CRITICAL → WARNING → SUGGESTION, at most `MAX_REVIEW_FINDINGS`, each `file:line severity title`.
6. `BriefFacts` — title; intent or null; changed files `{ path, role, additions, deletions, ranges }[]`; diff totals; blast summary, totals and callers as `file:line symbol`; findings lines; description; issue `{ number, title, body }` or null; documents `{ path, text }[]` — plus `BriefOrigin`, the per-input facts that decide statuses: intent stale, blast degraded reason, issue miss reason, document `attached`, `notCloned` and all-skipped.
7. `cutToTokens(text: string, max: number, count: (t: string) => number): string` — binary search for the longest prefix with `count ≤ max`, `trimEnd`.
8. `fitToBudget(facts, measure: (f: BriefFacts) => number, budget: number, count): { facts: BriefFacts; tokens: number; trims: BriefTrims }` — applies the R-SRV-17 cuts in order, re-measuring after each: documents whole from the last; findings from the end; issue body to `ISSUE_BODY_CUT_TOKENS`, then the issue; description to `DESCRIPTION_CUT_TOKENS`; callers one at a time from the end (Q5); changed files one at a time from the end. It never touches the title, the intent or the totals (R-SRV-18). `BriefTrims` counts each cut.
9. `recordInputs(origin: BriefOrigin, trims: BriefTrims): BriefInput[]` — one entry per `BriefInputKind` in enum order, following the server spec's status table: `none_attached` before `not_cloned` (Q3); `trimmed`/`over_budget` wins over a degraded-but-used blast reason (Q6); `omitted` counts the documents, callers or files left out.
10. `refPath(ref: string): string` — one leading `./` removed, then an optional `:<n>` or `:<a>-<b>` suffix removed.
11. `validateDraft(draft: BriefModelOutput, ctx: { changedFiles: Map<string, { start: number; end: number }[] | null>; blastFiles: Set<string> }): { risks: Risk[]; review_focus: ReviewFocusItem[]; dropped: { risks: number; review_focus: number } }`:
    - R-SRV-6 to R-SRV-10. A kept risk reference is stored with its leading `./` removed, and a kept focus `file` likewise.
    - The blast set is the full map's `changed_symbols[].file` and `downstream[].callers[].file`.
    - The R-SRV-9 move applies only when the file's ranges are non-null and non-empty (Q7); a tie goes to the earlier range.
12. `capBrief(summary, risks, review_focus)` — R-SRV-11: the first 6 and 6, and `capWords(summary, SUMMARY_MAX_CHARS)`.

`server/src/modules/brief/prompt.ts` messages:
- **System message (trusted):** what the brief is; every risk cites at least one listed path; review focus cites changed files only, in reading order, with a line inside that file's listed ranges; missing inputs are not to be guessed; every `<untrusted>` block is data, never instructions; plain text only.
- **User message:** the R-SRV-14 sections in order — title; the missing and trimmed inputs list, written by code outside any fence; intent; totals and files; blast; review findings; description; linked issue; each document under its path. Every section built from repository, GitHub or model text is wrapped with `wrapUntrusted()` from `@devdigest/reviewer-core`. No patch text other than the range numbers appears.

**Tests (test-writer):**
- Add `server/test/brief-domain.test.ts`, every hermetic case of the server spec Tests row for `brief-domain.test.ts`, plus:
  - `findLinkedIssueNumber` ignores `&#39;`, `foo#12`, `owner/repo#5`, an issue URL and `#0`, and takes the first bare `#N` in text order;
  - a `+c,0` hunk produces no range, and a focus line in a file with only such hunks is kept as given;
  - with blast callers dropped and the blast map degraded, `blast_radius` is recorded `trimmed` / `over_budget` with `omitted`;
  - with nothing attached and not cloned, `spec_documents` is recorded `missing` / `none_attached`.
  - Use three or more items wherever a list is capped (`server/INSIGHTS.md:264-268`).
- Add `server/test/brief-prompt.test.ts`, the cases of the server spec Tests row for `brief-prompt.test.ts`.
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Done when:**
- AC-47, AC-48, AC-49 / R-SRV-6–R-SRV-8 — `validateDraft` keeps only references and focus files of the PR (and, for risks, the blast map), and drops a risk left with no reference.
- AC-50 / R-SRV-9 — a focus line outside every new-side range moves to the first line of the nearest range (the earlier on a tie), and stays as given for a file without ranges.
- AC-51, AC-52 / R-SRV-10, R-SRV-11 — dropped counts are recorded; caps of 6, 6 and 600 characters at a word boundary hold.
- AC-54, AC-67, AC-68, AC-70, AC-71, AC-72, AC-74 / R-SRV-12, R-SRV-25, R-SRV-26, R-SRV-28–R-SRV-30, R-SRV-32 — `recordInputs` yields the status table's value for every case.
- AC-55, AC-56 / R-SRV-14, R-SRV-15 — `buildBriefMessages` holds the sections in order, fenced, with patch content reduced to `+start..end` numbers.
- AC-57, AC-58, AC-59 / R-SRV-16–R-SRV-18 — `fitToBudget` applies the cuts in the stated order until the measure is at most 8,000, and never cuts the title, the intent or the totals.
- AC-73 / R-SRV-31 (selection rule) — `findLinkedIssueNumber` returns the first bare `#N` of the sanitised description.

### 4 · Brief module — repository, service, routes (`server`)

This phase sequences the I/O around phase 3: it reads the facts, makes one call, validates, stores, and serves `GET` and `POST /pulls/:id/brief`. The testability seams (call timeout, log sink) are built in, so the timeout and the log lines are tested without a 60 s wait or a logger hook in `app.ts`.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/modules/brief/ports.ts` (new) | The store, source, model-choice and log ports below. Imports types only. | onion-architecture | dep-domain-framework-free |
| `server/src/modules/brief/repository.ts` (new) | `BriefRepository implements BriefStore`, over `pull_requests`, `repos`, `pr_files` (ordered by `path`), `reviews` and `findings` (Q2: newest row of `kind = 'review'` for the PR by `created_at`), `resolveFeatureModel(db, workspaceId, 'risk_brief')`, and `pr_brief`. `readBrief` parses `json` with `PrBriefRecord.omit({ stale: true })` and calls `onUnreadable` on failure. `saveBrief` upserts on `pr_id`. | onion-architecture, drizzle-orm-patterns, security | db-only-in-repository, zod-parse-at-boundary, sec-missing-authz |
| `server/src/modules/brief/service.ts` (new) | `BriefService` with `get` and `generate` and an in-flight map; described below. | onion-architecture, security | dep-inward-only, zod-parse-at-boundary, sec-secret-exposure, sec-injection |
| `server/src/modules/brief/routes.ts` (new) | Builds `BriefService` from `container` (`store: new BriefRepository(container.db)`, `intent: container.intent`, `blast: container.blast`, `documents: container.projectContext`, `github: () => container.github()`, `llm: (p) => container.llm(p)`, `tokenizer: container.tokenizer`), routes below. | onion-architecture, fastify-best-practices, security | edge-thin-routes, di-composition-root-only, sec-missing-authz |
| `server/src/modules/index.ts` | Imports `./brief/routes.js` and adds `brief` to `modules`. | onion-architecture, security | dep-inward-only |

The ports in `server/src/modules/brief/ports.ts`, to match exactly:

```ts
export interface BriefPull { id: string; repoId: string; title: string; body: string | null; headSha: string;
  additions: number; deletions: number; filesCount: number; repo: { owner: string; name: string; clonePath: string | null } }
export interface BriefStore {
  findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  changedFiles(prId: string): Promise<{ path: string; additions: number; deletions: number; patch: string | null }[]>;
  latestReviewFindings(prId: string): Promise<{ file: string; line: number; severity: Severity; title: string; dismissed: boolean }[]>;
  featureModel(workspaceId: string): Promise<FeatureModelChoice>;
  readBrief(prId: string, opts: { onUnreadable: () => void }): Promise<Omit<PrBriefRecord, 'stale'> | undefined>;
  saveBrief(prId: string, record: Omit<PrBriefRecord, 'stale'>): Promise<void>;
}
export interface BriefLog { info(fields: Record<string, unknown>, message: string): void }
```

It also declares structural ports for `intent` (`get(workspaceId, prId)` only — R-SRV-27), `blast` (`forPull(workspaceId, prId, log)`) and `documents` (`forWorkspace(input)`).

`server/src/modules/brief/service.ts`:
- **Constructor deps (narrow):** `store`, `intent`, `blast`, `documents`, `github: () => Promise<GitHubClient>`, `llm: (p: Provider) => Promise<LLMProvider>`, `tokenizer: { count(text: string): number }`, `callTimeoutMs?` (default `CALL_TIMEOUT_MS`), `now?: () => Date`.
- **`get(workspaceId, prId, log): Promise<PrBriefResponse>`** — 404 when the PR is not in the workspace. It reads the row; an unreadable row logs one `info` line with `prId` and answers `null`. It sets `stale = record.head_sha !== pull.headSha`. It makes no model and no GitHub call.
- **`generate(workspaceId, prId, log): Promise<PrBriefResponse>`** follows the server spec's "Generation, in order":
  1. 404, then 422 `ValidationError('The PR\'s changed files are not loaded yet')`.
  2. Resolve the provider. A `ConfigError` maps to `AppError('brief_unavailable', 'No API key is configured for the risk brief model\'s provider (<provider>). Add it in Settings.', 400)` before any GitHub call.
  3. Join a running generation of the same `prId` through a `Map<string, Promise<PrBriefResponse>>`, deleted in `finally` (R-SRV-37).
  4. Gather the inputs:
     - intent through `intent.get`;
     - blast through `blast.forPull` (a throw becomes `missing` / `no_data`);
     - files with `classifyFile` roles and `parseNewSideRanges`;
     - `sanitizeText` on title, description and issue;
     - the linked issue through one `getIssue` call, mapping `ConfigError` to `no_token`, `null` to `not_found` and a throw to `fetch_failed`;
     - findings through `selectReviewFindings`;
     - documents through `documents.forWorkspace`.
  5. `fitToBudget` with `measure = (f) => tokenizer.count(messages.map((m) => m.content).join('\n'))` over `buildBriefMessages`.
  6. Log `Brief model call →` with `prId`, `provider`, `model`, `inputTokens`, `budgetTokens`, `inputs` (kind → status) and `reviewFindings`.
  7. Make one `completeStructured` call with `schema: BriefModelOutput`, `schemaName: BRIEF_SCHEMA_NAME`, `temperature: 0`, `maxTokens: OUTPUT_MAX_TOKENS`, `maxRetries: MAX_REPAIR_RETRIES`, `timeoutMs: callTimeoutMs`, `reasoning: false`, and `signal`, inside `withTimeout(…, callTimeoutMs)`. Abort on failure. Every failure — a throw, a timeout, `OutputTruncatedError`, a schema mismatch — becomes `ExternalServiceError('Brief generation failed (<reason>)')` and nothing is written.
  8. Log `Brief model call done ←` with `tokensIn`, `tokensOut`, `costUsd`, `attempts`, `ms` and the dropped counts. Neither line carries PR text, document text or model output.
  9. `validateDraft`, then `capBrief`; build the record with `head_sha` read in step 1, `generated_at` from `now()`, `provider`, `model`, tokens, cost, `input_tokens`, `input_budget_tokens: INPUT_BUDGET_TOKENS`, `inputs`, `dropped`, `intent` (summary and scope lists, or null), `blast` (the map as sent after any caller trim, or null) and `history: { history: [] }`.
  10. `saveBrief`, then answer with `stale: false`.

`server/src/modules/brief/routes.ts` routes:
- `GET /pulls/:id/brief` with `{ schema: { params: IdParams } }`.
- `POST /pulls/:id/brief` with `{ schema: { params: IdParams }, config: BRIEF_RATE_LIMIT }`, where the exported constant is `BRIEF_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } }`.
- Both call `getContext`, then one service method, passing `req.log`.

**Tests (test-writer):**
- Add `server/test/brief-service.test.ts` (hermetic: fake ports, `MockLLMProvider`, a test-local `LLMProvider` where a call must be held, thrown or delayed, `MockGitHubClient`):
  - both log lines carry the R-SRV-20 fields and no title, description, document or model text (R-SRV-20);
  - `callTimeoutMs: 20` with a never-resolving provider answers `ExternalServiceError` and calls no `saveBrief`; the same for a thrown `OutputTruncatedError` (R-SRV-34);
  - two concurrent `generate` calls make one model call and both receive the same result, and the same error when it fails (R-SRV-37);
  - a `ConfigError` from `llm` gives `brief_unavailable` 400 naming the provider, with `github` never called (R-SRV-33);
  - the intent port fake has only `get` (R-SRV-27);
  - a stale intent, a degraded blast map with symbols, and an empty map are recorded as in the status table (R-SRV-28–R-SRV-30);
  - `reasoning: false` and the R-SRV-19 parameters are on the single request (R-SRV-19).
- Add `server/test/brief.it.test.ts` (Postgres, `MockSecretsProvider`, `MockGitHubClient`, `MockLLMProvider` with `structuredBySchema: { PrBriefDraft: … }`), every case of the server spec Tests row for `brief.it.test.ts`:
  - `GET` after `POST` leaves a `Proxy`-wrapped LLM and GitHub mock uncalled (`server/INSIGHTS.md:72-75`);
  - the `risk_brief` override set by `PUT /settings` and undone in `finally`;
  - an unparseable row created by the test reads as `null`;
  - a merged PR inserted by the test.
- R-SRV-38: `BRIEF_RATE_LIMIT` equals `{ rateLimit: { max: 10, timeWindow: '1 minute' } }` (assert the exported constant, which the route uses).
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- AC-43, AC-44 / R-SRV-1, R-SRV-2, R-SRV-42 — `POST` answers 200 with summary, risks and review focus, and the `pr_brief` row holds the record with the PR's head SHA and the call metadata.
- AC-45, AC-46, AC-65, AC-81 / R-SRV-3–R-SRV-5, R-SRV-39 — `GET` answers the stored brief with `stale` computed, `brief: null` with no row or an unparseable row, and makes no model and no GitHub call.
- AC-53, AC-69 / R-SRV-13, R-SRV-27 — a brief is generated with no intent or an empty map, and the intent store is unchanged.
- AC-60, AC-62 / R-SRV-19, R-SRV-21 — exactly one `completeStructured` call per generation, with the `risk_brief` choice.
- AC-61 / R-SRV-20 — the two log lines carry counts and ids only.
- AC-64, AC-75, AC-76, AC-77, AC-78 / R-SRV-23, R-SRV-33–R-SRV-36 — 502 with the row unchanged; 400 `brief_unavailable` before GitHub; 422; 404.
- AC-66, AC-73 / R-SRV-24, R-SRV-31 — documents come from `forWorkspace`; the linked issue is read with one `getIssue` on the PR's repository.
- AC-79, AC-80, AC-82 / R-SRV-37, R-SRV-38, R-SRV-40 — one generation per PR in flight; `POST` limited to 10 per minute; any PR status works.

### 5 · Seeded brief (`server`)

The seeded PR #482 gets a brief, so the UI phases and the e2e flows have deterministic data without a model key.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `server/src/db/seed.ts` | Adds its own block after the intent block, outside `if (!pr)`: `insert(t.prBrief).values({ prId: pr.id, json }).onConflictDoNothing()`. `json` is typed `satisfies Omit<PrBriefRecord, 'stale'>` (type import from `@devdigest/shared`) and holds exactly the values of the server spec "Seeded brief": `pr_id` the seeded PR id, `generated_at` `2026-10-18T00:00:00.000Z`, the seeded intent's summary and scope lists, `blast: null` (Q15), four risks each with a one-sentence explanation, three focus items, `history: { history: [] }`, `head_sha` `a1b2c3d4e5f6`, `provider`/`model` `seed`, null tokens and cost, `input_budget_tokens` 8000, the six `inputs`, and `dropped` zero. A header comment names the fixture contract (`e2e/specs/seed-fixtures.md`). | onion-architecture, drizzle-orm-patterns, security | sec-hardcoded-secret |

**Tests (test-writer):**
- Add `server/test/brief-seed.it.test.ts`:
  - after `seed(db)` twice there is exactly one `pr_brief` row for PR #482, its `json` parses with `PrBriefRecord.omit({ stale: true })`, and its `head_sha` is `a1b2c3d4e5f6`;
  - a row changed by the test is unchanged after another `seed(db)`;
  - `GET /pulls/:id/brief` answers it with `stale: false` and the mock LLM's `calls` stay empty.
- Expected to change: none.

**Verify (code):** `cd server && pnpm typecheck` · `cd server && pnpm arch:check` · `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
**Verify (phase):** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test --no-file-parallelism`
**Done when:**
- R-SRV-41 (AC-83, AC-84 data) — `pnpm db:seed` inserts the seeded brief of PR #482 once, never overwrites a row, and `GET` serves it without a model call.

### 6 · PR Brief section — data, states, grid (`client`)

This phase builds the section shell: the hook, the strings, the loading, empty, error, summary, inputs, stale and footer states, Generate and Regenerate, and the Intent | Blast grid that moves the existing cards into the brief. It comes before Risk areas and Review focus so the data path and the layout move are reviewed on their own.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `client/src/lib/hooks/brief.ts` (new) | `briefKeys.detail(prId, headSha) = ["pr-brief", prId, headSha]`. `usePrBrief(prId, headSha)` (GET, `enabled: !!prId`). `useGenerateBrief(prId, headSha)` (POST, `onSuccess` → `setQueryData` on that key; no other invalidation). Types come from `@devdigest/shared` (type-only). | frontend-ui-architecture, security | logic-no-server-state-copy, struct-one-way |
| `client/messages/en/brief.json` | Changes `block.risks` → "Risk areas" and `unavailableHint` → "Generate a Why+Risk brief for this PR.". Adds every key of the client spec "Strings" plus `inputs.item`, `inputs.omitted` and the copy in Assumptions. Enum-mirroring keys use the exact enum values. | — | — |
| `client/src/lib/use-media-query.ts` (new) | `useMediaQuery(query: string): boolean` over `window.matchMedia` with `useSyncExternalStore` (server snapshot `false`). | frontend-ui-architecture, react-best-practices, security | react-hooks-conditional, logic-no-effect-derivation |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefSection/PrBriefSection.tsx` (new) | `PrBriefSection({ prId, headSha, repoId, repoFullName, poll })`, described below. Model text is rendered as text nodes only. | frontend-ui-architecture, react-best-practices, next-best-practices, security | split-no-nested-definitions, split-pure, logic-no-server-state-copy, react-nested-component, react-render-side-effect, sec-xss |
| `…/_components/PrBriefSection/index.ts` (new) | Re-exports `PrBriefSection`. | frontend-ui-architecture, next-best-practices | struct-one-way |
| `…/_components/PrBriefSection/styles.ts` (new) | `s` with the client spec Layout values: section body (column, gap 16); summary panel (padding 16, 1 px `var(--border)`, radius 10, `var(--bg-elevated)`, text 13.5 px / 1.55 `var(--text-secondary)`); inputs and stale lines (12.5 px muted, `AlertTriangle` 14 px `var(--warn)`, gap 6, margin-top 8); empty card (max-width 340, icon box 48 × 48 radius 12 `var(--bg-hover)`, title 15/700, hint 13/1.5, margins 14/6/18); `grid(narrow)` returning a complete object (`1fr 1fr` or `1fr`, gap 16); footer (11.5 px muted). | frontend-ui-architecture, next-best-practices | split-pure |
| `…/_components/PrBriefSection/helpers.ts` (new) | Pure: `briefViewMode({ isLoading, isError, data }): "loading" \| "error" \| "empty" \| "brief"` (data wins over a refetch error). `inputsLine(inputs): { missing: BriefInput[]; trimmed: BriefInput[] }`. `shortSha(sha) = sha.slice(0, 7)`. `generateErrorKind(err): "no_api_key" \| "other"` from `ApiError.code === "brief_unavailable"`. | frontend-ui-architecture | logic-pure-domain |
| `…/_components/IntentCard/IntentCard.tsx` | Gains optional props `hideRiskTags?: boolean` (default false), which suppresses the `intent.riskAreas` tag row, and `footer?: React.ReactNode`, rendered after the card body in every state (loading, record, error, empty) under a divider (height 1, `var(--border)`, margin `16px 0`) (Q8). With neither prop it renders as before. | frontend-ui-architecture, react-best-practices, next-best-practices, security | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/_components/IntentCard/styles.ts` | Adds the footer divider style. | frontend-ui-architecture, next-best-practices | split-pure |
| `…/_components/OverviewTab/OverviewTab.tsx` | Renders `PrBriefSection` (when `prId`) and then the Description section. It no longer renders `BlastRadiusCard` itself. Gains the prop `poll: boolean`. | frontend-ui-architecture, react-best-practices, next-best-practices, security | struct-no-cross-feature, react-nested-component |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Renders `IntentCard` above the tab content only on `findings`, and passes `poll={reviewRunning}` to `OverviewTab`. | frontend-ui-architecture, react-best-practices, next-best-practices, security | struct-one-way, react-hooks-conditional |

`PrBriefSection` behaviour:
- **Reads:** `usePrBrief` on mount, and never calls `useGenerateBrief` on mount. `useMediaQuery("(max-width: 899px)")` drives the grid.
- **Header:** `SectionLabel` "PR Brief" (`brief.section`, icon `FileText`). Its right slot holds `IconBtn` `RefreshCw` labelled `brief.regenerate` once a brief exists, or the disabled small `Button` `brief.generating` while generation is pending.
- **Body by `briefViewMode`:**
  - `loading` → the grid only (R6);
  - `error` → the error card with `brief.loadFailed` and a Retry `Button` that refetches, and no Generate button;
  - `empty` → the empty card with `brief.unavailable`, `brief.unavailableHint` and a primary `Button` "Generate brief" (disabled with `brief.generating` while pending), then the grid;
  - `brief` → the summary panel with `summary`, the inputs line (`brief.inputs.without` / `brief.inputs.trimmed`, items `brief.inputs.item` with `inputs.kind.<kind>`, `inputs.reason.<reason>` and `inputs.omitted`) and, when `stale`, `brief.stale` with `shortSha(head_sha)` plus a Regenerate action; then the grid; then the footer (model in mono, `formatCostUsd(cost_usd)`, `brief.footer.generated` with relative time, `brief.footer.tokens`; null values left out; `brief.dropped` on its own line when either count is above 0).
- **Errors from generating:** `brief_unavailable` renders the API message and a `next/link` to `/settings/api-keys` with `brief.noApiKey`. Any other error renders its message. Either way the cached brief stays rendered.
- **Grid:** `IntentCard` with `hideRiskTags` and `footer={null}` (filled in phase 7) on the left; the existing `BlastRadiusCard` on the right; one column with the Intent card first below 900 px.

**Tests (test-writer):**
- Add `client/src/lib/hooks/brief.test.tsx`: GET only on mount; a POST's response lands in `["pr-brief", prId, headSha]`; a new `headSha` refetches; no other key is invalidated.
- Add `client/src/lib/use-media-query.test.ts` with a stubbed `matchMedia`.
- Add `…/PrBriefSection/helpers.test.ts`: `briefViewMode` for each combination, including `{ data, isError: true }`; `inputsLine`.
- Add `…/PrBriefSection/PrBriefSection.test.tsx` (mocked hooks with stable mutation objects; `IntentCard` and `BlastRadiusCard` mocked to record props) covering R-WEB-1–R-WEB-6, R-WEB-11–R-WEB-14, R-WEB-17 (grid template with `matchMedia` stubbed narrow), R-WEB-20, R-WEB-21, R-WEB-22–R-WEB-29 and R-WEB-31, with the fixtures named in the client spec Tests row, a loading state that shows no Generate button, and summary markup rendered as text.
- Extend `…/IntentCard/IntentCard.test.tsx`: `hideRiskTags` removes the tag row only when set (R-WEB-15, R-WEB-16), and `footer` renders in the record, empty, error and loading states.
- Expected to change `…/OverviewTab/OverviewTab.test.tsx`:
  - both cases rendered `BlastRadiusCard` directly; they now mock `../PrBriefSection` and assert that `PrBriefSection` receives `prId`, `headSha`, `repoId`, `repoFullName` and `poll`, that it comes before Description (R-WEB-18), and that it is absent while `prId` is null.

**Verify (code):** `cd client && pnpm typecheck` (clean outside `*.test.tsx`) · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):**
- Before starting: ask the user to run `cd server && pnpm db:seed` on their running stack (idempotent; adds the seeded brief). Never start the stack.
- In one browser tab, open `http://localhost:3000/`, open PR #482 from the PR list, and stay on Overview.
- Compare with `screen_pr_detail.jsx` (`OverviewTab`, `BriefCard`) at `/private/tmp/claude-501/-Users-yrazub-Projects-dev-digest/9d5b9939-b5c8-47e8-81b6-3e7fa792f503/scratchpad/hw05/design/screen_pr_detail.jsx` and `img1.png` in the same `hw05/img/` folder:
  - the client spec `## Layout` rows "Section label", "Section body", "Summary panel", "Grid", "Left column", "Right column", "Footer", and the page container `24px 32px 44px` / `maxWidth 1080`;
  - narrow the window below 900 px once and check that the columns stack with Intent first;
  - use a region zoom on the summary panel.
- Run `read_console_messages` and check for React warnings, including "style property during rerender". Close the tab.

**Done when:**
- AC-1, AC-2, AC-3 / R-WEB-1–R-WEB-3 — the section and its empty state render, and the Intent and Blast cards stay visible.
- AC-4, AC-21, AC-22, AC-29 / R-WEB-4, R-WEB-21, R-WEB-22, R-WEB-29 — GET on mount; POST only from Generate, Regenerate and the stale action; the answer is rendered from the cache.
- AC-5, AC-6, AC-17, AC-18 / R-WEB-5, R-WEB-6, R-WEB-17, R-WEB-18 — the summary sits above a two-column grid that stacks below 900 px, followed by Description.
- AC-11–AC-14 / R-WEB-11–R-WEB-14 — the inputs line, trimmed names, dropped counts and footer render.
- AC-15, AC-16 / R-WEB-15, R-WEB-16 — tags are hidden on Overview and kept on Agent runs.
- AC-23–AC-28, AC-31 / R-WEB-23–R-WEB-28, R-WEB-31 — the generating, keep-previous, load-error, no-key, generic-error and stale states, and the "Regenerate brief" name.
- AC-20 (section, footer) / R-WEB-20 — every label comes from `brief`.

### 7 · Risk areas, Review focus, navigation (`client`)

This phase fills the brief with its two model-written blocks and makes a Review focus click navigate. The Files changed side follows in phase 8.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `…/PrBriefSection/_components/RiskAreas/RiskAreas.tsx` (new) | `RiskAreas({ risks })`: `SectionLabel` `brief.block.risks` (icon `AlertTriangle`); a wrapping row of entries; each entry shows the kind icon (from `RISK_KIND_ICON`, otherwise `AlertTriangle`), coloured by severity, the title, and each `file_refs` entry as muted mono plain text. With no risks it shows `brief.noRisks`. | frontend-ui-architecture, react-best-practices, next-best-practices, security | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/RiskAreas/index.ts` (new) | Re-export. | frontend-ui-architecture, next-best-practices | struct-one-way |
| `…/RiskAreas/styles.ts` (new) | The client spec Layout row "Risk entries" values. | frontend-ui-architecture, next-best-practices | split-pure |
| `…/PrBriefSection/_components/ReviewFocus/ReviewFocus.tsx` (new) | `ReviewFocus({ items, onOpen })`, described below. | frontend-ui-architecture, react-best-practices, next-best-practices, security | split-no-nested-definitions, react-nested-component, sec-xss |
| `…/ReviewFocus/index.ts` (new) | Re-export. | frontend-ui-architecture, next-best-practices | struct-one-way |
| `…/ReviewFocus/styles.ts` (new) | The client spec Layout row "Review focus panel" values, including hover and focus background `var(--bg-hover)` (`row(active)` returns a complete object). | frontend-ui-architecture, next-best-practices | split-pure |
| `…/PrBriefSection/constants.ts` (new) | `RISK_KIND_ICON` (`security` Shield, `db_migration` Database, `breaking_api` AlertOctagon, `perf` Zap, `deps` Boxes) and `SEVERITY_COLOR` (high `var(--crit)`, medium `var(--warn)`, low `var(--info)`). | frontend-ui-architecture | split-pure |
| `…/PrBriefSection/helpers.ts` | Adds `elidePath(file: string): string`: whole when at most 56 characters, otherwise the first 20 characters, "…" and the last 35. | frontend-ui-architecture | logic-pure-domain |
| `…/PrBriefSection/PrBriefSection.tsx` | Passes `<RiskAreas risks={brief.risks.risks} />` as the `IntentCard` `footer` while a brief is shown, and renders `<ReviewFocus items={brief.review_focus} onOpen={onOpenFocus} />` below the grid and above the footer. Gains the prop `onOpenFocus(file: string, line: number)`. | frontend-ui-architecture, react-best-practices, next-best-practices, security | split-pure, react-nested-component |
| `…/OverviewTab/OverviewTab.tsx` | Passes the new `onOpenFocus` prop through. | frontend-ui-architecture, react-best-practices, next-best-practices, security | react-nested-component |
| `client/src/lib/use-pr-detail-nav.ts` (new) | Pure `focusSearch` and `tabSearch` plus the `usePrDetailNav` hook, described below. | frontend-ui-architecture, react-best-practices, security | logic-pure-domain, react-hooks-conditional |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Uses `usePrDetailNav` for `tab`, `setTab` (tab bar and `onRunStart`), `setParam` (trace drawer) and `openFocus`, passed to `OverviewTab` as `onOpenFocus`. | frontend-ui-architecture, react-best-practices, next-best-practices, security | struct-one-way, react-hooks-conditional |

`ReviewFocus` behaviour:
- A panel titled `brief.reviewFocus.title` (icon `ListChecks`) with a count `Badge`.
- A list of `<button type="button">` rows in array order. Each row's `aria-label` is `brief.reviewFocus.open` with file and line; its `title` is the full `<file>:<line>`. It shows "▸", `elidePath(file)` + `:<line>` in mono, and "— <reason>".
- With no items it shows `brief.reviewFocus.empty`.
- A click calls `onOpen(file, line)`.

`client/src/lib/use-pr-detail-nav.ts`:
- Pure `focusSearch(current: URLSearchParams, file: string, line: number): string` sets `tab=diff`, `file` (encoded by `URLSearchParams`) and `line`, keeping every other parameter.
- Pure `tabSearch(current: URLSearchParams, tab: string): string` sets `tab` and deletes `file` and `line`.
- Hook `usePrDetailNav(base: string)` returns `{ tab, setTab, setParam, openFocus }`. `setTab` and `setParam` use `router.replace`; `openFocus` uses `router.push`.

**Tests (test-writer):**
- Extend `…/PrBriefSection/PrBriefSection.test.tsx`: R-WEB-7–R-WEB-10, R-WEB-19 (a 70-character path shows 20 + "…" + 35 and `:line`; a 40-character one is whole; `title` always the full `<file>:<line>`), R-WEB-20 and R-WEB-30, with three or more risks and focus items. Model text renders as text, not markup. A click calls `onOpenFocus(file, line)`.
- Extend `…/PrBriefSection/helpers.test.ts`: `elidePath` at 56, 57 and 70 characters.
- Add `client/src/lib/use-pr-detail-nav.test.ts`:
  - `focusSearch` keeps `order`, `trace` and `blast` and encodes the path (R-WEB-35);
  - `openFocus` calls `router.push` (R-WEB-36);
  - `setTab` calls `router.replace` without `file` and `line` (R-WEB-41).
- Expected to change: none.

**Verify (code):** `cd client && pnpm typecheck` (clean outside `*.test.tsx`) · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):**
- In one browser tab, open PR #482 Overview (`http://localhost:3000/` → PR list → #482).
- Compare with `screen_pr_detail.jsx` (`RiskPillRow`, `ReviewFocusBlock`) and `img1.png` / `img4.png` in the scratchpad `hw05/` folder named in phase 6:
  - client spec `## Layout` rows "Left column" and "Risk entries": kind icon colours by severity, entry padding `5px 9px`, radius 7;
  - "Review focus panel": padding `14px 16px`, row padding `7px 8px`, the accent "▸", mono 11.5 px path;
  - Tab onto a focus row and check the focus background.
- Click `src/config.ts:12` and confirm the URL holds `tab=diff&file=src%2Fconfig.ts&line=12`; Back returns to Overview.
- Run `read_console_messages` for React warnings. Close the tab.

**Done when:**
- AC-7, AC-9 / R-WEB-7, R-WEB-9 — Risk areas with titles and plain-text references, or `brief.noRisks`, render inside the Intent card.
- AC-8, AC-10, AC-19, AC-30 / R-WEB-8, R-WEB-10, R-WEB-19, R-WEB-30 — Review focus rows render in order as named buttons, with the 56-character elision and a full title, or the empty text.
- AC-20 / R-WEB-20 — Risk areas and Review focus labels come from `brief`.
- AC-35, AC-36, AC-41 / R-WEB-35, R-WEB-36, R-WEB-41 — a focus click pushes `?tab=diff&file=&line=`, and a manual tab change removes `file` and `line`.

### 8 · The jump into Files changed (`client`)

This phase makes the Files changed tab act on `file` and `line`: open the group and the card, scroll inside `<main>`, pulse the line, once per navigation, in both orders. It adds a persistent `data-jump-target` hook for the e2e flow.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `…/_components/DiffTab/helpers.ts` | Adds pure `jumpTarget(files: PrFile[], file: string \| null, line: string \| null): { path: string; line: number \| null } \| null`. It returns `null` when `file` matches no `pr.files` path; `line` must be an integer ≥ 1, otherwise null. | frontend-ui-architecture | logic-pure-domain |
| `…/_components/DiffTab/DiffTab.tsx` | Reads `file` and `line` from `useSearchParams` and computes `jumpTarget`. It holds a `useRef` of the `file:line` key already jumped to, so the jump happens once per navigation (R-WEB-40). It passes `target` and `onJumped` to `RoleGroup` and to both `DiffViewer`s (flat and ungrouped). With no target it renders as before (R-WEB-39). | frontend-ui-architecture, react-best-practices, next-best-practices, security | logic-no-effect-derivation, split-pure, react-hooks-conditional |
| `…/DiffTab/_components/RoleGroup/RoleGroup.tsx` | Initial open state is `!meta.startsCollapsed \|\| files.some((f) => f.path === target?.path)`, so a collapsed group holding the target starts open (R-WEB-37). Passes `target` and `onJumped` on. | frontend-ui-architecture, react-best-practices, next-best-practices, security | logic-no-effect-derivation, react-hooks-conditional |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` | Gains optional `target` and `onJumped`, and gives the matching file card `jump={{ line, pending }}`. | frontend-ui-architecture, react-best-practices, security | split-pure |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx` | Behaviour described below. | frontend-ui-architecture, react-best-practices, security | logic-no-effect-derivation, react-render-side-effect, react-hooks-conditional |
| `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | Gains `jumpMark?: { pulse: boolean }` and a ref forwarded for the scroll. Sets `data-jump-target="line"` while it is the target, and the pulse background `var(--accent-bg)` while `pulse` is set. | frontend-ui-architecture, react-best-practices, security | split-pure, react-nested-component |
| `client/src/components/diff-viewer/styles.ts` | `fileCard(isTarget)` returns a complete object (border 1 px `var(--accent)` or `var(--border)`); adds the scroll margins and `linePulse`. | frontend-ui-architecture | split-pure |

`FileCard` behaviour:
- Initial open state is `jump !== undefined || (defaultOpen ?? auto rule)`, so a collapsed card opens when it is the target (R-WEB-37).
- While it is the target: `data-jump-target="file"` on the card, the accent border, `scrollMarginTop: 96` on the header and 130 on the target line.
- In one effect (DOM sync only) while `jump.pending`, it calls `scrollIntoView({ block: "start" })` on the line whose `newNo === jump.line`, or on the header when no line matches or the patch is absent. It starts a 1,700 ms pulse on that line (cleared on unmount), then calls `onJumped()`.

**Tests (test-writer):**
- Extend `…/DiffTab/DiffTab.test.tsx` (stub `Element.prototype.scrollIntoView`; fake timers for the pulse), the cases of the client spec Tests row for `DiffTab.test.tsx`:
  - a target in the collapsed Boilerplate group opens the group and the card;
  - a large collapsed card opens;
  - a line inside the hunk scrolls that row and marks it, and the mark is gone after 1,700 ms while `data-jump-target="line"` stays;
  - a line outside the hunk and a file without a patch scroll the header and mark nothing;
  - a file not in `pr.files` gives no scroll, no mark and no message;
  - both `order=original` and smart order;
  - a re-render with the same URL does not scroll again.
- Extend `…/DiffTab/helpers.test.ts`: `jumpTarget` for an unknown path, `line=abc`, `line=0` and a valid pair.
- Expected to change: none. The existing `DiffTab` and `FileCard` cases have no `file` parameter and must pass unedited.

**Verify (code):** `cd client && pnpm typecheck` (clean outside `*.test.tsx`) · `cd client && pnpm test`
**Verify (phase):** `cd client && pnpm typecheck && pnpm test`
**Verify (manual, screenshots):**
- In one browser tab, open PR #482 Overview and click the `src/config.ts:12` Review focus row.
- Compare with `img2.png` / `img5.png` in the scratchpad `hw05/` folder and the client spec `## Layout` row "Files changed — target":
  - the 1 px accent card border;
  - about 130 px above line 12 inside `<main>`;
  - the pulse fading within 2 s.
- Go Back, then click `src/middleware/ratelimit.ts:12` (no patch) and check that the header scrolls with no line marked.
- Switch to Original order and reload with the parameters; check that the jump repeats once.
- Run `read_console_messages` for React warnings. Close the tab.

**Done when:**
- AC-32, AC-33, AC-34 / R-WEB-32–R-WEB-34 — the target card opens and scrolls into view inside `<main>`; a rendered target line scrolls into view and pulses, and the pulse ends after 1,700 ms.
- AC-37, AC-38, AC-39 / R-WEB-37–R-WEB-39 — collapsed groups and cards open; a missing line scrolls to the header with no mark; an unknown file does nothing.
- AC-40, AC-42 / R-WEB-40, R-WEB-42 — a load with the parameters jumps once, in both orders.

### 9 · Browser flows over the seeded brief (`e2e`)

This phase covers AC-83 and AC-84 end to end on the seeded stack, and fixes the existing flow that AC-15 breaks. It comes last because it needs every earlier phase.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| Nothing — test-writer only | — | — | — |

**Tests (test-writer):**
- Add `e2e/specs/14-pr-brief.flow.json`. From PR #482's Overview (wait for the PR row text before clicking, then `wait --load networkidle`):
  - the section label via `wait --fn` on lowercased `innerText` including `pr brief`;
  - the seeded summary's opening words;
  - the risk title `Hardcoded Stripe secret key`;
  - `src/server.ts:88`;
  - the review focus label via lowercased `innerText`;
  - no `Generate brief` button (`wait --fn` for its absence) — AC-83.
  - Then `find role button click --name "Open src/config.ts:12 in Files changed"`, `wait --url tab=diff`, `wait --url line=12`, `wait --text src/config.ts`, and `wait --fn` for `[data-jump-target="line"]` whose row text includes `STRIPE_SECRET` — AC-84.
  - No step presses Generate or Regenerate (no model call).
- Add the flow's row to `e2e/specs/README.md`.
- Add a section "PR #482 has a seeded brief" to `e2e/specs/seed-fixtures.md`: the exact seeded strings (summary, the four risks with their explanations as seeded, the three focus items, the inputs) and the contract line naming flow `14`. Amend the "PR #482 has a seeded intent" section: the risk-area tag is now asserted on the Agent runs tab.
- Expected to change `e2e/specs/10-pr-intent.flow.json`: the step "Overview: the seeded risk area is listed" moves after the switch to Agent runs (AC-16). On Overview a `wait --fn` asserts `Auth surface touched` is absent (AC-15). Update the flow's `description` to match.
- Flows 05 and 11 stay unchanged (see Assumptions on `--exact`).

**Verify (phase):** the main session first stops the user's dev stack (asking the user) or uses a separate worktree (`e2e/INSIGHTS.md:100-103`). Then `cd e2e && npm run typecheck && npm run e2e:hermetic`, run alone, with no other test command in flight.
**Done when:**
- AC-83 / R-SRV-41, R-WEB-21 — flow 14 shows the seeded brief on the Overview tab of PR #482 with no model call.
- AC-84 / R-WEB-32, R-WEB-34 — flow 14's click on `src/config.ts:12` lands on Files changed with `src/config.ts` open and line 12 as the jump target.
- AC-15 — flow 10 passes with the risk-area tag absent on Overview and present on Agent runs, and every flow of the hermetic run passes.

## Out of scope
- The deferred P3 criteria AC-85–AC-89 and R-WEB-43–R-WEB-47: verdict banner, expandable risk explanation, risk click, "File not in this PR's diff" message, skeleton.
- Documentation: `README.md` API and UI maps, `server/docs/schema.md`, `server/src/modules/brief/README.md`, `client/docs/data-flow.md`. These are written by doc-writer after verification, not in these phases.
- The course delivery items (cross-model note, plan-verifier report in the PR, retro, cost report, demo video) and `INSIGHTS.md` entries; the main session handles them.
- Any change to `.github/workflows/**`, including the optional `client/src/vendor/shared/**` path filter for `server-unit.yml` (Q13).
- `PrBrief.history` (always `{ history: [] }`), an MCP tool, automatic generation, a Regenerate confirmation.
- Syncing other drifted files of `client/src/vendor/shared`; only `brief.ts` and `review-api.ts` are synced.
- Refactoring intent beyond the move of `sanitizeText` and `capWords`, and refactoring blast beyond `container.blast`.

## Risks
- **The `sanitizeText` move changes intent's behaviour.** Bodies move unchanged, `intent/domain.ts` re-exports them, and the unedited `intent-domain.test.ts` (including its hostile-input timings) must stay green in phase 2.
- **The `container.blast` move changes blast wiring.** The same constructor arguments are used and the getter reads `this.repoIntel`, so test overrides still apply. `blast-service.test.ts` and `blast.it.test.ts` pass unedited, and `pnpm arch:check` shows no new cycle.
- **Trimming re-counts the whole prompt after each one-at-a-time cut, which could be slow on 100 files.** One count of 8,000 tokens is cheap and the loop stops at the first fit. If phase 4's tests show it slow, the implementer reports it rather than changing the cut order.
- **A held, delayed or failing provider in tests leaks timers or promises.** The service seam `callTimeoutMs` keeps timeouts at milliseconds, and the in-flight map entry is deleted in `finally`.
- **The Overview layout change breaks e2e or client tests the plan has not listed.** Flow 10 and `OverviewTab.test.tsx` are listed. A substring match of "Files changed" by flows 05/11 is avoided by DOM order. Any other failure is a suspected regression to report.
- **Memory pressure on the 16 GB laptop.** One agent at a time; never two test commands at once; the integration lane only with `--no-file-parallelism`; one browser tab per screenshot check, closed at the end; the hermetic e2e once, in phase 9, with the dev stack stopped.
- **The manual screenshot checks need the seeded brief in the user's dev DB.** Phase 6 asks the user to run the idempotent `cd server && pnpm db:seed`; the main session never starts the stack.
- **The saved plan carries tag-like strings that the harness may escape.** Before saving, check that no `<\` is left (root `INSIGHTS.md:239-245`).

## Open questions
Nothing.

# Architecture refactor — server (onion)

**Status:** draft · umbrella: [`../../specs/architecture-refactor.md`](../../specs/architecture-refactor.md)

Rules are cited by their `onion-architecture` skill ID. Violation counts come from
`.dependency-cruiser-known-violations.json` as of `f108012` (33 in total).

## Audit

| Rule | Baselined | Where |
|---|---|---|
| `db-only-in-repository` | 12 | `pulls/routes`, `polling/routes`, `settings/routes`, `settings/feature-models`, `workspace/routes`, `repos/helpers`, `reviews/{service,run-executor,diff-loader}`, `platform/jobs` |
| `di-narrow-deps` | 9 | `agents/service`, `repos/service`, `settings/feature-models`, `reviews/{service,run-executor,diff-loader}`, `repo-intel/{service,pipeline/full,pipeline/incremental}` |
| `dep-no-cross-module` | 5 | `pulls → reviews/helpers`; `reviews/{repository,run.repo,run-executor} → pulls/status`; `repos/service → repo-intel/constants` |
| `no-circular` | 5 | `agents/helpers ↔ repository`; `repo-intel/pipeline/* ↔ platform/container` |
| `adapter-no-app-layers` | 2 | `adapters/{astgrep,depgraph} → repo-intel/constants` |

The skill also has rules the tool does not check. These showed up by reading the code:

- `edge-thin-routes`: `pulls/routes.ts` (391 lines) holds the GitHub sync, the diff-stat
  backfill and the cost and findings rollups inline.
- `db-return-domain-types`: `reviews` and `pulls` pass `$inferSelect` rows (`FindingRow`,
  `PullRow`) out of the data layer.
- `zod-contract-once`: the `findings_by_severity` object is declared inline four times in
  `@devdigest/shared` (`platform`, `trace`, `observability`, `productionize`), and a fifth time as
  the TypeScript `SeverityCounts` in `pulls/status.ts`.

`reviewer-core` passes `core-stays-pure`, `core-no-node-io` and `core-public-api-only`. It needs
no work.

## S1 — give `pulls` its layers

**Status:** implemented — awaiting the manual smoke test below.

**Goal:** `pulls` follows the module shape in `server/CLAUDE.md` (`routes.ts` · `service.ts` ·
`repository.ts`), plus a `domain.ts` for its pure rules. It stops depending on `reviews`, and
`reviews` stops depending on it. Behaviour stays byte-for-byte identical.

### Target layout

| File | Layer | Contents |
|---|---|---|
| `pulls/domain.ts` *(renamed from `status.ts`)* | domain | `deriveReviewStatus`, `STALE_DAYS`, plus pure functions pulled out of the route: `latestScoreByPr(reviewRows)`, `summarizeCompletedRuns(runRows)` (the latest run per PR plus the sticky-null total cost), `pickNeedingDiffStats(rows, limit)`, and the row mappers `toPrMeta` and `toPersistedDetail` over a structural `PullRecord` |
| `pulls/repository.ts` *(new)* | edge | `PullsRepository(db)`: every Drizzle query now in `routes.ts` — repo and PR lookup scoped by workspace, the GitHub upsert, list by repo, diff-stat update, latest review scores, completed runs, findings for runs, replacing files and commits, and reading back the persisted files and commits |
| `pulls/service.ts` *(new)* | application | `PullsService({ repo, github, log })`: `listForRepo`, `getDetail`, `listComments`, `postComment`. Holds the local-first sequencing (sync → read → backfill → rollup, falling back to persisted data when GitHub is unavailable) |
| `pulls/routes.ts` | edge + module composition root | builds the repository and the service, and each handler makes one service call |
| `reviews/domain.ts` *(new)* | domain | `rollupSeverities` and `SeverityCounts`, moved from `pulls/status.ts`. `reviews` writes `findings_by_severity`, so it owns the rule |
| `modules/_shared/finding-dto.ts` *(new)* | shared edge helper | `findingRowToDto` and `ReviewDtoFinding`, moved from `reviews/helpers.ts`. The input is a local structural `FindingRecord` type, so the file imports nothing from `src/db` |

### Decisions

- **Narrow dependencies, not the container** (`di-narrow-deps`). `github` is passed as
  `() => Promise<GitHubClient>`, so the secret stays lazy (`di-lazy-secrets`). `log` is a local
  `{ warn(obj, msg) }` type, so the service never imports Fastify.
- **No `ports.ts`.** Every rule worth unit-testing moves into `domain.ts` and is tested without
  doubles. The service is sequencing only, and the existing `*.it.test.ts` already cover it
  (`dep-proportionate`).
- **`pulls` uses the contract type for severity counts**,
  `NonNullable<PrMeta['findings_by_severity']>`, instead of importing `reviews/domain`. Naming the
  shape once in `@devdigest/shared` waits for S6.
- **No transactions added.** Today the detail refresh deletes and re-inserts files and commits
  without a transaction. S1 keeps that behaviour. Making it atomic (`db-tx-owned-by-use-case`) is a
  separate, behaviour-changing follow-up.
- **No re-export shims.** Every importer is updated in the same change: `reviews/{helpers,
  service,findings,repository,run-executor}` and `repository/run.repo.ts`.

### Tests

- `test/pulls-status.test.ts` is renamed to `test/pulls-domain.test.ts` and gains cases for
  `summarizeCompletedRuns`: a null cost is sticky, the newest run wins, and a PR with no runs gives
  `null`. It also gains cases for `latestScoreByPr`.
- The `rollupSeverities` cases move to `test/reviews-domain.test.ts`.
- `pulls-cost`, `pulls-findings` and `pulls-comments` (`*.it.test.ts`) must pass **without edits**.
  They are the behaviour contract for this phase.

### Done when

- [x] `pnpm typecheck` · the hermetic suite (109) · the `.it.test` suite (30) are all green
- [x] `pnpm arch:check` is green; `pnpm arch:baseline` goes from 33 to 28 entries (all 5 `pulls`
      and `pulls/status` entries gone), and the baseline file is committed in the same PR
- [x] `grep -r "db/schema" src/modules/pulls` matches only `repository.ts`
- [ ] Manual smoke test: the PR list and PR detail both load with a GitHub token and without one
      (offline fallback)

## Later phases (outline — each gets its own section before it starts)

- **S2 — small modules get repositories.** Move the Drizzle queries in `polling/routes`,
  `settings/{routes,feature-models}`, `workspace/routes` and `repos/helpers` into repositories.
  Move `SUPPORTED_EXT`/`EXCLUDED_DIRS` (used by the adapters) and the job-kind constants (used by
  `repos`) out of `repo-intel/constants.ts`, to a place both sides may import. That removes 8
  violations.
- **S3 — `agents`.** Pass `AgentService` its ports instead of `Container`, and move the part of
  `helpers.ts` that needs the repository so the cycle breaks. That removes 2 violations.
- **S4 — `reviews` (high risk: the live run path).** Narrow deps for `service`, `run-executor` and
  `diff-loader`. Repositories return domain types instead of `$inferSelect` rows. The transaction
  boundary is decided in the service. This phase needs its own plan and a manual end-to-end run
  before it merges.
- **S5 — `repo-intel` (high risk: about 2,000 lines).** The pipeline takes its dependencies as
  arguments instead of importing `container.ts`, which breaks the 3 cycles. Follow the module's
  own README. This phase needs its own plan.
- **S6 — cross-cutting.** Put `platform/jobs.ts` persistence behind a repository. Declare a named
  `FindingsBySeverity` schema once in `@devdigest/shared` and reuse it in the four contracts, then
  sync the lines into `client/src/vendor/shared`.

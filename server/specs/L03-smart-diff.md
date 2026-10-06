# L03 — Smart Diff (server)

A pure classifier maps a changed file's path to one of five roles, and a new read-only route
returns a PR's files grouped by role together with the lines that carry a counted finding.

Read [`specs/L03-smart-diff.md`](../../specs/L03-smart-diff.md) first: it defines the
requirements (A1–C5), the rules that span packages, the resolved questions Q1–Q4 and the
decisions D1–D11.
Layering follows the `onion-architecture` skill, with `pnpm arch:check` green and no new
baseline entry.

## What already exists

| Piece | Where | State |
|---|---|---|
| `SmartDiff*` contracts, `SmartDiffResponse` | `src/vendor/shared/contracts/brief.ts`, `review-api.ts` | present; `SmartDiffRole` has three values |
| `pr_files` (`pr_id`, `path`, `additions`, `deletions`, `patch`) | `src/db/schema/pulls.ts` | written by `GET /pulls/:id` (`PullsRepository.saveDetail`) and by the seed; no position column |
| `reviews`, `findings` (`file`, `start_line`, `dismissed_at`, …) | `src/db/schema/reviews.ts` | written by a review run |
| Rule `dep-no-cross-module` | `.dependency-cruiser.cjs` | a module imports only itself and `modules/_shared/` |

No schema change and no migration.

## Contract

`SmartDiffRole` becomes `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])` in
`src/vendor/shared/contracts/brief.ts`. `test/contracts.test.ts` gets a case that parses a
`SmartDiff` with all five roles.

## Classifier — `src/modules/_shared/file-role/`

| File | Holds |
|---|---|
| `constants.ts` | `ROLE_ORDER` (the five roles in reading order) and `ROLE_RULES` (the ordered rule list) — the only place a pattern or the order is written (B1) |
| `classify.ts` | `classifyFile(path: string): SmartDiffRole` |

`classifyFile` is pure and synchronous: no I/O, no Fastify, no database. It walks `ROLE_RULES`
in order and returns the role of the first rule that matches, else `core`. It lives in
`_shared` so that both the `smart-diff` module and, in L08, the `reviews` module can import it.

Matching semantics, all case-sensitive, on the path with `/` separators:

- a **file-name** pattern (`*.lock`, `index.ts`, `README*`) is tested against the last segment;
- a **directory** pattern (`dist/**`, `__tests__/**`) matches when that directory is a segment
  of the path at any depth, so `client/dist/a.js` and `server/src/x/__tests__/a.ts` match;
- a **root** pattern (`.github/**`, `.claude/**`, `e2e/**`, `docs/**`) matches only from the
  first segment.

Rules, in checking order. They are the task's starting patterns, unchanged (Q3).

| # | Role | Patterns |
|---|---|---|
| 1 | boilerplate | names `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `*.snap`, `*.generated.*`, `*.min.js`; directories `dist`, `build`, `__snapshots__` |
| 2 | tests | names `*.test.ts`, `*.test.tsx`, `*.it.test.ts`, `*.spec.ts`; directories `test`, `tests`, `__tests__`; root `e2e/**` |
| 3 | wiring | names `index.ts`, `index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`; root `.github/**`, `.claude/**` |
| 4 | docs | names `*.md`, `README*`, `CHANGELOG*`, `LICENSE`; root `docs/**` |
| 5 | core | everything else |

Test table (`test/smart-diff-classify.test.ts`, hermetic). At least these rows:

| Path | Role | Fixes |
|---|---|---|
| `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `e2e/package-lock.json` | boilerplate | A2; rule 1 before `e2e/**` |
| `src/__tests__/__snapshots__/x.snap` | boilerplate | disputed case 1: snapshots before tests |
| `.claude/skills/security/SKILL.md` | wiring | disputed case 2: `.claude/**` before docs |
| `e2e/README.md` | tests | disputed case 3: kept as the task's order gives it |
| `server/test/pulls-domain.test.ts`, `client/src/a/B.test.tsx`, `server/test/x.it.test.ts` | tests | |
| `server/src/modules/index.ts`, `client/next.config.mjs`, `server/tsconfig.json`, `.github/workflows/client.yml` | wiring | |
| `README.md`, `specs/L03-smart-diff.md`, `docs/agent-prompts/README.md`, `LICENSE` | docs | |
| `server/src/modules/pulls/service.ts`, `client/src/lib/api.ts` | core | |
| `server/package.json`, `server/src/db/migrations/0013_x.sql`, `client/src/vendor/ui/nav.ts` | core | Q3: accepted consequences of the unchanged patterns |
| `server/CLAUDE.md` | docs | Q3: only `.claude/**` is wiring |

## Module `src/modules/smart-diff/`

Registered in `src/modules/index.ts`.

| File | Holds |
|---|---|
| `routes.ts` | `GET /pulls/:id/smart-diff`, params `IdParams`; builds the service from `container.db` |
| `service.ts` | `SmartDiffService.forPull(workspaceId, prId)`; HTTP-free |
| `repository.ts` | the three reads below; the only file that touches `src/db/` |
| `domain.ts` | `buildSmartDiff(files, findings)` and `countedFindings(reviews)`, both pure |

### Route

`GET /pulls/:id/smart-diff` → `SmartDiffResponse`.

- `404` (`NotFoundError`) when the PR is not in the caller's workspace.
- Reads Postgres only. It does not call GitHub, a model or the review engine, and it writes
  nothing (B3). No tighter rate limit than the global one.
- A PR whose files were never stored answers `200` with five empty groups.

### Repository reads

1. the pull request row, scoped by workspace;
2. `pr_files` of the PR: `path`, `additions`, `deletions` (the patch is not read);
3. the PR's reviews, newest first, with their findings' `file`, `start_line`, `dismissed_at`
   and the review's `agent_id`, `created_at`.

### Building the response (`domain.ts`)

- **Counted findings (Q1).** Take the newest review of each `agent_id` (reviews with a null
  `agent_id` are treated as one agent). From those reviews take the findings whose
  `dismissed_at` is null (D5).
- **Groups.** Always five, in `ROLE_ORDER`; each file is placed by `classifyFile(path)`; files
  inside a group are sorted by path (D3). An empty group has `files: []`.
- **File.** `path`, `additions`, `deletions`, and `finding_lines`: the distinct `start_line`
  values of the counted findings whose `file` equals the path, ascending.
  `pseudocode_summary` is omitted.
- **`split_suggestion`** is `{ too_big: false, total_lines: <sum of additions + deletions over
  all files>, proposed_splits: [] }`.

## Seed (D10)

`src/db/seed.ts`, PR #482 of the demo repository, stays idempotent. It gains five files so that
the PR has nine, one or more per role: a test next to `src/middleware/ratelimit.ts`, a barrel
`src/api/public/index.ts`, `tsconfig.json`, `README.md` and `package-lock.json` (tests, wiring,
wiring, docs and boilerplate under the rules above). The two files
with seeded findings get a patch that contains the finding's line (`src/config.ts` line 12,
`src/api/users.ts` line 45). `e2e/specs/seed-fixtures.md` records the new assumptions.

## Tests

| File | Kind | Covers |
|---|---|---|
| `test/smart-diff-classify.test.ts` | unit | the table above (B1) |
| `test/smart-diff-domain.test.ts` | unit | group order and empty groups; sort by path; `finding_lines` distinct and ascending; newest review per agent; dismissed excluded; a finding for a file outside the PR ignored; `split_suggestion` |
| `test/smart-diff.it.test.ts` | integration | the seeded PR: `200`, body parses with `SmartDiff` (B2), five groups, the lock file in boilerplate; a PR with no review still groups (B3); unknown id → `404` |
| `test/contracts.test.ts` | unit | `SmartDiff` with five roles |

## Acceptance

- [ ] `classifyFile` is importable and callable with no app, container or request.
- [ ] Every pattern and the role order appear only in `file-role/constants.ts`.
- [ ] The route body parses as `SmartDiff` and always has five groups in `ROLE_ORDER`.
- [ ] `finding_lines` follows the counted-findings rule; a dismissed finding is not in it.
- [ ] The handler makes no GitHub or model call (mocks in the integration test record none).
- [ ] `pnpm typecheck`, `pnpm test` and `pnpm arch:check` are green with no new baseline entry.

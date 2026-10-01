# Architecture refactor — onion backend, colocated frontend

**Status:** in progress · S1 and C1 implemented

This plan brings the codebase in line with the two architecture skills:
`onion-architecture` (for `server/` and `reviewer-core/`) and `frontend-ui-architecture` (for `client/`).
It comes from an audit of the code as of `f108012`.

## Verdict

**Doing it all in one pass is too risky.** On the backend, `pnpm arch:check` baselines
**33 known violations across 7 modules**. The biggest ones sit on the two most fragile paths:

- the live review run (`reviews/run-executor.ts`, 437 lines);
- the repo-intel indexer (`repo-intel/service.ts` + `repository.ts` + `pipeline/`, about 2,000
  lines, with import cycles through the DI container).

The frontend is healthier (about 7.2k lines, already colocated in `_components/`). Its problems
are mostly about imports and placement, not the structure itself.

So the refactor is split into small phases, one PR each. Every phase preserves behaviour: no
contract changes, no response changes, the same tests stay green. A phase that fixes a baselined
violation runs `pnpm arch:baseline` in the same PR, so the baseline only shrinks.

## Recommended first step

**Server phase S1: give the `pulls` module its layers** — details in
[`server/specs/architecture-refactor.md`](../server/specs/architecture-refactor.md#s1--give-pulls-its-layers).

`pulls/routes.ts` is the clearest example of the problem. It is a 391-line route file that
queries Drizzle directly, calls GitHub, and holds the cost and findings rollup rules inline. It
is also the knot behind four of the five cross-module violations.

- **Size:** 1 module plus 3 import sites in `reviews`. About 8 files, 2 of them new.
- **Payoff:** 5 of the 33 baselined violations go away, and `pulls` becomes a reference module
  for the later phases.
- **Why it is safe:** `pulls-cost`, `pulls-findings` and `pulls-comments` are black-box
  `app.inject` integration tests. They exercise the routes through HTTP and do not need to change.

The frontend has an independent first step of the same size (client phase C1: split the hooks
barrel). It can go before S1, after it, or in parallel.

## Phases

| # | Package | Phase | Risk | Arch violations removed |
|---|---|---|---|---|
| **S1** | server | `pulls` → routes / service / repository / domain | low | 5 |
| C1 | client | `lib/hooks`: one file per resource, drop the aggregating barrel, `@/` imports | low | — |
| S2 | server | Repositories for `polling`, `settings`, `workspace`, `repos/helpers`; move repo-intel constants out of the adapters | low–med | 8 |
| C2 | client | Split `lib/` into `lib/` (configured libraries) and `utils/` (pure functions); remove the `lib/types.ts` re-export shim | low | — |
| S3 | server | `agents`: narrow dependencies, break the `helpers ↔ repository` cycle | med | 2 |
| C3 | client | Thin the PR-detail `page.tsx`; key-reset instead of effect re-sync in `ConfigTab` | med | — |
| S4 | server | `reviews`: narrow deps for `service`, `run-executor`, `diff-loader`; no row types in the service layer | **high** | 7 |
| S5 | server | `repo-intel`: break the container cycles, narrow deps | **high** | 7 |
| S6 | server | `platform/jobs.ts` behind a repository; name `FindingsBySeverity` once in `@devdigest/shared` (the client copy needs a sync) | med | 2 |
| C4 | client | Enforce the frontend boundaries with a lint tool (dependency change, needs approval) | low | — |

S4 and S5 each need their own plan written before any code. They touch the review run and the
indexer, and both depend on the patterns S1–S3 establish.

## Acceptance for every phase

- `pnpm typecheck` and `pnpm test` are green in the package that changed. On the server, that
  includes the `*.it.test.ts` suite.
- `cd server && pnpm arch:check` is green, and the baseline file only loses entries.
- No change to any contract in `@devdigest/shared`, except in S6, which is an explicit contract
  phase.
- If a structural convention changes, the module `CLAUDE.md` or `docs/` is updated in the same PR.

## Detail

- Server and reviewer-core: [`server/specs/architecture-refactor.md`](../server/specs/architecture-refactor.md)
- Client: [`client/specs/architecture-refactor.md`](../client/specs/architecture-refactor.md)

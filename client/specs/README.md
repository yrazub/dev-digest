# `client/specs/` — frontend specifications

One file per screen or feature: the route, the data it needs and from which endpoint,
the states it must handle (loading / empty / error), and the acceptance criteria.
Written before the screen, read before implementing it.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

| Spec | Route | Status |
|---|---|---|
| [`L01-run-cost.md`](L01-run-cost.md) | `/repos/:repoId/pulls` · `/repos/:repoId/pulls/:number` | draft |
| [`L01-findings-counter.md`](L01-findings-counter.md) | `/repos/:repoId/pulls` · `/repos/:repoId/pulls/:number` | draft |
| [`L02-skills.md`](L02-skills.md) | `/skills` · `/skills/:id` · `/agents` · `/agents/:id` | implemented |
| [`L02-conventions.md`](L02-conventions.md) | `/repos/:repoId/conventions` | draft |
| [`L03-intent-layer.md`](L03-intent-layer.md) | `/repos/:repoId/pulls/:number` | implemented |
| [`architecture-refactor.md`](architecture-refactor.md) | all (C1: `src/lib/hooks`) | draft |

Browser-level acceptance for a finished screen belongs in [`../e2e/specs`](../../e2e/specs).

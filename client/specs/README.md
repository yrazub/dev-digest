# `client/specs/` — frontend specifications

One file per screen or feature: the route, the data it needs and from which endpoint,
the states it must handle (loading / empty / error), and the acceptance criteria.
Written before the screen, read before implementing it.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

| Spec | Route | Status |
|---|---|---|
| [`L01-run-cost.md`](L01-run-cost.md) | `/repos/:repoId/pulls` · `/repos/:repoId/pulls/:number` | draft |
| [`L01-findings-counter.md`](L01-findings-counter.md) | `/repos/:repoId/pulls` · `/repos/:repoId/pulls/:number` | draft |

Browser-level acceptance for a finished screen belongs in [`../e2e/specs`](../../e2e/specs).

# `server/specs/` — backend specifications

One file per feature module: the routes it adds, the contracts it introduces in
`@devdigest/shared`, the tables it starts filling, and the acceptance criteria. Written
before the module, read before implementing it.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

| Spec | Module | Status |
|---|---|---|
| [`L01-run-cost.md`](L01-run-cost.md) | `reviews`, `pulls` | draft |
| [`L01-findings-counter.md`](L01-findings-counter.md) | `pulls` | draft |
| [`L02-skills.md`](L02-skills.md) | `skills` (new), `agents`, `reviews` | implemented |
| [`L02-conventions.md`](L02-conventions.md) | `conventions` | implemented |
| [`architecture-refactor.md`](architecture-refactor.md) | all (S1: `pulls`, `reviews`) | draft |

Use [`../src/modules/repo-intel`](../src/modules/repo-intel/README.md) as the reference
for what a finished module looks like.

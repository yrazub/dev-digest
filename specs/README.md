# `specs/` — cross-package specifications

One file per feature or course lesson: what it must do, the contracts it introduces, and
the acceptance criteria. A spec is written **before** the code and is the thing an agent
reads before implementing. Module-local specs live in that module's `specs/`; anything
that spans packages belongs here.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

| Spec | Status |
|---|---|
| [`L01-run-cost.md`](L01-run-cost.md) | draft |

The lesson roadmap (L01–L08) is in the root [`README.md`](../README.md).
When you add a spec, add a row above.

A spec here stays one level above the code: it states what the feature is, how it flows
end to end and which package owns which part, then hands off to the per-module specs for
the implementable detail — [`server/specs`](../server/specs/README.md) ·
[`client/specs`](../client/specs/README.md) ·
[`reviewer-core/specs`](../reviewer-core/specs/README.md) ·
[`e2e/specs`](../e2e/specs/README.md).

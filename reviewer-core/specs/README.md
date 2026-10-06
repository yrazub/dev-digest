# `reviewer-core/specs/` — engine specifications

One file per prompt slot or pipeline change: what goes into the prompt, what the model
is expected to return, how the grounding gate treats it, and the acceptance criteria.
Written before the change, read before implementing it.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

| Spec | Slot / stage | Status |
|---|---|---|
| [`review-contract.md`](review-contract.md) | `reviewPullRequest()` — grounding, scoring, mode selection | done |
| [`L03-intent-scope.md`](L03-intent-scope.md) | `intent` slot and the scope filter — after grounding, before scoring | implemented |

The slots the engine already accepts but nothing fills yet — `skills` (L02), `specs`
(L05), `memory` (L07), `callers` — are listed in [`../README.md`](../README.md).

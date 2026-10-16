# `specs/` — cross-package specifications

One file per feature or course lesson: what it must do, the contracts it introduces, and
the acceptance criteria. A spec is written **before** the code and is the thing an agent
reads before implementing. Module-local specs live in that module's `specs/`; anything
that spans packages belongs here.

Naming: `L0N-<feature>.md` for course lessons, `<feature>.md` otherwise.

Approved Implementation Plans live in [`plans/`](plans/), under the same name as the spec they
build (`plans/L04-blast-radius.md` builds `L04-blast-radius.md`). The main session saves them
there after approval; `spec-creator` cannot write to that folder.

New specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent: the umbrella
follows the template in that file, with EARS acceptance criteria (`AC-N`), and carries a
`Spec ID: SPEC-YYYY-MM-DD-<slug>` — the date it was written and the feature name, shared with
its module specs. Specs written before
it keep their earlier shape.

| Spec | Status |
|---|---|
| [`L01-run-cost.md`](L01-run-cost.md) | draft |
| [`L01-findings-counter.md`](L01-findings-counter.md) | draft |
| [`L02-pr-self-review.md`](L02-pr-self-review.md) | implemented |
| [`L02-skills.md`](L02-skills.md) | implemented |
| [`plans/L02-skills.md`](plans/L02-skills.md) | done |
| [`L02-conventions.md`](L02-conventions.md) | implemented |
| [`plans/L02-conventions.md`](plans/L02-conventions.md) | done |
| [`architecture-refactor.md`](architecture-refactor.md) | draft |
| [`plans/agents-lab.md`](plans/agents-lab.md) | approved |
| [`L03-intent-layer.md`](L03-intent-layer.md) | implemented |
| [`plans/L03-intent-layer.md`](plans/L03-intent-layer.md) | done |
| [`L03-smart-diff.md`](L03-smart-diff.md) | implemented |
| [`plans/L03-smart-diff.md`](plans/L03-smart-diff.md) | done |
| [`L04-devdigest-mcp.md`](L04-devdigest-mcp.md) | implemented |
| [`plans/L04-devdigest-mcp.md`](plans/L04-devdigest-mcp.md) | approved |
| [`L04-blast-radius.md`](L04-blast-radius.md) | implemented |
| [`plans/L04-blast-radius.md`](plans/L04-blast-radius.md) | done |
| [`L05-project-context.md`](L05-project-context.md) | approved |

The lesson roadmap (L01–L08) is in the root [`README.md`](../README.md).
When you add a spec, add a row above.

A spec here stays one level above the code: it states what the feature is, how it flows
end to end and which package owns which part, then hands off to the per-module specs for
the implementable detail — [`server/specs`](../server/specs/README.md) ·
[`client/specs`](../client/specs/README.md) ·
[`reviewer-core/specs`](../reviewer-core/specs/README.md) ·
[`mcp/specs`](../mcp/specs/README.md) ·
[`e2e/specs`](../e2e/specs/README.md).

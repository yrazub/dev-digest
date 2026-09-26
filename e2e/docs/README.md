# `e2e/docs/` — browser-suite documentation

Stable explanations for the end-to-end suite. How a flow works, the runner conventions
and the local setup live in [`../README.md`](../README.md); this folder is for topics
that need more room — coverage decisions, agent-browser specifics, CI wiring.

| Document | What it covers |
|---|---|
| [`coverage-strategy.md`](coverage-strategy.md) | What's in/out of scope, per-flow mapping, CI wiring |
| [`runner-internals.md`](runner-internals.md) | How `run.ts` executes: shared session, step failure handling, `{BASE}` dispatch |

The overall testing strategy — what belongs in this suite versus a unit test — is in
[`../../TESTING.md`](../../TESTING.md).

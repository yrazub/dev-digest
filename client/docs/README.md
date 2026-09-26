# `client/docs/` — frontend documentation

Stable explanations for the web app. The route map and the stack summary live in
[`../README.md`](../README.md); this folder is for topics that need more room — data
flow, state ownership, design decisions.

| Document | What it covers |
|---|---|
| [`ui-architecture.md`](ui-architecture.md) | what renders on the server vs the client, the provider stack, URL state (tabs, drawer, number ↔ uuid), where code goes, the vendored packages, and the scrolling/clipping rules that force floating UI into a portal |
| [`data-flow.md`](data-flow.md) | the one request path, every PR-screen query key and what refreshes it, a live review run from click to updated counters, and what accepting a finding does and doesn't refresh |

Behaviour that must stay true for a specific screen is specified in [`../specs/`](../specs/README.md), not here.

Add a row when you add a document, and a `Before answering` row in
[`../CLAUDE.md`](../CLAUDE.md) if an agent should read it before working on that topic.

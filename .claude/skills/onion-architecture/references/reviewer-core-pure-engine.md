# reviewer-core: the pure engine

`reviewer-core` is DevDigest's clearest onion. Its domain (prompt assembly, grounding, scoring,
map-reduce) sits in the center. The only way out is the injected `LLMProvider` port, and the
server is its composition root. `reviewer-core/CLAUDE.md` states the rules. This file maps them to
the architecture and to the checks.

## `core-stays-pure` ✓

- Files under `reviewer-core/src/` may import `@devdigest/shared`, `zod` and each other.
- They never import server code (`server/src/**` other than the shared contracts) and never an
  SDK.
- **The exception is `src/llm/`.** `openrouter.ts` is the package's one concrete provider, and
  `structured.ts` uses `openai/helpers/zod`. They are adapters that happen to ship inside the
  package. The pipeline (`review/`, `prompt.ts`, `grounding.ts`) must receive a provider and
  never import `src/llm/openrouter.ts` directly.

## `core-no-node-io` ✓ (except `process.env`)

No `fs`, `child_process`, `net`, `http` or `worker_threads`. dependency-cruiser checks those
imports. It **cannot** see `process.env`, so check reviews for it by hand:
`grep -rn process.env reviewer-core/src` must print nothing.

Configuration comes in as arguments (`ReviewStrategy`, model id, limits), resolved by the server
from `platform/config.ts` or from the agent row.

## `core-public-api-only` ✓

The server imports `@devdigest/reviewer-core`, the tsconfig alias for `src/index.ts`, and nothing
deeper. A deep import (`@devdigest/reviewer-core/review/run`) couples the server to the engine's
internal layout. If the server needs something, export it from `index.ts`.

## Where new engine code goes

| New thing | Place |
|---|---|
| a rule about findings, scores, verdicts | `reviewer-core/src/` (pure, with a test and a stubbed provider) |
| a new prompt slot (skills, memory, specs, callers) | `src/prompt.ts` + `docs/prompt-slots.md`; the **server** gathers the data and passes it in |
| anything that needs the DB, git or GitHub to compute | the server gathers it (repo-intel, a repository) and passes the result as an argument |
| a new LLM transport | an adapter implementing `LLMProvider`: in the server's `adapters/llm/`, unless every consumer of the engine needs it |

## How this is checked

`reviewer-core` has no dependency-cruiser of its own, so its `package-lock.json` stays untouched.
The server's `pnpm arch:check` cruises `../reviewer-core/src` as well. The `server unit` workflow
already path-filters on `reviewer-core/**`, so a PR that touches only the engine still runs the
check.

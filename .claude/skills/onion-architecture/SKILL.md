---
name: onion-architecture
description: "Onion (ports-and-adapters) architecture for the DevDigest backend — server/ (Fastify 5, Drizzle/Postgres, Zod, the DI container, adapters) and reviewer-core/. Decides which layer a piece of backend code belongs to, which way a dependency may point, where a port interface lives, how a service gets its dependencies, where transactions start, where Zod parses, and how dependency-cruiser enforces all of it (pnpm arch:check). Use when adding or moving a route, service, repository, adapter, port or domain rule in server/ or reviewer-core/; when a service needs the database, GitHub or an LLM; when reviewing a backend diff for layering; or when arch:check fails. Does not cover Fastify, Drizzle or Zod API usage — use fastify-best-practices, drizzle-orm-patterns and zod for that."
metadata:
  version: "1.0.0"
  updated: "2026-09-27"
---

# Onion architecture — DevDigest backend

The domain sits in the middle; everything that talks to the outside world sits on the edge; and
**source-code dependencies point inward only**. An inner layer never names anything from an outer
one (Palermo's first tenet, Martin's Dependency Rule). The database, Fastify, GitHub and the LLM
are details at the edge.

**The project's documents win.** `server/CLAUDE.md`, `server/docs/architecture.md`,
`reviewer-core/CLAUDE.md` and the specs override this skill where they speak.

## The layers here

| Layer (inner → outer) | DevDigest location | May import |
|---|---|---|
| **Domain** | `@devdigest/shared` contracts (`server/src/vendor/shared`) · `modules/<m>/domain.ts` · `reviewer-core` (grounding, scoring, prompt) | other domain code, `zod` |
| **Ports** | external-world ports in `@devdigest/shared` (`adapters.ts`: `LLMProvider`, `GitHubClient`, …) · persistence ports in `modules/<m>/ports.ts` | domain |
| **Application** (use cases) | `modules/<m>/service.ts`, `run-executor.ts` and other orchestrators | domain, ports, `platform/errors.ts`, `platform/run-logger.ts` |
| **Edge / infrastructure** | `modules/<m>/routes.ts` (Fastify) · `modules/<m>/repository.ts`, `repository/` (Drizzle) · `src/adapters/*` · `src/db/` · `platform/config.ts` | anything inward |
| **Composition root** | `platform/container.ts`, `src/app.ts`, `src/server.ts`; a module's `routes.ts` for its own wiring | everything |

## Where does this code go?

Stop at the first *yes*.

| # | Question | Put it… |
|---|---|---|
| 1 | Does it construct an adapter, a repository or a service? | in the composition root: `container.ts` if several modules share it, else the module's `routes.ts` |
| 2 | Does it know about HTTP — `req`, `reply`, status codes, schemas on a route? | `routes.ts` |
| 3 | Does it build a query, touch `db`, a table or a Drizzle row type? | `repository.ts` / `repository/<aggregate>.repo.ts` |
| 4 | Does it call an SDK (octokit, openai, simple-git, ast-grep, fs, child_process)? | an adapter in `src/adapters/<x>/` behind a port |
| 5 | Is it the *shape* of something another package also sees? | a Zod contract in `@devdigest/shared` |
| 6 | Is it a rule that decides something from data alone (no I/O)? | `modules/<m>/domain.ts`; if two modules need it, `@devdigest/shared` |
| 7 | Does it sequence I/O steps — load, decide, persist, emit? | `service.ts` (or a named orchestrator next to it) |

Defaults for this repo:
- New services get **narrow dependencies** rather than `Container`. Existing services are left as they are until a task touches them.
- A service gets a **`ports.ts` interface** for its store only when it holds logic worth unit-testing without Postgres. A thin pass-through may use the concrete repository.
- Machine enforcement is **dependency-cruiser with a baseline**, and it also covers `reviewer-core`.

## Rules

Impact: **CRITICAL** breaks the architecture · **HIGH** erodes it · **MEDIUM** hurts clarity.
IDs in `code` are also rule names in `server/.dependency-cruiser.cjs` where they are
machine-checked (✓).

### Dependency direction — [layers-and-dependency-rule.md](references/layers-and-dependency-rule.md)

| ID | Rule | Impact | ✓ |
|---|---|---|---|
| `dep-inward-only` | An inner layer never imports from an outer one | CRITICAL | partly |
| `dep-domain-framework-free` | Domain and ports import no Fastify, Drizzle, SDK, `src/db`, `platform` or `adapters` | CRITICAL | ✓ |
| `dep-no-cross-module` | `modules/a` never imports `modules/b`; shared rules move inward | HIGH | ✓ |
| `no-circular` | No import cycles | HIGH | ✓ |
| `dep-proportionate` | Add a layer or an interface only when logic or a test needs it | MEDIUM | — |

### Fastify at the edge — [fastify-edge.md](references/fastify-edge.md)

| ID | Rule | Impact | ✓ |
|---|---|---|---|
| `edge-thin-routes` | A handler takes parsed input, calls one use case, returns a contract | CRITICAL | via `db-only-in-repository` |
| `edge-fastify-in-routes-only` | Only `routes.ts` and `modules/_shared/` import Fastify | HIGH | ✓ |
| `edge-errors-mapped-at-edge` | Services throw `AppError` subclasses; the shared handler renders them | HIGH | — |
| `edge-schema-first` | Zod `params`/`body`/`response` on the route, never `Schema.parse(req.body)` | HIGH | — |
| `edge-hooks-no-logic` | Hooks do cross-cutting work only (auth, context, logging) | MEDIUM | — |

### Drizzle as infrastructure — [drizzle-persistence.md](references/drizzle-persistence.md)

| ID | Rule | Impact | ✓ |
|---|---|---|---|
| `db-only-in-repository` | `src/db/` and Drizzle are imported only by repositories and the composition root | CRITICAL | ✓ |
| `db-return-domain-types` | A repository returns contracts/domain types, never `$inferSelect` rows | HIGH | — |
| `db-tx-owned-by-use-case` | The service decides the transaction boundary; repositories accept an executor | HIGH | — |
| `db-no-query-leak` | A repository returns finished results, never a query builder | MEDIUM | — |

### Zod and contracts — [zod-contracts-boundaries.md](references/zod-contracts-boundaries.md)

| ID | Rule | Impact |
|---|---|---|
| `zod-parse-at-boundary` | Parse every input where it enters: HTTP, LLM output, GitHub, config, secrets, JSON columns | CRITICAL |
| `zod-contract-once` | A shape crossing a package boundary is defined only in `@devdigest/shared` | HIGH |
| `zod-trust-inside` | Past the boundary, code trusts its types; no defensive re-parsing | MEDIUM |
| `zod-domain-vs-wire` | A separate domain type only when it really differs from the contract | MEDIUM |

### DI and the composition root — [composition-root-di.md](references/composition-root-di.md)

| ID | Rule | Impact | ✓ |
|---|---|---|---|
| `di-composition-root-only` | `new SomeAdapter()` / `new SomeRepository()` only in a composition root or a test | CRITICAL | — |
| `di-narrow-deps` | A new service receives the ports it uses, not `Container` | HIGH | ✓ |
| `di-lazy-secrets` | Secret-backed clients stay lazy and async; the server boots with no keys | HIGH | — |
| `platform-no-modules` | `platform/` never imports a module, except the container | HIGH | ✓ |

### Adapters — [adapters.md](references/adapters.md)

| ID | Rule | Impact | ✓ |
|---|---|---|---|
| `adapter-implements-port` | Every adapter implements a port; its mock in `mocks.ts` implements the same one | CRITICAL | — |
| `adapter-no-app-layers` | An adapter never imports a module | HIGH | ✓ |
| `adapter-no-business-rules` | An adapter translates (SDK ↔ port, SDK error ↔ `AppError`) and decides nothing | HIGH | — |

### reviewer-core — [reviewer-core-pure-engine.md](references/reviewer-core-pure-engine.md)

| ID | Rule | Impact | ✓ |
|---|---|---|---|
| `core-stays-pure` | No server code and no SDK outside `src/llm/`; the only side effect is the injected `LLMProvider` | CRITICAL | ✓ |
| `core-no-node-io` | No `fs`, `child_process`, `net`, `http`; no `process.env` | CRITICAL | ✓ (not `process.env`) |
| `core-public-api-only` | The server imports `@devdigest/reviewer-core`, i.e. `src/index.ts`, only | HIGH | ✓ |

### Tests by layer — [testing-by-layer.md](references/testing-by-layer.md)

Domain: plain unit tests, no doubles. Service: fake ports. Repository: `*.it.test.ts` on real
Postgres. Route: `app.inject` with container overrides. The suite layout is `TESTING.md`'s.

### Enforcement — [enforcement-dependency-cruiser.md](references/enforcement-dependency-cruiser.md)

`cd server && pnpm arch:check` runs in the `server unit` CI workflow. Existing leaks are
baselined in `server/.dependency-cruiser-known-violations.json`, so only **new** ones fail.
Never re-baseline to silence a new violation.

## How to apply

- **Writing code:** walk the table in "Where does this code go?" before creating a file. Then run `pnpm arch:check`.
- **Reviewing:** check the CRITICAL and HIGH rules first, and cite the ID and file. For example: "`db-only-in-repository`: `pulls/routes.ts` queries `t.repos` directly."
- **Touching legacy code:** code already in the baseline may stay as it is. Do not *add* a new leak next to it. Do not refactor unrelated leaks in a feature PR. If a task fixes one, run `pnpm arch:baseline` in the same PR so the baseline shrinks.
- **Unsure between two layers:** pick the outer one. Moving code inward later is cheap. Undoing a domain that imports Drizzle is not.

Sources for every rule: [references/sources.md](references/sources.md).

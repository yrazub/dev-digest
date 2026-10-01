# Layers and the dependency rule

## The rule

> "All code can depend on layers more central, but code cannot depend on layers further out from
> the core." — Palermo, *The Onion Architecture*

> "The name of something declared in an outer circle must not be mentioned by the code in an
> inner circle." — Martin, *The Clean Architecture*

The rule applies to **type-only imports too**. `import type { AgentRow } from '../../db/rows.js'`
in a service still ties the use case to the table layout: rename a column and the service breaks.

The same idea goes by three names: Onion (Palermo), Hexagonal / Ports and Adapters (Cockburn), and
Clean Architecture (Martin). All three agree on the part this skill enforces. The core defines the
interfaces it needs (ports). The edge implements them (adapters). Wiring happens in one place, the
composition root.

## DevDigest mapping

```
Domain        @devdigest/shared (Zod contracts)        modules/<m>/domain.ts        reviewer-core
   ↑
Ports         @devdigest/shared/adapters.ts (LLMProvider, GitHubClient, GitClient, CodeIndex,
              SecretsProvider, AuthProvider, Embedder)  ·  modules/<m>/ports.ts (stores)
   ↑
Application   modules/<m>/service.ts · run-executor.ts · pipeline/*.ts (orchestrators)
   ↑
Edge          routes.ts (Fastify) · repository.ts, repository/*.repo.ts (Drizzle) · src/adapters/*
              src/db/* · platform/config.ts · platform/sse.ts · platform/jobs.ts
   ↑
Root          platform/container.ts · src/app.ts · src/server.ts
```

`platform/errors.ts` and `platform/run-logger.ts` are dependency-free utilities. Every layer may
use them, and treating them as part of the domain is fine.

### Why the ports split into two homes

- **External-world ports** (LLM, GitHub, git, code index, secrets, auth) live in
  `@devdigest/shared`. `reviewer-core` needs `LLMProvider` too, and one package cannot reach into
  another's source.
- **Persistence ports** (`ReviewStore`, `AgentStore`) are server-only. `@devdigest/shared` is also
  copied into `client/src/vendor/shared`, and the client must not receive server storage
  interfaces. So they live in `modules/<m>/ports.ts`, next to the only consumer.

## Where domain logic goes

A **domain rule** decides something from data alone. Examples:
- rolling finding severities up into counts (`rollupSeverities`);
- deriving a PR's review status;
- deciding whether a run is billable;
- grounding a finding against a diff.

It has no I/O, takes values and returns values, and is tested without doubles (*Functional Core,
Imperative Shell*).

- One module uses it → `modules/<m>/domain.ts` (or `domain/<topic>.ts` once it grows).
- Two modules use it → move it inward to `@devdigest/shared`, or to `modules/_shared/` if it is
  server-only. **Never** import it from the other module. `reviews → pulls/status.ts` is the
  existing example of what not to copy (baselined).
- It belongs to the review engine (prompt, grounding, scoring) → `reviewer-core`.

The existing `helpers.ts` files are a mix of domain rules and row-to-DTO mappers. For new code:
rules go to `domain.ts`, mappers go into the repository (see
[drizzle-persistence.md](drizzle-persistence.md)).

## `dep-proportionate`: don't over-onion

Palermo says the pattern is "not appropriate for small websites". The ceremony has to pay for
itself:

- **No entity classes for CRUD.** The Zod contract *is* the domain type until a real invariant
  shows up.
- **No `ports.ts` for a pass-through service.** A service that only loads and returns may depend
  on the concrete repository. Add the interface the day the service gains a branch worth
  unit-testing.
- **No service for a trivial read.** A route may call a repository method directly when there is
  no rule in between. The rule forbids *queries in routes*, not *routes without services*.
- **No mappers that copy a row field by field into an identical shape.** Map only where the names
  or the shape actually differ, such as `snake_case` on the wire vs `camelCase` in Drizzle.

The test: if the extra file has no logic and no test that needs it, delete it.

## Checklist for a new module

1. The contracts it exposes are in `@devdigest/shared`.
2. `routes.ts` has schema-first handlers and wires the service with narrow dependencies.
3. `service.ts` holds orchestration only, and its constructor lists its ports.
4. `domain.ts` holds the pure rules, if there are any.
5. `repository.ts` holds Drizzle, returns contracts, and implements `ports.ts` if one exists.
6. It imports no other module. `pnpm arch:check` passes.

# `@devdigest/api` — Fastify + Drizzle/Postgres backend (`:3001`)

## Before answering

**Read the matching document before you touch code.**

| If the task touches… | Read first |
|---|---|
| a route, its Zod schema, or the error envelope | `README.md` — API map |
| adapters, DI wiring, or mocking the outside world | `README.md` — "Request & DI flow" |
| the DB schema, a migration, or seeds | `docs/schema.md` |
| the container, a review run's lifecycle, SSE/cancellation, or which module owns a table | `docs/architecture.md` |
| adding a `modules/<name>/` plugin | `specs/` for the feature, and `src/modules/repo-intel/README.md` as the reference module |
| run cost, or the findings counter/popover data | `specs/L01-run-cost.md` · `specs/L01-findings-counter.md` |
| repo indexing, symbols, the import graph, or the repo map | `src/modules/repo-intel/README.md` |
| any test | `../TESTING.md` |
| a failure that smells familiar | `INSIGHTS.md` — and **append** to it through the `engineering-insights` skill |

If nothing matches, proceed.

## Commands

`pnpm dev` (tsx watch, `:3001`) · `pnpm test` · `pnpm typecheck` · `pnpm build`
`pnpm db:migrate` · `pnpm db:seed` (idempotent) · `pnpm db:generate` (drizzle-kit)

Split the suite: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic) /
`pnpm exec vitest run .it.test` (real Postgres via testcontainers).

## Where things live

| | |
|---|---|
| `src/modules/<name>/` | feature plugins — routes, service, tests. Registered statically in `src/modules/index.ts` |
| `src/adapters/` | ports to the outside world: llm · github · git · astgrep · codeindex · depgraph · embedder · tokenizer · secrets · auth |
| `src/platform/` | cross-cutting: `container.ts` (DI) `config.ts` `errors.ts` `sse.ts` `model-router.ts` `run-logger.ts` |
| `src/db/` | `schema/` (one file per domain) · `migrations/` · `seed.ts` |
| `src/vendor/shared` | `@devdigest/shared` — the Zod contracts, source of truth for every package |

## Conventions

- **Plugins register before modules** so the encapsulated module plugins inherit helmet,
  cors, rate-limit, SSE and the shared error handler.
- **Validation is schema-first.** A route declares Zod `params`/`body`
  (`fastify-type-provider-zod`); invalid input is rejected with `422` *before* the
  handler runs. Do not hand-roll `Schema.parse(req.body)`.
- Everything external goes through an adapter behind the DI container. Tests swap in
  `src/adapters/mocks.ts` — never reach for the network in a test.
- `*.it.test.ts` is DB-backed. Any other test file must be hermetic and key-free.
- Rate limiting is global 120/min (off under `NODE_ENV=test`), tighter on expensive
  routes like `POST /pulls/:id/review`; SSE and `/health*` are exempt.

## Naming

- A module is `src/modules/<name>/` with `routes.ts` · `service.ts` · `repository.ts`; a
  repository split by aggregate lives in `repository/<aggregate>.repo.ts` (`run.repo.ts`).
- Tests are `test/<module>-<topic>.test.ts` (`pulls-status.test.ts`); a DB-backed test ends
  in `.it.test.ts` (`pulls-cost.it.test.ts`) — the suffix is what splits the two suites.
- A migration keeps the name `pnpm db:generate` gives it (`0011_ambiguous_slyde.sql`).

## Gotchas & do not touch

- The schema already contains **every** table, including ones no lesson fills yet.
  An empty table is not a bug.
- `loadConfig` marks every secret optional — the server boots with no keys at all.
- `LocalSecretsProvider` (`src/adapters/secrets/local.ts`) is the single read chokepoint
  for secrets. `GITHUB_TOKEN` is canonical, `GITHUB_PAT` is accepted as a fallback.
- The engine reaps orphaned `running` runs on boot — do not add a second reaper.
- **Do not touch** `src/db/migrations/**` (including `meta/`). `src/vendor/shared` is the
  opposite case: it is the authored `@devdigest/shared`, so a contract change belongs there —
  the client's copy is synced separately and will not pick it up on its own.

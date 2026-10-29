# `@devdigest/api` - Fastify + Drizzle/Postgres backend (test fixture)

## Where things live

| | |
|---|---|
| `src/modules/<name>/` | feature plugins - routes, service, repository, tests. Registered in `src/modules/index.ts` |
| `src/adapters/` | ports to the outside world (github, llm, ...) and `mocks.ts` for tests |
| `src/platform/` | cross-cutting: `container.ts` (DI) `config.ts` `errors.ts` |
| `src/db/` | `schema.ts`, Drizzle client |
| `src/vendor/shared` | `@devdigest/shared` - the Zod contracts, source of truth for every package |
| `../reviewer-core` | the review engine; the server imports it, never the reverse |

## Conventions

- Validation is schema-first: a route declares Zod `params`/`query`/`body`.
- Everything external goes through an adapter behind the DI container. Tests swap in `src/adapters/mocks.ts`.
- Contract fields are `snake_case`; Drizzle properties are `camelCase`.
- Run `pnpm arch:check` after touching module structure. Existing leaks are baselined in
  `.dependency-cruiser-known-violations.json`.

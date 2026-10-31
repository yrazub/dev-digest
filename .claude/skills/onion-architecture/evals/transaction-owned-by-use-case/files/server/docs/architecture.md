# Architecture (fixture)

A module is `routes.ts` -> `service.ts` -> `repository.ts`. Routes speak HTTP, services sequence
work, repositories talk to Postgres through Drizzle. Outside services (GitHub, the LLM) are reached
through adapters in `src/adapters/`, built once in `platform/container.ts`.

Layer boundaries are enforced by dependency-cruiser (`pnpm arch:check`, rules in
`.dependency-cruiser.cjs`). Known leaks that predate the check are listed in
`.dependency-cruiser-known-violations.json`; only new ones fail the build.

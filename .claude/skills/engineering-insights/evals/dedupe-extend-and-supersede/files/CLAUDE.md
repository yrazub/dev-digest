# Acme Digest (test fixture)

Local-first AI pull-request review. Three standalone packages, no workspace — each has its own
`package.json` and lockfile.

| Folder | What | PM |
|---|---|---|
| `server/` | Fastify API, Drizzle + Postgres. `server/src/vendor/shared` is the authored `@acme/shared` (Zod contracts) | pnpm |
| `client/` | Next.js studio. `client/src/vendor/shared` is a *copy* of the shared contracts, synced separately | pnpm |
| `reviewer-core/` | pure engine: diff -> prompt -> LLM -> findings | npm |

## Conventions

- Contracts are defined once in `@acme/shared`. Never redeclare a shape locally.
- Never edit `client/src/vendor/**` (vendored copy).
- Migrations do not run on boot. Generate them with `pnpm db:generate`, never hand-edit.
- Lock files are never hand-edited; they change only as a side effect of `pnpm add` / `npm install`
  run inside the package, and only when the task is a dependency change.
- reviewer-core: run `npm install` after pulling.

## Insights

Before a session ends, if it hit a problem, made a decision or turned up anything non-obvious,
record it in the INSIGHTS.md of the module it touched (root `INSIGHTS.md` for cross-package
findings).

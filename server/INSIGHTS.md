# Insights — `@devdigest/api`

Traps we have already hit in the server. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## Codebase Patterns

- **2026-09-20** — `src/vendor/shared` is the **authored** `@devdigest/shared`: both
  `server/tsconfig.json` and `reviewer-core/tsconfig.json` alias the package to it, and feature
  commits edit it (`93119a5` added `agent_runs.cost_usd` to the contracts this way).
  `client/src/vendor/shared` is a second, already-drifted copy — `diff -rq` shows `adapters.ts`,
  `contracts/trace.ts` and three others differ — so a contract change here does not reach the
  client until that copy is synced, and the client keeps type-checking meanwhile. Adding a field
  to a contract is therefore a server-side change the client picks up separately.
  **See also:** `client/INSIGHTS.md` is where the consumer side of a contract change belongs.

- **2026-09-20** — routes in `src/modules/reviews/routes.ts` declare `schema: { params }` only,
  with no response schema, so handler return values are **not** serialization-filtered. A new
  field on a shared response contract (e.g. `RunSummary`) reaches the wire as soon as the
  repository maps it; there is no second place to register it. The contract is documentation and
  a client type, not a runtime filter.

## Recurring Errors & Fixes

### `No file …_<name>.sql found` on a fresh database, while CI's migrated lane is green
**Date:** 2026-08-05
**Cause:** `src/db/migrations/meta/_journal.json` had history *rewritten* rather than
appended — an entry replaced instead of added, and one upstream migration dropped. A
database that is already migrated never replays those entries, so the failure only shows
up where the schema is built from zero. The regenerated snapshots had also silently lost
columns that `src/db/schema/runs.ts` still declares.
**Fix / rule:** the journal, the `.sql` files and `meta/*_snapshot.json` must always
agree — same count, tags in order, each snapshot's `prevId` pointing at the previous one.
Never hand-merge them: renumber your own migrations to sit *after* upstream's and keep
the snapshot chain relinked. Verify against a fresh testcontainer, not your dev DB.
**See also:** the root `INSIGHTS.md` — the general rule this is one instance of: never resolve
a generated artefact by taking one side of a merge.

### A dependency type-checks locally and fails CI with `TS2307`
**Date:** 2026-08-05
**Cause:** `fflate` was imported by a module but declared in neither `package.json` nor
the lockfile. It resolved locally only because a stray copy was sitting in
`node_modules` from an earlier install.
**Fix / rule:** after adding an import, confirm the package is declared —
`pnpm install --frozen-lockfile` reproduces what CI sees. A clean install is the only
honest check; a working local build proves nothing about the dependency graph.

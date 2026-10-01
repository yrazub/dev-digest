# Drizzle as infrastructure

The database is not the center. It is external (Palermo). Drizzle is how the edge talks to
Postgres, and the use cases never see it.

## `db-only-in-repository` ✓

`src/db/**` (`schema`, `client`, `rows`) and `drizzle-orm` are imported only by:

- `modules/<m>/repository.ts` and `modules/<m>/repository/**` (`run.repo.ts`, `mappers.ts`);
- the composition root: `platform/container.ts`, `src/app.ts` (the boot-time reaper),
  `src/server.ts`;
- `src/db/**` itself (seed, migrate) and adapters that are themselves persistence
  (`adapters/auth/local.ts`).

The dependency-cruiser rule targets `src/db/` rather than `drizzle-orm`. The resolved
`drizzle-orm` path contains the pnpm version, which would make baseline entries break on every
upgrade. Any file that queries imports `src/db/schema` anyway, so nothing slips through.

## `db-return-domain-types`

A repository speaks the domain's language. It takes and returns `@devdigest/shared` contracts, or
module domain types, never `typeof t.x.$inferSelect`.

```ts
// modules/reviews/repository.ts
async latestForPull(pullId: string): Promise<Review | null> {
  const [row] = await this.db.select().from(t.reviews).where(eq(t.reviews.pullRequestId, pullId))
    .orderBy(desc(t.reviews.createdAt)).limit(1);
  return row ? toReview(row) : null;          // mapper lives in repository/ — the service never sees ReviewRow
}
```

- The `camelCase` → `snake_case` conversion happens here, exactly once. That is the root
  `CLAUDE.md` naming rule.
- `src/db/rows.ts` exists so repositories can share row types. It is **not** a way for services
  to reach rows (`reviews/service.ts` → `AgentRow` is baselined, and new code must not copy it).
- Mappers live next to the repository (`repository/mappers.ts`) because they are the only code
  that knows both shapes. The old `helpers.ts` → `findingRowToDto` pattern goes there when
  touched.

## `db-tx-owned-by-use-case`

The service decides what must be atomic, because atomicity is a business rule. The repository
decides how that is done with Drizzle.

```ts
// modules/<m>/ports.ts
export interface RunStore {
  complete(runId: string, summary: RunSummary): Promise<void>;
  saveFindings(runId: string, findings: Finding[]): Promise<void>;
}
export interface UnitOfWork {
  run<T>(work: (stores: { runs: RunStore }) => Promise<T>): Promise<T>;
}

// modules/<m>/repository.ts
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
export class RunRepository implements RunStore {
  constructor(private readonly db: Executor) {}
  // …queries use this.db, which is either the pool or the tx
}
export const drizzleUnitOfWork = (db: Db): UnitOfWork => ({
  run: (work) => db.transaction((tx) => work({ runs: new RunRepository(tx) })),
});

// modules/<m>/service.ts — no Drizzle import anywhere
await this.uow.run(async ({ runs }) => {
  await runs.saveFindings(id, findings);
  await runs.complete(id, summary);
});
```

- Nested `tx.transaction()` is a savepoint in Drizzle. Use it inside a repository for partial
  rollback. Never expose it to the service.
- Keep external calls (LLM, GitHub) **outside** the transaction. Open it only around the writes
  that must land together, because a slow LLM call inside a transaction holds a connection and
  row locks.
- A single-statement write needs no unit of work. Add one when a second write must commit with
  the first.

## `db-no-query-leak`

Return finished data (`Promise<Review[]>`), never a Drizzle query builder or `SQL` fragment that
the caller finishes. A leaked builder moves query construction back into the service.

## Further reading

- Sentry, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/):
  the executor-passing transaction pattern, with Drizzle.
- Drizzle, [Transactions](https://orm.drizzle.team/docs/transactions): nested transactions are
  savepoints.
- Khalil Stemmler, [DTOs, Mappers and the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/).
- Use the `drizzle-orm-patterns` and `postgresql-table-design` skills for query and schema
  details.

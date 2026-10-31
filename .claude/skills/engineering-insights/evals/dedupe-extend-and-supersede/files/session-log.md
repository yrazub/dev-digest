# Session log - "add a reviews.status column"

Touched: `server/src/db/schema.ts`, `server/src/db/migrations/0007_add_review_status.sql` (generated),
`server/package.json` (no change), `server/vitest.config.ts` (no change).

## 1. relation "reviews" does not exist

Pulled main, started the API: `error: relation "reviews" does not exist`. Ran
`cd server && pnpm db:migrate`, fine. (Same thing as always - migrations don't run on boot.)

## 2. db:migrate failed after a rebase: `column "status" of relation "reviews" already exists`

Rebased my branch onto main where a teammate had also added a migration. Both of us had generated
`0007_*`. After the rebase the journal listed my 0007 before theirs, so `db:migrate` tried to add
`status` a second time and aborted. Fix: deleted my generated 0007 and its snapshot, ran
`pnpm db:generate` again so it numbered itself 0008 on top of upstream's journal. Lesson: after a
rebase that brings in migrations, regenerate your own, do not keep the old number.
(This is the same area as the "relation does not exist" entry, but a different failure after a
rebase, not after a pull.)

## 3. `pnpm db:push` does not exist any more

An old note in server/INSIGHTS.md says to use `pnpm db:push` while iterating. I tried it:

    ERR_PNPM_NO_SCRIPT  Missing script: db:push

`server/package.json` has no `db:push` script now (scripts end at `db:seed`, `db:migrate` is on
line 8). Checked `git log -S db:push -- server/package.json`: it was removed on 2026-10-09 in "chore(server):
drop db:push" because it let the dev DB drift away from the migration journal and also dropped
the pgvector index created by a hand-written migration. The rule now is: schema changes go through
`pnpm db:generate` then `pnpm db:migrate`, always.

## 4. `pnpm test` reported green but skipped the integration tests

`pnpm test` printed `Test Files 14 passed` - I expected 19. Docker Desktop was not running, and
`vitest.config.ts` excludes `**/*.it.test.ts` when `dockerAvailable()` is false (line 16 `exclude:`),
silently - no warning, no failure. The suite looked green with a quarter of the tests not run.
Start Docker and look at the file count before trusting a green run.

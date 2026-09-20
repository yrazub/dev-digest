# Calibration — what an entry has to look like

## Contents

- Rejected vs accepted, one pair per rubric
- Routing, worked through
- Collisions: skip, extend, or resolve
- Superseding an entry that stopped being true

---

## Rejected vs accepted

The rejected column is not wrong, it is *useless cold*: it names a topic instead of a claim.

### What Works

> ✗ "Testcontainers are good for DB tests."

> ✓ **2026-08-05** — DB-backed tests get a real Postgres per run via testcontainers and are
> named `*.it.test.ts`; `pnpm exec vitest run .it.test` runs only those and
> `--exclude '**/*.it.test.ts'` runs only the hermetic half. Splitting the suite this way is
> what keeps the hermetic lane key-free and runnable with no Docker.

### What Doesn't Work

> ✗ "Don't hand-merge migrations."

> ✓ ### Resolving a migration conflict by taking one side of `meta/`
> **Date:** 2026-08-05
> **Cause:** `meta/_journal.json` and `meta/*_snapshot.json` are a chain — each snapshot's
> `prevId` points at the previous one — so taking either side wholesale silently drops the
> other side's migrations and the columns they added.
> **Fix / rule:** renumber your own migrations to sit after upstream's and relink the snapshot
> chain, or regenerate with `pnpm db:generate`. Never resolve `meta/` by choosing a side.

### Codebase Patterns

> ✗ "The server uses Zod."

> ✓ **2026-08-05** — routes declare Zod `params`/`body` through `fastify-type-provider-zod`,
> so invalid input is rejected with `422` *before* the handler runs. A handler that calls
> `Schema.parse(req.body)` itself is a bug: it turns a 422 into a 500.

### Tool & Library Notes

> ✗ "Careful with pnpm."

> ✓ **2026-08-05** — an import resolves locally from a stray `node_modules` copy even when the
> package is in neither `package.json` nor the lockfile; CI then fails with `TS2307`. Only
> `pnpm install --frozen-lockfile` reproduces what CI sees — a green local build proves
> nothing about the dependency graph.

### Decisions

> ✗ "We use different package managers."

> ✓ **2026-08-05** — `server`/`client` use pnpm, `reviewer-core`/`e2e` use npm, and there is
> no workspace root: each package installs on its own and shares code through tsconfig path
> aliases. Rejected a pnpm workspace because the packages are meant to be lifted out
> independently. Practical consequence: never run `pnpm -r`, and match the lockfile that is
> already in the directory.

### Recurring Errors & Fixes

> ✗ "Migrations sometimes fail."

> ✓ ### `relation … does not exist` on a database that worked yesterday
> **Date:** 2026-08-05
> **Cause:** migrations do not run on boot, so a schema change pulled from `main` leaves the
> local database behind the code.
> **Fix / rule:** `cd server && pnpm db:migrate`. Reach for this before suspecting the schema
> — and never `docker compose down -v`, which drops `devdigest_pgdata` along with every repo
> and review that was imported.

### Open Questions

> ✗ "Not sure how the grounding gate handles renames."

> ✓ **2026-08-05** — unclear whether the grounding gate drops findings on a renamed file, or
> whether the line references simply never match. Ruled out: it is not the diff parser, which
> reports the rename correctly. Next step is a fixture with a rename plus an edit in the same
> PR.

### Session Notes

> ✗ "**2026-08-05** — worked on migrations."

> ✓ **2026-08-05** — tracked a CI-only migration failure to a rewritten journal; added the
> chain rule under Recurring Errors & Fixes and the `--frozen-lockfile` note under Tool &
> Library Notes.

---

## Routing, worked through

**A repo-intel indexing bug.** `server/src/modules/repo-intel/` is inside the server package,
not a package of its own → `server/INSIGHTS.md`. The folder having its own `README.md` does
not make it a routing target.

**A contract change that broke the client.** The Zod contract lives in
`server/src/vendor/shared`, which is vendored and not edited here. The finding is really
"adding a field to a shared contract needs the client's query types regenerated too" — so it
is two entries: one in `server/INSIGHTS.md` from the producer's side, one in
`client/INSIGHTS.md` from the consumer's. Not one merged entry, and not the root file.

**An e2e flow that passes in CI and fails locally.** Only `e2e/` is involved →
`e2e/INSIGHTS.md`, even though the cause is seeded data in Postgres.

**`docker compose down -v` wiping the volume.** Belongs to no package → root `INSIGHTS.md`.

---

## Collisions: skip, extend, or resolve

The grep before writing is the whole point. These are the three things it turns up.

### Skip — the same claim, nothing new

Candidate: "`pnpm install --frozen-lockfile` is the only honest check that a dependency is
declared." `grep -in 'frozen-lockfile' server/INSIGHTS.md` already returns the `TS2307` entry,
which says exactly that with the `fflate` evidence attached.

**Write nothing.** The second copy adds no claim and no evidence; it only makes the file
longer and the original harder to find.

### Extend — the same topic, a narrower case

Candidate: "the same `TS2307` failure happens with a `devDependency` that only the test lane
imports." The `TS2307` entry covers the mechanism but not this case.

Append beneath the existing entry, leaving its text alone:

```markdown
**2026-09-14:** same failure for a `devDependency` imported only by `*.it.test.ts` — the
hermetic lane never loads it, so only the integration lane fails. `--frozen-lockfile` still
catches it.
```

### Resolve — the new finding contradicts an old one

Candidate: "flows `02`, `04` and `05` pass locally now." `e2e/INSIGHTS.md` says they fail
locally and pass in CI. Both cannot be true.

Establish which holds *now* — run `npm test` against the dev DB, do not assume the newer claim
wins. Then, if the flows really were fixed:

```markdown
**Superseded 2026-09-14:** the flows now select the seeded repo by slug instead of following
the home redirect, so a dev DB with several repos no longer breaks them. The
`docker compose down -v` warning still stands.
```

If the run is inconclusive — say the flows pass on one machine and fail on another — do not
pick a winner. Append `**Disputed 2026-09-14:** …` to the entry, add an `Open Questions` line
naming the check that would settle it, and **tell the user**: a contradiction is worth a
spot-check while the session is still fresh.

### The legitimate split that looks like a duplicate

The root entry "CI passes on an already-migrated database and fails on a fresh one" and the
server entry "`No file …_<name>.sql found` …" are the same 2026-08-05 incident. That is not a
duplicate to collapse: the root holds the general rule (never resolve a generated artefact by
taking one side of a merge), the server file holds the Drizzle journal and snapshot mechanics.
Each carries a `**See also:**` line pointing at the other — without it, a session that reads
only one walks away with half the lesson.

---

## Superseding

The code moved on. The entry stays; a dated line is added under it:

```markdown
### CI passes on an already-migrated database and fails on a fresh one
**Date:** 2026-08-05
**Cause:** …
**Fix / rule:** …
**Superseded 2026-09-14:** CI now runs `db:migrate` against an empty database in both lanes,
so the two lanes can no longer disagree. The rule about resolving `meta/` by appending still
applies — only the CI-only symptom is gone.
```

Never delete the original text. The record of why a rule existed is usually the reason the
rule is still worth having.

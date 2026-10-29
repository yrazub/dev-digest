# Insights — `@acme/api`

Traps we have already hit, so nobody hits them twice. Append-only: add an entry the moment
something costs you more than a few minutes, and do not delete an entry just because the code
moved on — note the date it stopped applying instead.

An agent fills these files through the `engineering-insights` skill. The format follows.

## Sections

Every `INSIGHTS.md` uses the same eight headings, in this order. A file carries only the ones it
has entries for: What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes ·
Decisions · Recurring Errors & Fixes · Open Questions · Session Notes.

## Format

Recurring Errors & Fixes and What Doesn't Work — one `###` heading per trap:

```markdown
### <symptom, as you actually saw it>
**Date:** YYYY-MM-DD
**Cause:** what was really wrong (not what it looked like).
**Fix / rule:** what to do instead, phrased so it applies next time.
**Evidence:** `path:line` it was verified against (+ the exact error string, if any).
```

Everywhere else — one line, dated, carrying its own evidence:

```markdown
- **YYYY-MM-DD** — <claim, with the symbol, command or error string that proves it> (`path:line`)
```

An entry is never reworded or deleted. Everything goes beneath it, dated: `**Superseded
YYYY-MM-DD:**`, `**Disputed YYYY-MM-DD:**`, `**See also:** <path>`, `**Evidence YYYY-MM-DD:**`,
and (root file only) ``**Skill:** `<name>` `` when the entry is about a skill under `.claude/skills/`.

---

## Codebase Patterns

- **2026-10-02** — Zod parsing happens in the route schema; services receive already-parsed input and never import `zod` (`server/src/modules/reviews/routes.ts:7`, `schema`).

## Tool & Library Notes

- **2026-10-05** — for quick local schema changes use `pnpm db:push`: it syncs the Drizzle schema straight to the dev database and skips generating a migration, which is much faster than `db:generate` + `db:migrate` while iterating (`server/package.json:8`, `db:push`).

## Recurring Errors & Fixes

### `relation "reviews" does not exist` right after pulling
**Date:** 2026-10-02
**Cause:** migrations do not run on boot; the new tables are in migration files the dev database has never applied.
**Fix / rule:** run `cd server && pnpm db:migrate` after pulling anything that touches `src/db/migrations`.
**Evidence:** `server/package.json:8` - `db:migrate` is a manual script; no boot hook runs it.

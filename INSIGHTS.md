# Insights — cross-package

Traps we have already hit, so nobody hits them twice. Append-only: add an entry the
moment something costs you more than a few minutes, and **do not** delete an entry
just because the code moved on — note the date it stopped applying instead.

Module-specific traps go in that module's own `INSIGHTS.md`. Only things that span
packages, or that belong to no single package, live here.

An agent fills these files through the `engineering-insights` skill
([`.claude/skills/engineering-insights/SKILL.md`](.claude/skills/engineering-insights/SKILL.md)),
which owns the routing and the quality bar. This file owns the **format**.

## Sections

Every `INSIGHTS.md` uses the same eight headings, in this order. A file carries only the
ones it has entries for.

| Section | What belongs there |
|---|---|
| What Works | an approach that held up, specific enough to repeat deliberately |
| What Doesn't Work | an approach that failed or was abandoned, and why |
| Codebase Patterns | a convention or architectural rule discovered by reading the code |
| Tool & Library Notes | a quirk of a dependency, the toolchain or the environment |
| Decisions | a choice, its reason, and the alternative that was rejected |
| Recurring Errors & Fixes | symptom → real cause → rule |
| Open Questions | left unresolved, with what was already ruled out |
| Session Notes | dated one-line summary of a session that produced entries |

## Format

**Recurring Errors & Fixes** and **What Doesn't Work** — one `###` heading per trap. The
three fields are separate because the symptom is what you will search for, the cause is what
you could not have guessed, and the rule is the only part that helps next time:

```markdown
### <symptom, as you actually saw it>
**Date:** YYYY-MM-DD
**Cause:** what was really wrong (not what it looked like).
**Fix / rule:** what to do instead, phrased so it applies next time.
```

Everywhere else — one line, dated, carrying its own evidence:

```markdown
- **YYYY-MM-DD** — <claim, with the path, symbol, command or error string that proves it>
```

An entry is never reworded or deleted. Everything goes *beneath* it, dated:

| Line | When |
|---|---|
| `**Superseded YYYY-MM-DD:** <what changed>` | it stopped being true |
| `**Disputed YYYY-MM-DD:** <the other entry, and why>` | a later finding contradicts it and neither could be proved |
| `**See also:** <path>` | the general rule lives at the root and the mechanics in a module file, or the reverse |

The file must never carry two entries that disagree without one of those lines. The next
session believes whichever it reads first.

Every entry must be actionable read cold, by someone who was not in the session. If it would
be obvious to anyone reading the code, it does not belong here.

---

## Decisions

- **2026-09-20** — session knowledge is recorded in the per-module `INSIGHTS.md` files, not in
  a separate `LEARNINGS.md`. `docs/engineering-insights-research.md` and every source it cites
  prescribe `LEARNINGS.md`, so the temptation to add one recurs; it was rejected because each
  module's `CLAUDE.md` gate already routes to `INSIGHTS.md`, and a second knowledge file per
  module means the agent must read both and guess which one owns a finding. The research doc's
  module paths (`apps/client`, `packages/reviewer-core`) are from a different layout — the real
  targets are `client/` `server/` `reviewer-core/` `e2e/` and the root.

## Recurring Errors & Fixes

### CI passes on an already-migrated database and fails on a fresh one
**Date:** 2026-08-05
**Cause:** a merge copied a whole generated directory over upstream's instead of merging
with it. The lane that reuses an existing database never replays the broken history, so
only the fresh-database lane fails.
**Fix / rule:** when a merge touches generated artefacts (migrations, journals,
snapshots, lockfiles), resolve them by regenerating or by appending — never by taking
one side wholesale. Check the fresh-install lane before trusting a green run.
**See also:** `server/INSIGHTS.md` — the Drizzle journal and snapshot mechanics behind this
rule, and how to relink the chain.

## Session Notes

- **2026-09-20** — added the `engineering-insights` skill and restructured all five
  `INSIGHTS.md` files onto the eight-rubric format; recorded the `LEARNINGS.md` decision above.

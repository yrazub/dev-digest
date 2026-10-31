# Insights — `@acme/web`

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

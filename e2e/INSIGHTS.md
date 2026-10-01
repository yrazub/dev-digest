# Insights — `@devdigest/e2e`

Traps we have already hit in the browser suite. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## Recurring Errors & Fixes

### Flows `02`, `04` and `05` fail locally but pass in CI
**Date:** starter
**Cause:** the flows follow the home redirect to the *first* repo, so they assume the
seeded demo repo is the only one. CI seeds an empty database; your dev DB usually has
other repos you imported, so the redirect lands somewhere else.
**Fix / rule:** run `npm run e2e:hermetic`, which boots its own freshly-seeded stack on
alternate ports and leaves your dev DB alone. Never "fix" this by resetting your dev
database — and never with `docker compose down -v`, which deletes the volume and every
repo and review in it.
**Evidence 2026-09-26:** first recorded 2026-09-19, in commit `7aca026` (its **Date** field says "starter").
`specs/04-pr-findings.flow.json:5-6` — the flow opens `/` and follows the redirect to `/pulls`,
which lands on the *first* repo; `../scripts/e2e.sh:3-5` — the hermetic stack on alternate ports.

### Flows `04` and `05` fail intermittently at "open the PR row", even on the hermetic stack
**Date:** 2026-09-30
**Cause:** not the multi-repo precondition above: it happened on a freshly seeded stack. Both
flows clicked the PR row right after `wait --url /pulls`, which passes as soon as the route
changes, before the PR list has fetched and rendered. `02` never flaked, because it waits for
the row's text first. `04` failed on one run and `05` on the other.
**Fix / rule:** in a flow, `wait --text` for the element before any `find … click` on it.
`wait --url` only proves navigation, not that the data has rendered.
**Evidence:** `specs/04-pr-findings.flow.json` and `specs/05-pr-diff.flow.json` now carry the
"seeded PR title row is visible" wait step, copied from `specs/02-repo-pulls-detail.flow.json:7`.
Hermetic runs before the fix: 7/8, then 6/8. After: 8/8.

## Session Notes

- **2026-09-30** — added `08-skills` (create skill → link to agent → persists) and fixed the `04`/`05` click race.

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

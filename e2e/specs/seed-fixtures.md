# Seed fixtures contract

Every flow in this suite runs against `pnpm db:seed`'s output
(`server/src/db/seed.ts`), never against arbitrary data. The flows
themselves don't restate what they assume the DB contains — most of that
assumption is implicit in a `wait --text` for a specific string. This
document makes those assumptions explicit, as a contract: if `seed.ts`
changes in a way that breaks any line below, the flow(s) named next to it
break too, even though nothing in the flow's own JSON changed.

## The demo repo must be the only repo

`01-app-boot` and `02-repo-pulls-detail` both start by loading `{BASE}/`
and waiting for the redirect to land on `/pulls`, then on the specific
demo repo's data. The redirect logic picks the *first* repo in the
workspace — there is no repo selector in this flow. That means:

- **Contract:** the seeded workspace must contain exactly one repo,
  `acme/payments-api`, or these flows land on whichever repo happens to
  sort first and fail their `wait --text` assertions.
- **Why it's a real risk, not a hypothetical:** a normal local dev DB
  (`pnpm db:seed` run once, then repos imported through the UI over time)
  almost always has more than one repo. Running `npm test` directly against
  a dev stack is exactly the failure mode the README's precondition
  callout warns about. The hermetic runner (`scripts/e2e.sh`) sidesteps it
  by using an ephemeral Postgres with no persistent volume, so the seed is
  always the only data present.

## PR #482 must exist with a completed run

`02-repo-pulls-detail`, `04-pr-findings`, and `05-pr-diff` all navigate to
`/pulls/482` and assert on content that only exists if that PR has a
**completed** review run attached, not just an imported PR:

- The PR row text `Add rate limiting to public API endpoints` must be
  present in the PR list (`02`, `04`).
- The Agent runs tab must show a run with verdict `request changes` and
  exactly `2 findings` in its accordion header, with the newest run's
  accordion open by default and a `FindingCard` titled `Hardcoded Stripe
  secret key in commit` visible without an extra click (`04`). The finding
  count in the assertion (`2 findings`) is a literal count — if `seed.ts`'s
  sample review's finding list changes size, this flow's assertion must be
  updated in the same change, not left to drift.
- The Files changed tab must render at least one seeded file's diff
  content (`05`).

## The five built-in agents must be seeded, "Security Reviewer" and "Test Quality Reviewer" named exactly

`03-agents` waits for the literal text `Security Reviewer` on `/agents`, and
`08-skills` opens the agent named `Test Quality Reviewer`.
`seed.ts` seeds five built-in agent presets (General, Security, Performance, and
L02's Test Quality and API Contract Reviewers)
by `name`, upserting only when no agent of that name already exists for the
workspace — so renaming the security preset in `seed.ts` breaks this flow's
assertion silently (the flow itself gives no hint that the name is what it
depends on; only this document does).

## Exactly six skills are seeded, two of them linked to Test Quality Reviewer

`seed.ts` seeds the six L02 skills from `docs/skills/` — `branch-coverage` and
`edge-cases` linked to Test Quality Reviewer, the four API-contract skills linked to
API Contract Reviewer. `08-skills` waits for `breaking-change` on the Skills page,
then, after creating `e2e-rule`, expects `2 of 7 enabled` on Test Quality Reviewer's
Skills tab and `3 of 7 enabled` once it links the new skill. Seeding another skill,
or linking another one to that agent, breaks those counts.

## The demo repo has exactly three pending convention candidates

`09-conventions` opens Conventions on `acme/payments-api` and waits for
`0 of 3 accepted`, then rejects the first card and accepts the other two.
`seed.ts` inserts three `pending` candidates for that repo, only while it has
none, ordered by confidence (0.91, 0.78, 0.55), with no `repo_index_state`
row, so their evidence has no GitHub link. Changing the count breaks the
`N of M accepted` assertions. The flow also expects no skill named
`repo-conventions` to exist beforehand, because it creates one (`08-skills`
creates only `e2e-rule`).

## None of this data is real GitHub data

All of it — the repo, the PR, its diff, its review, its findings, the
agents — is fixture data inserted directly by `seed.ts`, not fetched live
from GitHub at seed time. That's what makes every flow safe to run without
network access or a GitHub token, and why "freshly seeded" is a precise,
reproducible precondition rather than "whatever GitHub returns today."

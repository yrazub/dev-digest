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
  content (`05`, `11`).

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

## PR #482 has a seeded intent

`10-pr-intent` opens PR #482 and waits for the Intent card to render **from the
seeded `pr_intent` row, with no model call** — the flow never presses `Derive intent`
or `Re-run intent detection`. `seed.ts` inserts that row in its own
`onConflictDoNothing()` statement outside the `if (!pr)` block, so an
already-seeded dev database gets it on the next `pnpm db:seed` too. The literal
strings a flow may assert on:

- In scope: `Return 429 with Retry-After header` (the other two items are
  `Token-bucket rate limiter middleware` and `Apply the limiter to the public webhook routes`).
- Risk area: `Auth surface touched` (kind `security`).
- Confidence: `medium`, rendered as `Medium confidence`.
- Sources: `title`, `description`, `changed_files`, all `used`; `missing_context` false.
- The summary equals the seeded PR description. A flow does not assert on it,
  because the description on the page contains the same sentence.

**Contract:** changing any of these strings in `seed.ts` changes what flow `10`
waits for, so the flow's `wait --text` lines are updated in the same change. The
row's `source_hash` is null, so `GET /pulls/:id/intent` reports `stale: false`
and a review run recomputes it.

## PR #482 has nine files, one or more per role, and two patches

The Files changed tab groups a PR's files by role (L03 Smart Diff), and flows `05` and
`11` read the seeded files. The seeded PR holds nine `pr_files` rows, summing to the
`+247 −38` the PR header shows:

| Path | Lines | Role |
|---|---|---|
| `src/middleware/ratelimit.ts` | +84 −0 | core |
| `src/api/public/webhooks.ts` | +31 −6 | core |
| `src/config.ts` | +4 −0 | core |
| `src/api/users.ts` | +7 −2 | core |
| `src/middleware/ratelimit.test.ts` | +40 −0 | tests |
| `src/api/public/index.ts` | +3 −0 | wiring |
| `tsconfig.json` | +2 −1 | wiring |
| `README.md` | +14 −2 | docs |
| `package-lock.json` | +62 −27 | boilerplate |

- **Contract:** `src/config.ts` stays in a group that starts expanded (`core`). Flows `05`
  and `11` wait for its name and its diff, so it must not move to a collapsed group
  (`boilerplate`).
- **Contract:** `package-lock.json` is the only boilerplate file and `README.md` the only
  docs file; flow `11` asserts on exactly one file in each of those groups. Another
  seeded file in either role breaks it.
- **Patches:** only `src/config.ts` (`@@ -9,3 +9,7 @@`) and `src/api/users.ts`
  (`@@ -41,8 +41,13 @@`) carry a patch; the other seven are null. The finding
  `Hardcoded Stripe secret key in commit` is anchored at `src/config.ts` line 12, a `+`
  line inside the seeded patch, and the `N+1 query` finding at `src/api/users.ts` lines
  45-52. The key on line 12 is a visible placeholder (`sk_live_EXAMPLE_NOT_A_REAL_KEY`)
  so no secret scanner reads it as a real one. Moving a patch line changes which line
  the finding card renders under.
- **How it reaches a database:** the block that inserts the five files and fills the two
  null patches runs outside `if (!pr)`, like the intent row, so an already-seeded dev
  database gets it on the next `pnpm db:seed`. It checks the existing paths first
  (`pr_files` has no unique index), never deletes a row and never overwrites a patch that
  is not null. A second run changes nothing.

## None of this data is real GitHub data

All of it — the repo, the PR, its diff, its review, its findings, the
agents — is fixture data inserted directly by `seed.ts`, not fetched live
from GitHub at seed time. That's what makes every flow safe to run without
network access or a GitHub token, and why "freshly seeded" is a precise,
reproducible precondition rather than "whatever GitHub returns today."

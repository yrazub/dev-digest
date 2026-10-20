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
none, ordered by confidence (0.91, 0.78, 0.55). The repo has a seeded
`repo_index_state` row (see "PR #482 has a seeded repo-intel index"), so the candidates'
evidence links to the seeded SHA `b1a57b1a57b1a57b1a57b1a57b1a57b1a57b1a57` and the
Conventions index line shows it; the flow asserts nothing about either. Changing the count breaks the
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
- Risk area: `Auth surface touched` (kind `security`). Since L05 the Overview tab hides the
  Intent card's risk-tag row (the PR Brief's Risk areas row takes its place), so flow `10`
  asserts the tag is **absent** on Overview and present on the Agent runs tab.
- Confidence: `medium`, rendered as `Medium confidence`.
- Sources: `title`, `description`, `changed_files`, all `used`; `missing_context` false.
- The summary equals the seeded PR description. A flow does not assert on it,
  because the description on the page contains the same sentence.

**Contract:** changing any of these strings in `seed.ts` changes what flow `10`
waits for (or waits to be absent), so the flow's `wait --text` lines are updated in the same change. The
row's `source_hash` is null, so `GET /pulls/:id/intent` reports `stale: false`
and a review run recomputes it.

## PR #482 has a seeded brief

Flow `14-pr-brief` opens PR #482 and waits for the PR Brief on the Overview tab to render the
`pr_brief` row that `GET /pulls/:id/brief` answers, with no model call. `seed.ts` inserts the
row in its own `onConflictDoNothing()` statement outside the `if (!pr)` block (`pr_brief.pr_id`
is the primary key), so an already-seeded dev database gets it on the next `pnpm db:seed` too
and a stored generation is never overwritten. `stale` is computed on read. The exact seeded
strings:

- Summary: `Adds a token-bucket rate limiter to the public API to stop abuse from unauthenticated clients. It also commits a live Stripe key in plaintext and adds an N+1 query to the user list.`
- Risks (kind, title, severity, `file_refs`, explanation):
  1. `security`, `Hardcoded Stripe secret key`, high, `src/config.ts:12`: `A live Stripe secret key is committed in plaintext in the config file, so anyone with repository access can use it.`
  2. `perf`, `Redis round-trip on every public request`, low, `src/middleware/ratelimit.ts`: `The limiter reads and writes its bucket in Redis on each public request, which adds a network hop to the hot path.`
  3. `breaking_api`, `Limiter now wraps the server bootstrap`, medium, `src/server.ts:88`: `The server entry point now installs the limiter before the routes, so every public caller can start receiving 429 responses.`
  4. `deps`, `Lockfile changes`, low, `package-lock.json`: `The lockfile changes with the new dependency, so the resolved versions of other packages may have moved too.`
- Review focus (file, line, reason):
  1. `src/config.ts`, 12, `live Stripe key committed in plaintext`
  2. `src/api/users.ts`, 46, `N+1 query: one lookup per user, hit harder under the new limiter`
  3. `src/middleware/ratelimit.ts`, 12, `the limiter's entry point: check that the 429 branch sends Retry-After`
- Inputs: `intent`, `blast_radius`, `diff_stats` and `description` are `used`; `linked_issue` is
  `missing` (`none_linked`) and `spec_documents` is `missing` (`none_attached`). `input_budget_tokens`
  is 8000, `input_tokens` null.
- Other fields: `blast` is null (the live Blast radius block draws the map), `history` is
  `{ "history": [] }`, `dropped` is 0 risks and 0 review-focus items, `head_sha` is `a1b2c3d4e5f6`,
  `generated_at` is `2026-10-18T00:00:00.000Z`, provider and model are `seed`, the token counts and
  cost are null.

**Contract:** flow `14` asserts on the section label (`pr brief`, lowercased page text), the
summary's opening words `Adds a token-bucket rate limiter to the public API`, the risk title
`Hardcoded Stripe secret key`, the file reference `src/server.ts:88`, the Review focus label, the
absence of a `Generate brief` button, and the Review focus row `src/config.ts:12` (aria-label
`Open src/config.ts:12 in Files changed`). That row must open Files changed at `src/config.ts`
(`?tab=diff&line=12`), and the `data-jump-target="line"` row must hold the seeded
`STRIPE_SECRET` line, so the `src/config.ts` patch must keep that line at new-side line 12
(see "PR #482 has nine files"). Changing any of these strings, the first focus item, or the
`src/config.ts` patch changes what flow `14` waits for, so the flow is updated in the same
change. The flow never presses Generate or Regenerate.

## PR #482 has a seeded repo-intel index

Flow `12-pr-blast-radius` opens PR #482 and waits for the Blast radius block to render the
map that `GET /pulls/:id/blast` builds from the persistent index, with no clone on disk and
no model call. `seed.ts` inserts the index rows of the demo repo in a block outside
`if (!pr)`, so an already-seeded dev database gets them on the next `pnpm db:seed` too. The
block never deletes a row and never overwrites one: `repo_index_state`, `symbols`,
`file_rank` and `file_facts` use `onConflictDoNothing()`; `references` has no unique index,
so a row is inserted only when none with the same `from_path` + `to_symbol` + `line`
exists.

| Table | Rows |
|---|---|
| `repo_index_state` | one row: `status` `full`, `indexer_version` = `INDEXER_VERSION` (2), `last_indexed_sha` `b1a57b1a57b1a57b1a57b1a57b1a57b1a57b1a57` |
| `symbols` (all kind `function`) | `rateLimit` (line 12) and `bucketKey` (38) in `src/middleware/ratelimit.ts`; `publicRouter` (8) in `src/api/public/index.ts`; `webhookHandler` (30) in `src/api/public/webhooks.ts`; `healthCheck` (6) in `src/api/public/health.ts`; `app` (10) in `src/server.ts`; `resetBuckets` (3) in `src/jobs/reset-buckets.ts` |
| `references` (`decl_file` `src/middleware/ratelimit.ts`) | `rateLimit` from `src/api/public/index.ts:23`, `src/api/public/webhooks.ts:45`, `src/api/public/health.ts:11`, `src/server.ts:88`; `bucketKey` from `src/jobs/reset-buckets.ts:8` |
| `file_rank` (`hotness` 0, `pagerank` = `rank`) | `index.ts` 0.09 (percentile 99), `webhooks.ts` 0.08 (95), `health.ts` 0.07 (90), `server.ts` 0.06 (85), `reset-buckets.ts` 0.05 (80) |
| `file_facts` | `GET /api/public/items` on `index.ts`; `POST /api/public/webhooks` on `webhooks.ts`; `GET /api/public/health` on `health.ts`; the cron `reset-rate-buckets (hourly)` on `reset-buckets.ts` |

`src/middleware/ratelimit.ts:41` is not seeded as a caller of `bucketKey`: it is the declaring
file (B5).

**The resulting answer** of `GET /pulls/:id/blast` for PR #482 (`degraded: false`,
`reason: null`, `indexed_sha` `b1a57b1a57b1a57b1a57b1a57b1a57b1a57b1a57`):

- `totals`: 4 symbols, 5 callers, 3 endpoints, 1 cron. `summary`:
  `4 changed symbols, 5 callers, 3 endpoints, 1 cron job.` The 4 changed symbols are the
  seeded symbols declared in PR files: `rateLimit` and `bucketKey` (`ratelimit.ts`),
  `publicRouter` (`index.ts`) and `webhookHandler` (`webhooks.ts`); `healthCheck`, `app` and
  `resetBuckets` live in files the PR does not change.
- 2 groups, in the order `rateLimit` (top rank 0.09), then `bucketKey` (0.05). The callers
  of `rateLimit`, by rank: `publicRouter` at `src/api/public/index.ts:23`, `webhookHandler`
  at `src/api/public/webhooks.ts:45`, `healthCheck` at `src/api/public/health.ts:11`, `app`
  at `src/server.ts:88`. The caller of `bucketKey`: `resetBuckets` at
  `src/jobs/reset-buckets.ts:8`.
- `rateLimit` affects the endpoints `GET /api/public/health`, `GET /api/public/items` and
  `POST /api/public/webhooks`, and no cron; `bucketKey` affects the cron
  `reset-rate-buckets (hourly)` and no endpoint.
- `src/api/public/index.ts` and `webhooks.ts` are files of PR #482 themselves. A changed
  file may call a symbol declared in another changed file.

**Contract:** flow `12` asserts on the four stats, `rateLimit`, `src/api/public/index.ts:23`
and its GitHub link at the seeded SHA, `GET /api/public/items`, `reset-rate-buckets (hourly)`
and `2 more changed symbols have no callers.` Changing a seeded path, line, SHA, rank order,
endpoint or cron changes what the flow waits for, so the flow is updated in the same change.
Adding a symbol to `ratelimit.ts`, `index.ts` or `webhooks.ts`, or a PR file that declares
one, changes the symbol count. The block runs outside `if (!pr)`; a second run adds no row.

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

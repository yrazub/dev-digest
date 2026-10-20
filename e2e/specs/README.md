# `e2e/specs/` — the flows

Each `NN-name.flow.json` is one browser journey: a JSON list of agent-browser commands
run in order against a shared session. This folder **is** the specification — the flows
are the executable acceptance criteria, so there is no separate prose spec here.

| Flow | Journey |
|---|---|
| `01-app-boot.flow.json` | app boots and lands on the seeded repo's PR list |
| `02-repo-pulls-detail.flow.json` | repo → PR list → PR detail |
| `03-agents.flow.json` | agents list and editor |
| `04-pr-findings.flow.json` | findings on a reviewed PR |
| `05-pr-diff.flow.json` | the diff view |
| `06-onboarding.flow.json` | add a repository |
| `07-settings.flow.json` | settings sections |
| `08-skills.flow.json` | create a skill, link it to an agent, the link persists |
| `09-conventions.flow.json` | reject one and accept two seeded convention candidates, then create the `repo-conventions` skill |
| `10-pr-intent.flow.json` | the seeded Intent card on the Overview and Agent runs tabs, with no model call |
| `11-pr-smart-diff.flow.json` | the Files changed tab grouped by role on the seeded nine files: five group hints, the seeded finding under `src/config.ts`, the Boilerplate group opening onto `package-lock.json`, and the round trip through `?order=original` (read-only, no model call) |
| `12-pr-blast-radius.flow.json` | the Blast radius block on the Overview tab from the seeded repo-intel index: four stats, `rateLimit` with its caller `src/api/public/index.ts:23` as a GitHub link at the seeded SHA, an endpoint chip, a cron chip and the "2 more changed symbols have no callers." line, then the Graph view through `?blast=graph` (the SVG named "Blast radius graph"), kept by a reload, and back to the Tree (read-only, no model call) |
| `13-project-context.flow.json` | Project Context from the sidebar on the seeded repo that has no clone: the page shows "Repository not cloned yet"; then the seeded Security Reviewer's Context tab through `?tab=context`, with the same state, kept by a reload (read-only, no model call) |
| `14-pr-brief.flow.json` | the seeded PR Brief on the Overview tab: the section label, the summary's opening words, the risk `Hardcoded Stripe secret key` with `src/server.ts:88`, the Review focus label and no `Generate brief` button; then the Review focus row `Open src/config.ts:12 in Files changed` lands on `?tab=diff&line=12` with `src/config.ts` open and the `data-jump-target` line holding the `STRIPE_SECRET` line (read-only, no model call) |

Read [`../README.md`](../README.md) before adding one — locator rules and the
seeded-data precondition are not optional.

The flows are the acceptance criteria, but what each one silently assumes
about `seed.ts`'s output is documented separately in
[`seed-fixtures.md`](seed-fixtures.md).

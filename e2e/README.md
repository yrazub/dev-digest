# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

## How a flow works

A spec lives in `specs/NN-name.flow.json`:

```jsonc
{
  "name": "App boots and lands on the seeded repo's PR list",
  "steps": [
    { "cmd": ["open", "{BASE}/"],            "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"],    "label": "root redirects to PRs" },
    { "cmd": ["wait", "--text", "#482"],     "label": "seeded PR row visible" }
  ]
}
```

- `{BASE}` is replaced with `E2E_BASE_URL` (default `http://localhost:3000`).
- Each `cmd` is passed verbatim to `agent-browser`. A non-zero exit fails the
  step and the flow — so `wait --text` / `wait --url` **are** the assertions
  (they time out and exit non-zero if the condition never holds).
- Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check on the
  command's stdout.
- `wait` polls until its condition holds; `find` looks once. The runner therefore
  retries a `find` step for up to `E2E_FIND_WAIT` while its failure is "no element
  matched" (see `docs/runner-internals.md`). A `find` that matches several elements
  takes the first without an error, so pick a name only one element has.
- Text on screen after a click can be an optimistic update. Before a `reload` that
  checks the change was saved, add `wait --load networkidle`.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  We never use the AI `chat` command, so runs are stable and key-free.

Flows target **read-only seeded data** (the demo repo `acme/payments-api`, PR
#482, the seeded agents), so nothing triggers a model call.

> **Precondition: a freshly-seeded DB.** Flow `02` follows the home redirect to
> the *first* repo, so it assumes the seeded demo repo is the only one. CI
> guarantees this — `e2e-web.yml` brings up an empty Postgres and seeds it.
> Your local dev DB usually has other imported repos, so running `npm test`
> straight against it makes flows 02/04/05 land on the wrong repo and fail.
> **Use the hermetic runner below** — it spins up its own isolated, freshly-seeded
> stack and leaves your dev DB untouched.
>
> ⚠️ **Never `docker compose down -v` to "reset" your dev DB** — `-v` deletes the
> `devdigest_pgdata` volume along with every real repo and review you've imported.

## Run locally

```sh
# 1. install the agent-browser CLI once (downloads Chrome for Testing)
npm i -g agent-browser && agent-browser install
```

### Hermetic (recommended)

```sh
# Boots an isolated, freshly-seeded stack on alternate ports
# (Postgres :5433, API :3101, web :3100), runs the flows, then tears it all
# down. Safe to run while your normal dev stack is up — it never touches your
# dev DB or the devdigest_pgdata volume.
./scripts/e2e.sh
# or: cd e2e && npm install && npm run e2e:hermetic
```

The isolated Postgres is ephemeral (no persistent volume), so it's empty every
run and the seeded demo repo `acme/payments-api` is the only one — which is
exactly what flows 02/04/05 need.

### Against your own running stack

Only safe if your dev DB contains *only* the seeded repo (see precondition
above). Otherwise prefer the hermetic runner.

```sh
./scripts/dev.sh          # Postgres + API :3001 + web :3000 (seeded)
cd e2e && npm install && npm test
```

Env knobs:

- Runner: `E2E_BASE_URL`, `AGENT_BROWSER_BIN` (default `agent-browser`),
  `E2E_STEP_TIMEOUT` (ms, default 60000), `E2E_FIND_WAIT` (ms, default 10000).
- Hermetic stack (`scripts/e2e.sh`): `E2E_PG_PORT` (5433), `E2E_API_PORT` (3101),
  `E2E_WEB_PORT` (3100), `E2E_PG_CONTAINER` (`devdigest-e2e-postgres`),
  `E2E_PG_IMAGE` (`pgvector/pgvector:pg16`), `E2E_API_RATE_LIMIT_MAX` (10000). The last one becomes the
  API's `API_RATE_LIMIT_MAX` for this stack only: the flows send close to the API's default limit of 120
  requests per minute from one address, and a `429` shows up as a `wait --text` timeout on a page that
  never rendered. The `e2e-web.yml` job sets the same value.

On a failed step the runner prints what `agent-browser` reported and writes
`<flow>-fail.png` and `<flow>-fail.txt` (the page URL and its accessibility snapshot)
to `e2e/test-results/` (git-ignored; uploaded as a CI artifact by
`.github/workflows/e2e-web.yml`).

## Coverage (typological, not exhaustive)

| Spec | Flow |
|------|------|
| `01-app-boot` | root → redirect to first repo's PR list → seeded PR #482 |
| `02-repo-pulls-detail` | PR list → open PR #482 → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-pr-findings` | PR #482 → Agent runs tab → seeded run verdict + findings; expand → FindingCard |
| `05-pr-diff` | PR #482 → Files changed tab → seeded file renders in the diff viewer |
| `06-onboarding` | `/onboarding` → add-repository form renders (no submit) |
| `07-settings` | `/settings/api-keys` + `/settings/models` → section titles render |
| `08-skills` | `/skills` → create a skill → link it on the Test Quality Reviewer's Skills tab → reload |
| `09-conventions` | sidebar → Conventions → reject one, accept two → reload → Create skill → `/skills` lists `repo-conventions` |
| `10-pr-intent` | PR #482 → the Intent card renders from the seeded `pr_intent` row on Overview (without its risk-area tag, which the PR Brief replaces) and again on Agent runs (with the tag; no model call) |
| `11-pr-smart-diff` | PR #482 → Files changed tab grouped by role: the five group hints, the seeded finding and its `blocker` tag under `src/config.ts`, the Boilerplate group opening onto `package-lock.json`, then Original order (`?order=original`, shows `README.md`) and back to Smart order (no model call, nothing pressed that changes data). The section label is uppercased by CSS, so that one step uses `wait --fn` on the lowercased page text |
| `12-pr-blast-radius` | PR #482 → Overview tab → the Blast radius block from the seeded repo-intel index: the four stats, `rateLimit` and its caller `src/api/public/index.ts:23` as a new-tab GitHub link at the seeded SHA, an endpoint chip, a cron chip and the "2 more changed symbols have no callers." line, then the Graph view through `?blast=graph` (the SVG named "Blast radius graph"), kept by a reload, and back to the Tree (the only click after the PR row is the Tree / Graph switch; no model call). The label and the stats use `wait --fn` on the page text (lowercased / whitespace collapsed) |
| `13-project-context` | sidebar → Project Context on the seeded repo, which has no clone: the page shows "Repository not cloned yet"; then the seeded Security Reviewer's Context tab through `?tab=context`, with the same state, kept by a reload (read-only, no model call) |
| `14-pr-brief` | PR #482 → Overview → the PR Brief section from the seeded `pr_brief` row: the summary's opening words, the risk `Hardcoded Stripe secret key` and `src/server.ts:88`, the Review focus label and no **Generate brief** button; then the Review focus row `Open src/config.ts:12 in Files changed` lands on `?tab=diff` with `line=12`, `src/config.ts` open, and the line marked `data-jump-target="line"` holding `STRIPE_SECRET` (read-only, no model call). The two labels use `wait --fn` on the lowercased page text |

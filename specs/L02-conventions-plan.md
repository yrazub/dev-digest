# L02 — Conventions Extractor: implementation plan

**Status:** done 2026-10-01

How [`L02-conventions.md`](L02-conventions.md) gets built. The *what* is in that spec and its
module specs ([server](../server/specs/L02-conventions.md),
[client](../client/specs/L02-conventions.md)). This file is the *order*: phases, the files
each one touches, and how each one is verified. It builds on the Skills feature
([`L02-skills-plan.md`](L02-skills-plan.md), done), because the extractor's output is an
ordinary skill.

All work goes on `feature/l02-conventions-extractor`, branched from `main` after the Skills PR (#6) merged. Each phase ends green (`typecheck`, `test`, and
`arch:check` on the server) and is committed on its own. Nothing is pushed before
`/pr-self-review` passes.

## What already exists

| Piece | Where | State |
|---|---|---|
| `conventions` table (`rule`, `evidence_path`, `evidence_snippet`, `confidence`, `accepted`) | `server/src/db/schema/knowledge.ts` | present, empty, no module uses it |
| `ConventionCandidate` contract | `contracts/knowledge.ts` | present, the old shape (`accepted: boolean`) |
| `repoIntel.getConventionSamples(repoId, n)` | `server/src/modules/repo-intel/service.ts` | works, no caller. Returns `[]` when repo-intel is disabled or the repo is not indexed |
| `conventions` in `FEATURE_MODELS` (default `openai` / `gpt-5.4`), `resolveFeatureModel` | `contracts/platform.ts`, `server/src/modules/settings/feature-models.ts` | works, no caller |
| Settings → Models → **Conventions** row with a model dropdown (#53) | `client/.../SettingsModels/SettingsModels.tsx` | already rendered from `FEATURE_MODELS` |
| `LLMProvider.completeStructured` + `MockLLMProvider` | `vendor/shared/adapters.ts`, `adapters/mocks.ts` | used by reviews; reused here |
| `activeKeyFor` → `"conventions"` for `/conventions` paths | `client/src/components/app-shell/helpers.ts` | present; the `APP_NAV` item is not |
| Skills module, `SkillBodyEditor`, agent Skills tab | L02 Skills | done |

## Decisions

| Decision | Status |
|---|---|
| Linking the new skill to an agent is done **manually** on the agent's Skills tab (the lab's mechanism). No linking code is added; the modal has no agent picker; a toast offers "Add to an agent →" | user, 2026-10-01 |
| The scan is a **synchronous** request (one LLM call, 120 s timeout, spinner in the UI). A background job may replace it later | user, 2026-10-01 |
| The model is whatever Settings → Models → Conventions says. The registry default is `openai/gpt-5.4`, so pick an OpenRouter model there if no OpenAI key is set. No hard-coded model in the module (#53) | from the spec |
| One migration (`pnpm db:generate`): add `category`, `evidence_line_start`, `evidence_line_end`, `status`, `created_at`; drop `accepted`; index `(repo_id, status)` | from the spec |
| Scan metadata (last scan, sampled count) is stored in `settings` under `conventions_scan:<repoId>`, so no second table is added | from the spec |

## Phases

Phases 4 and 5 landed in one commit: the page's Create skill button opens the modal, so
neither builds alone.

### 1 · Contracts — `@devdigest/shared`

Edit `server/src/vendor/shared/contracts/knowledge.ts`, and make the same edits in
`client/src/vendor/shared/contracts/knowledge.ts` (the two copies have drifted, so edit both
instead of copying the file).

- New `ConventionCategory`, `ConventionStatus`.
- `ConventionCandidate`: add `category`, `evidence_line_start`, `evidence_line_end`,
  `evidence_url`, `status`; remove `accepted`.
- New `ConventionScanInfo`, `ConventionExtractResult`, `ConventionUpdate`,
  `ConventionSkillDraft`, `ConventionSkillCreate`.

**Verify:** both packages typecheck; `test/contracts.test.ts` gains cases for the new schemas.
**Size:** 3 files.

### 2 · Server — schema, pipeline and candidate routes

New `server/src/modules/conventions/`, layered like `skills`:

| File | Holds |
|---|---|
| `routes.ts` | `POST /repos/:id/conventions/extract` (tight rate limit, 120 s), `GET /repos/:id/conventions`, `PATCH /conventions/:id` |
| `service.ts` | the four steps, with narrow deps (`repo`, `repoIntel`, `llm`, `readFile`); `409` when the repo is not indexed or nothing was sampled |
| `repository.ts` | Drizzle for `conventions` and the scan-info settings row; `replacePending` in one transaction; returns contracts |
| `ports.ts` | the dependency interfaces the service needs |
| `domain.ts` | pure: `normalizeRule`, row → `ConventionCandidate`, `evidenceUrl(owner, name, sha, path, start, end)` |
| `sample.ts` | pure + fs: the config globs (root and one level down), size caps (400 lines / 12 KB) |
| `prompt.ts` + `llm-schema.ts` | the classification prompt (files fenced with `wrapUntrusted`, 5–25 candidates, verbatim snippet, no rules that only restate a linter setting) and the module-internal output schema |
| `verify.ts` | pure: path in the sample, snippet within ±5 lines then anywhere, multi-line match, real range, dedup |

Also `conventions` added to `src/modules/index.ts`, and the schema change via
`pnpm db:generate` + `pnpm db:migrate`.

**Tests:** `test/conventions-verify.test.ts` (hermetic) and
`test/conventions-extract.it.test.ts` (stubbed LLM + a fixture clone: sampling happens with no
LLM call, model taken from the Settings override, results persist, ReScan keeps accepted and
rejected, a rejected rule is not proposed again).
**Verify:** `pnpm test`, `pnpm typecheck`, `pnpm arch:check` with no new baseline entries.
`curl` extract → list → reject → re-extract against the dev DB on an indexed repo.
**Size:** about 10 files, plus a migration.

### 3 · Server — draft and create the skill

- `draft.ts` (pure): the merged body from the spec, with rules grouped by category in enum
  order and then by confidence. Default name `repo-conventions`, or `<name>-conventions` if
  taken.
- `POST /repos/:id/conventions/skill-draft` → `ConventionSkillDraft` (`422` if any id is not
  `accepted`).
- `POST /repos/:id/conventions/skill` → `201 Skill`: the skill (`source: 'extracted'`,
  `type: 'convention'`, `evidence_files`) and v1 in one transaction. The conventions
  repository writes both rows itself, because a module may not import another module
  (`dep-no-cross-module`), the same way `reviews` reads skills. `409` for a taken name.

**Tests:** `test/conventions-draft.test.ts`, `test/conventions-skill.it.test.ts`.
**Verify:** server green; the created skill appears in `GET /skills` and can be linked with
`POST /agents/:id/skills`.
**Size:** about 5 files.

### 4 · Client — data layer, menu and the Conventions page

- `src/lib/hooks/conventions.ts`: `useConventions`, `useExtractConventions`,
  `useUpdateConvention` (optimistic), `useConventionSkillDraft`, `useCreateConventionSkill`
  (also invalidates `['skills']`).
- `APP_NAV`: **Conventions** under SKILLS LAB, `href: "/repos/:repoId/conventions"` (#44),
  and its `shell.nav` label.
- `src/app/repos/[repoId]/conventions/page.tsx` (thin) and `_components/`:
  `ConventionsView` (empty state with **Run Scan**, header with **ReScan**, "K of N accepted",
  Deselect all, stats line, "Show rejected (N)") and `ConventionCard` (category chip, rule,
  evidence link `path:start-end ↗` to GitHub, snippet, confidence %, Accept / Reject / Edit,
  inline edit) (#45–#50).
- `messages/en/conventions.json`.

**Tests:** `ConventionCard`, `ConventionsView` per the client spec.
**Verify:** client green. In the browser, against the *Conventions (N7)* and
*Conventions · empty* artboards: scan, accept, reject, edit, reload, ReScan.
**Size:** about 10 files.

### 5 · Client — Create skill modal

`CreateConventionSkillModal`: it fetches the draft, then shows Name, Description, Type,
Enabled, and `SkillBodyEditor` with the merged body, plus the "Merged from K accepted
conventions…" intro (#41 #51). A `409` shows inline on Name. On success, a toast with
**Open** and **Add to an agent** (#52).

**Tests:** `CreateConventionSkillModal` (draft prefill; the payload carries the edited body,
name and enabled flag).
**Verify:** client green. In the browser: accept 3, reject 1, edit 1 → Create skill → the
skill is on `/skills` with the edited body and without the rejected rule → check it on an
agent's Skills tab.
**Size:** about 4 files.

### 6 · End-to-end and wrap-up

- `e2e/specs/09-conventions.flow.json`. Flows may not call a model, so the e2e seed gains a
  few fixture candidates. The flow does: open Conventions → accept two, reject one → reload
  (the rejected one stays hidden) → Create skill → the skill is on `/skills`.
- `server/README.md` (API map), `client/README.md` (route map), and the spec statuses set to
  `implemented`.
- The `engineering-insights` sweep; `/pr-self-review`.
- The quality-report numbers for the PR description (sampled / proposed / verified /
  dropped / accepted) come from the stats line of a scan. **You run that scan yourself**; I
  draft the report text from the numbers.

## Risks

| Risk | Mitigation |
|---|---|
| The model invents snippets or line numbers | `verify.ts` drops anything that is not found in the file and corrects the range; the drop count is shown |
| The default model is OpenAI but only an OpenRouter key is set | the scan returns a clear error naming Settings → Models → Conventions |
| A slow model times out the synchronous request (seen with OpenRouter in the Skills work) | 120 s route timeout; the client shows a spinner and the error toast; no partial writes, since persistence happens after verification |
| The repo is not indexed, so the sample is empty | `409` with "Index this repo first", and the empty state shows that message instead of Run Scan |
| A big sample blows the prompt | per-file caps (400 lines / 12 KB) and at most 12 code files plus configs |

## Not in this plan

The remaining homework items that are not code: the demo video, the PR description, and
re-running the API Contract Reviewer experiment (#18, which did not reproduce: the agent
caught the breaking change without skills too). Also the optional extras: packaging a skill
as a Claude Code plugin, running the extractor on another repo, and improving repo-intel's
sampling. "Many skills from the findings" is covered by creating several skills from
different accepted subsets; there is no auto-split by category.

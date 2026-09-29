# L02 — Skills: implementation plan

**Status:** approved 2026-09-28 · phases 1–6 done, 7–8 next

How [`L02-skills.md`](L02-skills.md) gets built. The *what* is in that spec and its module
specs ([server](../server/specs/L02-skills.md), [client](../client/specs/L02-skills.md)).
This file is the *order*: phases, the files each one touches, and how each one is verified.
The Conventions Extractor ([`L02-conventions.md`](L02-conventions.md)) gets its own plan
once this one lands, because it creates skills and needs the skills module to exist first.

All work goes on `feature/l02-skills-lab`. Each phase ends green (`typecheck`, `test`, and
`arch:check` on the server) and is committed on its own, so a phase can be reviewed or
reverted alone. Nothing is pushed before `/pr-self-review` passes.

## Decisions already taken

| Decision | Where it was settled |
|---|---|
| Sidebar menu is app-owned (`APP_NAV`), with no vendor edit for new items | commit `b7db260` |
| Import upload is **multipart**, via `@fastify/multipart` (new server dependency) | user, 2026-09-28. The server spec is updated in phase 2 |
| `.zip` parsing with `fflate` (new server dependency); version diff with `diff` and drag-and-drop with `@dnd-kit/sortable` (new client dependencies) | specs |
| One migration: `skill_versions.note` (nullable text), generated with `pnpm db:generate` | spec |
| Test Quality Reviewer is **seeded**; API Contract Reviewer is **created in the UI** | user, 2026-09-27 |
| Experiments use throwaway PRs against `yrazub/dev-digest` | user, 2026-09-27 |

## Phases

### 1 · Contracts — `@devdigest/shared`

Edit `server/src/vendor/shared/contracts/knowledge.ts` and `trace.ts`, then copy both files
to `client/src/vendor/shared/contracts/` unchanged.

- `SkillSource` + `imported_file` · `Skill` + `agent_count`, `created_at`
- new `SkillCreate`, `SkillUpdate` (+ `version_note`), `SkillVersion` (+ `note`),
  `SkillImportDraft` (+ `ignored_files`, `warnings`)
- `Agent` + `skill_count` · new `AgentSkill`
- `PromptAssembly` + `skills_tokens`, `skills_loaded`

**Verify:** both packages typecheck. Existing producers of `Agent` and `Skill` are
temporarily given the new fields, so nothing breaks between phases. `test/contracts.test.ts`
gains cases for the new schemas.
**Size:** 4 files.

### 2 · Server — `skills` module

New `server/src/modules/skills/`, layered like `pulls`:

| File | Holds |
|---|---|
| `routes.ts` | the 8 routes; `IdParams`; the tighter rate limit on `POST /skills/import` |
| `service.ts` | use cases with narrow deps (`repo`, `fetchText`), transaction boundaries, 404/409/422 |
| `repository.ts` | Drizzle for `skills` and `skill_versions`, plus the grouped `agent_count` query; returns contracts |
| `domain.ts` | pure rules: version bump on a body change, row → `Skill` mapping, name normalisation |
| `import/parse.ts` | pure: frontmatter parse, `.md` → draft, `.zip` → draft (`fflate`, one-deep `SKILL.md`, limits, `..` rejection, `ignored_files`) |
| `import/url.ts` | GitHub blob → raw rewrite and https-only check (pure). The fetch itself goes through the new port below |

Also:
- `src/adapters/http-fetch/` (new port and adapter: https GET with timeout, size cap, and
  private-address refusal), a mock in `adapters/mocks.ts`, and wiring in `container.ts`.
- `@fastify/multipart` registered in `app.ts` next to the other plugins (limit: 1 file,
  1 MB).
- `skills` added to `src/modules/index.ts`.
- `skill_versions.note` in `src/db/schema/skills.ts`, then `pnpm db:generate` and
  `pnpm db:migrate`.
- `server/specs/L02-skills.md`: the import row changed from "multipart or JSON" to match the
  multipart decision.

**Tests:** `test/skills-import.test.ts` (hermetic) and `test/skills-crud.it.test.ts`, as
listed in the server spec.
**Verify:** `pnpm test`, `pnpm typecheck` and `pnpm arch:check` pass with no new baseline
entries. `curl` create → edit body → versions → restore → delete works against the dev DB.
**Size:** about 12 files, plus a migration and 2 dependencies.

### 3 · Server — agents, injection, seed

- `modules/agents`: `skill_count` on list and get (one grouped count);
  `GET /agents/:id/skills` → every workspace skill as `AgentSkill`, linked first;
  `POST /agents/:id/skills` rejects a skill id from another workspace with `422`. Additions
  only: the module's existing shape is left as it is.
- `modules/reviews`: a repository query for an agent's enabled and linked skills in order;
  `run-executor.ts` renders `### name (vN)` blocks, passes `skills`, emits one run-log event
  per skill (or "none linked"), and sets `skills_tokens` / `skills_loaded` through
  `container.tokenizer`.
- Seed: `docs/agent-prompts/test-quality-reviewer.md` → `seed-prompts.ts` → `seed.ts`,
  as a fourth agent, idempotent.
- Authored content, not code: `docs/agent-prompts/api-contract-reviewer.md`, and the skill
  files under `docs/skills/test-quality/` and `docs/skills/api-contract/`, each with
  frontmatter, a directive description, and Good/Bad examples.

**Tests:** `test/agents-skills.it.test.ts` and `test/reviews-skills.it.test.ts` (stubbed LLM;
order, reorder, disabled/unlinked absent, tokens set).
**Verify:** server green. One real review run in the dev app shows the skills in the stored
trace.
**Size:** about 10 files, plus 7 markdown files.

### 4 · Client — data layer and menu

- `src/lib/hooks/skills.ts` (new) and the additions to `src/lib/hooks/agents.ts`, as in the
  client spec's data-layer table.
- `src/lib/api.ts`: a `FormData` path with no JSON `content-type`.
- `APP_NAV`: a new `skillsLab` group with Skills, Agents and Conventions. Conventions stays
  out until its page exists, so the menu never links to a 404.
- `pnpm add diff @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` in `client/`.

**Tests:** hook tests with mocked `fetch` for create, import (FormData body) and set-order.
**Verify:** `pnpm test` and `pnpm typecheck`. The sidebar shows SKILLS LAB.
**Size:** about 5 files.

### 5 · Client — Skills screens

- `src/components/list-detail-layout/` (new, shared by Skills and Agents).
- `src/app/skills/page.tsx` and `src/app/skills/[id]/page.tsx` (thin).
- `_components/`: `SkillsListView`, `SkillCard`, `SkillFormModal`, `ImportSkillModal`,
  `SkillDetail` (Config · Preview · Versions tabs), `VersionsTab` (Diff and Restore), and
  shared `SkillBodyEditor` and `ConfirmDeleteModal` (in `src/components/` because Agents
  and Conventions reuse them).
- `messages/en/skills.json`.

**Tests:** the components listed in the client spec.
**Verify:** client green. In the browser: create → edit body (v2) → Diff → Restore (v3) →
import `.md` → import `.zip` with a script (listed as ignored) → delete, each against the
matching design artboard.
**Size:** about 20 files.

### 6 · Client — Agents screens and the Skills tab

- `/agents` moves to `ListDetailLayout`. The editor page already renders a left agent list,
  so this mostly unifies the two.
- `AgentCard`: model chip, `skill_count`, and `ConfirmDeleteModal` instead of
  `window.confirm`.
- `AgentEditor`: tabs Config and Skills (`VALID_TABS`); the Config hint line.
- `SkillsTab` (new): filter, "K of N enabled", checkboxes, and `@dnd-kit` drag for checked
  rows only.

**Tests:** `SkillsTab` and `AgentCard` per the client spec.
**Verify:** client green. In the browser: check 3 skills, drag, reload, and the order
persists.
**Size:** about 10 files.

### 7 · Client — trace

`TraceBody`: a "Skills loaded" row in Configuration, and a `~N tokens` badge on the Skills
prompt block.

**Verify:** a run on an agent with 2 skills shows both, in order, with a token count. After
swapping them and running again, the blocks are swapped (#14).
**Size:** 2–3 files.

### 8 · End-to-end and wrap-up

- `e2e/specs/08-skills.flow.json`: create → check on an agent → reorder → run → trace.
- Update `server/README.md` (API map) and `client/README.md` (route map); set the three spec
  statuses to `implemented`.
- The `engineering-insights` sweep; `/pr-self-review`.
- Record the two control experiments (#17 #18) in the PR description: 2 runs without
  skills and 2 runs with skills per PR.

## Risks

| Risk | Mitigation |
|---|---|
| The prompt changes shape once skills fill the slot (reviewer-core `docs/prompt-slots.md` warns about this) | the engine is unchanged; phase 3 tests pin the rendered block format |
| LLM nondeterminism makes the experiments flaky | run each twice; keep the skill rules concrete, with Good/Bad examples |
| Contract changes break the client between phases | phase 1 adds fields as optional or with server defaults first; the client copy is synced in the same commit |
| `next build` breaks the running dev server (`client/INSIGHTS.md`) | checks use `pnpm typecheck` and `pnpm test` only, never `pnpm build` while dev is up |

## Not in this plan

Conventions Extractor (next plan) · the `AGENTS.md` rename and push-hook changes (handled
separately) · the design's Evals, Stats and CI tabs and the community search.

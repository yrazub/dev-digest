# L02 — Skills (server)

A new `skills` module (CRUD, versions, import), agent ↔ skill reads that the agent's Skills
tab needs, and skill injection into the review prompt with a token count.

Read [`specs/L02-skills.md`](../../specs/L02-skills.md) first. It defines the two switches
(global `enabled` plus per-agent link), body-only versioning and the experiments. The
client half is [`../../client/specs/L02-skills.md`](../../client/specs/L02-skills.md).
Layering follows the `onion-architecture` skill: route → service → repository, with
`pnpm arch:check` green.

## What already exists

| Piece | Where | State |
|---|---|---|
| `skills`, `skill_versions`, `agent_skills` tables | `src/db/schema/skills.ts`, `agents.ts` | present, empty |
| `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` | `src/vendor/shared/contracts/knowledge.ts` | present |
| `GET/POST /agents/:id/skills` (set the ordered set / link one) | `src/modules/agents/` | works |
| `DELETE /agents/:id` | `src/modules/agents/routes.ts` | works |
| `skills?: string[]` slot, rendered under `## Skills / rules` | `reviewer-core` `ReviewInput` / `assemblePrompt` | works, fed nothing |
| `prompt_assembly.skills` in the trace | `run-executor.ts` → `outcome.assembly` | always `null` |
| `Tokenizer` (tiktoken `cl100k_base`, `chars/4` fallback) | `src/adapters/tokenizer` | repo-intel only |

One migration, generated with `pnpm db:generate`: add `note text` (nullable) to
`skill_versions`. The design's version list shows a one-line change note per version.
`skills.source` is a Drizzle text enum with no database constraint, so adding
`imported_file` is a TypeScript-only change.

## Contracts (`src/vendor/shared/contracts/knowledge.ts`, then sync the client copy)

| Contract | Shape |
|---|---|
| `SkillSource` | `+ 'imported_file'` |
| `Skill` | `+ agent_count: z.number().int()`, `+ created_at: z.string()` |
| `SkillCreate` | `name` (1–80, `^[a-z0-9][a-z0-9-]*$`), `description` (1–500), `type: SkillType`, `body` (1–64 KB), `source?: SkillSource` (default `manual`), `enabled?`, `evidence_files?` |
| `SkillUpdate` | `SkillCreate` minus `source`, all optional, plus `version_note?` (≤ 120 chars, stored only when the body changes) |
| `SkillVersion` | `version`, `body`, `note: string \| null`, `created_at`, `current: boolean` |
| `SkillImportDraft` | `name`, `description`, `type`, `body`, `source: 'imported_file' \| 'imported_url'`, `ignored_files: string[]` (every archive entry other than `SKILL.md`, shown as ignored in the preview), `warnings: string[]` |
| `Agent` | `+ skill_count: z.number().int()` (linked skills, enabled or not) |
| `AgentSkill` | `Skill` + `linked: boolean` + `order: number \| null` |
| `PromptAssembly` (`trace.ts`) | `+ skills_tokens: z.number().int().nullish()`, `+ skills_loaded: z.array(z.object({ name, version })).nullish()` |

Skill names are unique per workspace. A duplicate returns `409 Conflict`.

## Routes — `src/modules/skills/`

| Method · path | Body / result | Notes |
|---|---|---|
| `GET /skills` | → `Skill[]` | `agent_count` computed with one grouped count, not N+1 |
| `GET /skills/:id` | → `Skill` | |
| `POST /skills` | `SkillCreate` → `201 Skill` | inserts `skills` and `skill_versions` v1 in one transaction |
| `PUT /skills/:id` | `SkillUpdate` → `Skill` | if `body` changed: `version + 1` and a new `skill_versions` row, in one transaction |
| `DELETE /skills/:id` | → `{ ok: true }` | `agent_skills` and `skill_versions` cascade |
| `GET /skills/:id/versions` | → `SkillVersion[]` | newest first, with bodies. The client computes the diff |
| `POST /skills/:id/versions/:version/restore` | → `Skill` | copies that body forward as a new version |
| `POST /skills/import/file` | multipart, one `file` part (`.md` / `.zip`, ≤ 1 MB, via `@fastify/multipart`) → `SkillImportDraft` | parses only, stores nothing; 20/min |
| `POST /skills/import/url` | `{ url }` → `SkillImportDraft` | fetched through the `http-fetch` port; parses only, stores nothing; 20/min |

All routes are scoped to the workspace through `getContext`. A skill from another workspace
is a `404`.

### Import rules

- **`.md`**: YAML frontmatter `name`, `description`, optional `type` (default `custom`).
  The body is everything after the frontmatter. Missing frontmatter falls back to the file
  name and the first paragraph, and adds a warning.
- **`.zip`**: find exactly one `SKILL.md`, at the archive root or one folder deep, and parse
  it as above. List every other entry in `ignored_files`. They are never extracted to
  disk, stored, executed or sent to a model (the lab's trust rule). Limits: 1 MB
  compressed, 5 MB uncompressed, 200 entries. Reject paths containing `..`. Unzip with
  `fflate` (new dependency, `pnpm add fflate` in `server/`).
- **URL**: `https` only. A `github.com/<o>/<r>/blob/<ref>/<path>` URL is rewritten to
  `raw.githubusercontent.com`. Other hosts are fetched as they are. Timeout 10 s, maximum
  256 KB, `.md` content only. Refuse hosts that resolve to private or loopback addresses
  (SSRF). The fetch goes through a new `adapters/http-fetch` port so tests mock it.
- The draft is saved by the client through `POST /skills` with `source` set from the draft.

## Agents module changes

- `GET /agents`, `GET /agents/:id`: add `skill_count`.
- `GET /agents/:id/skills` → `AgentSkill[]`: **every** workspace skill (#37). Linked ones
  come first in `order`, then the unlinked ones by name.
- `POST /agents/:id/skills { skill_ids }` (exists): the new client contract for toggle and
  reorder is "send the full ordered list of linked ids". Add the missing check that every
  id belongs to the workspace, returning `422` otherwise.

## Injection — `src/modules/reviews/run-executor.ts`

1. Before calling `reviewPullRequest`, load the agent's links joined to `skills`, where
   `skills.enabled`, ordered by `agent_skills.order`. The query goes in the reviews
   repository.
2. Render each as `### <name> (v<version>)\n<body>`, and pass `skills: string[]` only when
   the list is non-empty. The engine drops an empty slot.
3. Emit one run-log event per injected skill, `skill: <name> v<n> · ~<tokens> tok`, or a
   single `skills: none linked` (#20).
4. After the run, set `trace.prompt_assembly.skills_tokens = tokenizer.count(assembly.skills)`
   and `skills_loaded = [{ name, version }…]` in injection order, when `assembly.skills`
   is non-null (#19). The design's trace Configuration lists "Skills loaded". Reuse the container's `Tokenizer`, and widen
   its "repo-intel only" comment.

Nothing re-sorts the skill list between steps 1 and the prompt. That is the #14 guarantee,
and a test pins it.

## Seed — Test Quality Reviewer

Add a fourth agent to `src/db/seed.ts` next to the three existing ones, idempotent like
them. Its prompt comes from `docs/agent-prompts/test-quality-reviewer.md` through
`seed-prompts.ts`. Its scope, per the lab: uncovered branches, missed corner cases, excessive mocking,
flaky tests. The prompt names that scope, but must *not* contain the detailed rules its
skills add (`branch-coverage`, `edge-cases`). Otherwise the control experiment has nothing
to show.

## Tests

| File | Covers |
|---|---|
| `test/skills-import.test.ts` | frontmatter parse, fallback, zip one-deep, a script in the zip listed in `ignored_files` and absent from the draft body, zip limits, `..` rejection, URL rewrite, private-host refusal (mocked fetch) |
| `test/skills-crud.it.test.ts` | create writes v1 · body edit bumps version · metadata edit does not · restore appends · delete cascades · `agent_count` · 409 on a duplicate name · a row deleted in SQL vanishes from `GET /skills` (#8) |
| `test/agents-skills.it.test.ts` | full list with `linked`/`order` · foreign skill id → 422 · `skill_count` |
| `test/reviews-skills.it.test.ts` | stubbed LLM: linked and enabled skills reach `skills` in link order · reorder flips it · disabled or unlinked → absent · `skills_tokens` set |

## Acceptance

- [ ] All routes above respond as specified, and `pnpm test`, `pnpm typecheck` and
      `pnpm arch:check` pass.
- [ ] A review run for an agent with two linked skills stores a trace whose
      `prompt_assembly.skills` holds both blocks in link order, with `skills_tokens > 0`.
- [ ] The seeded workspace has four agents, including Test Quality Reviewer.

# Project Context — server
Spec ID: SPEC-2026-10-16-project-context · Umbrella: [`specs/L05-project-context.md`](../../specs/L05-project-context.md) · Status: approved

## Scope
Covers AC-1–AC-15, AC-30, AC-31, AC-38, AC-41, AC-44, AC-45, AC-55, AC-56, AC-59, AC-62–AC-66,
AC-70–AC-75, AC-77–AC-83, AC-88–AC-90 of the umbrella. It also owns every `@devdigest/shared`
contract the feature adds or changes; the client and reviewer-core specs refer to them by name.

The server discovers documents by walking a repository's clone, stores the attached paths of
agents and skills, and, in the review run, reads the effective documents and hands them to the
engine's `specs` input, then records them in the trace. No document content is stored in the
database and no model is called.

## What already exists

| Piece | Where |
|---|---|
| `GitClient.readFile(repo, path)` — resolves symlinks and refuses a target outside the clone; `currentHead(repo)` | `src/adapters/git/simple-git.ts`, port in `src/vendor/shared/adapters.ts` |
| `repos.clone_path`, `repos.default_branch`; the clone's working tree is the default branch (`sync()` does `reset --hard origin/<branch>`) | `src/db/schema/repos.ts`, `src/adapters/git/simple-git.ts` |
| A walker that skips `EXCLUDED_DIRS` and never follows symlinks (code files only) | `src/modules/repo-intel/pipeline/walk.ts`, `src/modules/repo-intel/constants.ts` |
| `container.tokenizer.count(text)` — `cl100k_base`, used for `skills_tokens` | `src/adapters/tokenizer/index.ts` |
| `promptSkillsForAgent(agentId)` — the agent's enabled, linked skills in `agent_skills.order` | `src/modules/reviews/repository/skill.repo.ts` |
| `RunTrace.specs_read: string[]` (always `[]` today), `PromptAssembly.specs` | `src/vendor/shared/contracts/trace.ts`, `src/modules/reviews/run-executor.ts` |
| `SpecFile` (`path`, `content`, `size`, `updated_at`) — unused by any route | `src/vendor/shared/contracts/platform.ts` |
| `getContext`, `IdParams`, `NotFoundError` | `src/modules/_shared/`, `src/platform/errors.ts` |

## Requirements (EARS)
| ID | Requirement | Covers |
|---|---|---|
| R-SRV-1 | WHEN `GET /repos/:id/context` is called for a repository of the caller's workspace with a clone on disk, the API shall answer `200` with a `ProjectContextList` whose `state` is `ready` and whose `documents` hold every `.md` file under a folder whose name is a search root, at any depth of the clone's working tree. | AC-1, AC-8 |
| R-SRV-2 | The server shall read the search roots from the setting `PROJECT_CONTEXT_ROOTS`, a comma-separated list of folder names, and use `specs,docs,insights` when it is unset or empty. | AC-2, AC-3 |
| R-SRV-3 | The discovery walk shall skip directories named `node_modules`, `dist`, `build`, `coverage`, `.next`, `out`, `vendor` and `.git`. | AC-4 |
| R-SRV-4 | The discovery walk shall skip every symbolic link, to a file or a directory. | AC-5 |
| R-SRV-5 | The API shall return each document as a `SpecFile` with `path` (relative, `/`-separated), `kind`, `size` (bytes), `tokens` and `status`, and without `content`. | AC-6 |
| R-SRV-6 | The API shall set `kind` to the name of the nearest ancestor folder of the file whose name is a search root. | AC-7 |
| R-SRV-7 | The discovery walk shall leave out a path that contains a character in U+0000–U+001F or U+007F, `"`, `<`, `>` or `\`, or that is longer than 512 characters. | AC-9 |
| R-SRV-8 | IF a document is larger than 102,400 bytes, THEN the API shall return it with `status: 'too_large'` and `tokens: null`. | AC-10 |
| R-SRV-9 | IF a document's bytes are not valid UTF-8, THEN the API shall return it with `status: 'unreadable'` and `tokens: null`. | AC-11 |
| R-SRV-10 | WHEN more than 1,000 documents are found, the API shall return the first 1,000 sorted by `path`, with `capped: true` and `cap: 1000`. | AC-12 |
| R-SRV-11 | IF the repository's `clone_path` is null or the directory is missing, THEN the API shall answer `200` with `state: 'not_cloned'`, `documents: []` and `ref: null`. | AC-13 |
| R-SRV-12 | The server shall store attached paths only, in the tables `agent_context_docs` and `skill_context_docs`, keeping document text out of every table. | AC-14 |
| R-SRV-13 | The API shall compute `tokens` with `container.tokenizer.count()` on the document's full text, the counter the run uses for the trace. | AC-15 |
| R-SRV-14 | WHEN `GET /repos/:id/context/file?path=` names a discovered document, the API shall answer a `ProjectContextFile` with its `content` and `used_by`. | AC-30 |
| R-SRV-15 | The API shall set `used_by.agents_direct` to the number of the workspace's agents, enabled or disabled, that attach the path; `used_by.agents_via_skill` to the number of other agents, enabled or disabled, linked to an enabled skill that attaches it; and `used_by.skills` to the number of the workspace's skills, enabled or disabled, that attach it. | AC-30 |
| R-SRV-16 | The API shall return in `ProjectContextList.ref` the clone's default branch and its `HEAD` commit SHA. | AC-31 |
| R-SRV-17 | WHEN `PUT /agents/:id/context` or `PUT /skills/:id/context` receives `{ paths }`, the API shall replace the stored list with exactly those paths in that order and answer the stored state. | AC-38 |
| R-SRV-18 | The API shall return in `ProjectContextList` the soft cap `soft_cap_tokens: 4000` and the run cap `run_cap_tokens: 16000`, defined once in the server's constants. | AC-41, AC-44, AC-45 |
| R-SRV-19 | WHEN an agent's or a skill's attached paths change, the API shall leave `agents.version` and `skills.version` unchanged and write no `agent_versions` or `skill_versions` row. | AC-55 |
| R-SRV-20 | WHEN an agent or a skill is deleted, the database shall delete its attached paths through a cascading foreign key. | AC-56 |
| R-SRV-21 | WHEN `GET /agents/:id/context` is called, the API shall return in `inherited` each path attached to an enabled skill linked to the agent, with the skill's id and name, in the agent's skill order and each skill's attached order. | AC-59 |
| R-SRV-22 | WHEN a review run starts for an agent, the run shall build the effective list: the agent's paths in order, then the paths of each skill from `promptSkillsForAgent` in that order, keeping only the first occurrence of a path. | AC-62, AC-63, AC-64, AC-65 |
| R-SRV-23 | The run shall read each effective path once, before the engine call, with `GitClient.readFile` on the clone of the pull request's repository, and pass the documents to `reviewPullRequest` as `specs: [{ path, text }]` in effective order. | AC-62, AC-66 |
| R-SRV-24 | The run shall make no LLM call to build project context. | AC-70 |
| R-SRV-25 | IF an effective path is missing, not valid UTF-8, larger than 102,400 bytes, empty after trimming, or refused by `readFile` as outside the clone, THEN the run shall record it as skipped with the reason `not_found`, `unreadable`, `too_large`, `empty` or `outside_clone`, and continue. | AC-71 |
| R-SRV-26 | IF the pull request's repository has no clone on disk, THEN the run shall pass no `specs` and record every effective path as skipped with the reason `not_cloned`. | AC-72 |
| R-SRV-27 | WHEN adding a document would make the sum of inserted document tokens exceed 16,000, the run shall skip that document and every later one with the reason `over_cap`. | AC-73 |
| R-SRV-28 | The run shall build project context whatever the agent's `repo_intel` value. | AC-74 |
| R-SRV-29 | WHEN the run inserts a document, the run shall log `Project context: <path> · ~<tokens> tok (<origin>)` at `info` in the run's Live Log. | AC-75 |
| R-SRV-38 | WHEN the run skips a document, the run shall log `Project context: skipped <path> — <reason>` at `info` in the run's Live Log. | AC-75 |
| R-SRV-39 | WHEN the effective list of a run is empty, the run shall log `Project context: none attached` at `info` in the run's Live Log. | AC-75 |
| R-SRV-30 | WHEN a run completes, the run shall write `specs_read` as the inserted paths in prompt order. | AC-77 |
| R-SRV-31 | WHEN a run completes, the run shall write `prompt_assembly.specs_loaded` with each inserted document's `path`, `origin`, `skill_name`, `tokens` and `text` (the text as sent). | AC-78, AC-80, AC-81 |
| R-SRV-32 | WHEN a run completes with a `## Project context` section, the run shall write `prompt_assembly.specs_tokens` as the token count of `prompt_assembly.specs`. | AC-79 |
| R-SRV-33 | WHEN a run completes with skipped documents, the run shall write them to `prompt_assembly.specs_skipped` with `path`, `origin`, `skill_name` and `reason`. | AC-82 |
| R-SRV-34 | WHEN a run completes with a `## Project context` section, the run shall write `prompt_assembly.specs_calls` as the number of LLM review calls the section was sent with. | AC-83 |
| R-SRV-35 | IF a `PUT …/context` body holds more than 200 paths, a duplicate, or a path that fails `ContextDocPath` or lies under no search-root folder, THEN the API shall answer `422` and store nothing. | AC-88 |
| R-SRV-36 | IF `GET /repos/:id/context/file` names a path that fails `ContextDocPath` or is not a discovered document of that repository, THEN the API shall answer `404`. | AC-89 |
| R-SRV-37 | IF the repository, agent or skill of a request is not in the caller's workspace, THEN the API shall answer `404` with code `not_found`. | AC-90 |

## Contracts (`@devdigest/shared`)

Authored in `src/vendor/shared`, exported through the package index; the same lines are synced
into `client/src/vendor/shared`. Each schema has its inferred type under the same name.

### `contracts/platform.ts` — Project Context

```ts
/** A relative markdown path inside a repository. Character rules = R-SRV-7. */
export const ContextDocPath = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !p.startsWith('/'), 'relative path')
  .refine((p) => !p.split('/').includes('..'), 'no .. segment')
  .refine((p) => !/[\u0000-\u001f\u007f"<>\\]/.test(p), 'forbidden character')
  .refine((p) => p.toLowerCase().endsWith('.md'), 'a .md file');

export const ContextDocStatus = z.enum(['ok', 'too_large', 'unreadable']);

// SpecFile (exists) gains three fields; content stays nullish (absent in lists).
export const SpecFile = z.object({
  path: z.string(),
  content: z.string().nullish(),
  size: z.number().int().nullish(),
  updated_at: z.string().nullish(),
  kind: z.string(),                                 // name of the nearest search-root folder
  tokens: z.number().int().nonnegative().nullable(), // null unless status is 'ok'
  status: ContextDocStatus,
});

/** GET /repos/:id/context */
export const ProjectContextList = z.object({
  state: z.enum(['ready', 'not_cloned']),
  roots: z.array(z.string()),
  ref: z.object({ branch: z.string(), sha: z.string() }).nullable(),
  documents: z.array(SpecFile),
  total_tokens: z.number().int().nonnegative(),     // sum over status 'ok'
  capped: z.boolean(),
  cap: z.number().int().positive(),                 // 1000
  soft_cap_tokens: z.number().int().positive(),     // 4000
  run_cap_tokens: z.number().int().positive(),      // 16000
});

/** GET /repos/:id/context/file?path= */
export const ProjectContextFile = SpecFile.extend({
  content: z.string().nullable(),                   // null unless status is 'ok'
  used_by: z.object({
    agents_direct: z.number().int().nonnegative(),
    agents_via_skill: z.number().int().nonnegative(),
    skills: z.number().int().nonnegative(),
  }),
});

/** Body of PUT /agents/:id/context and PUT /skills/:id/context */
export const ContextPathsInput = z.object({
  paths: z.array(ContextDocPath).max(200)
    .refine((ps) => new Set(ps).size === ps.length, 'duplicate path'),
});

export const SkillContext = z.object({ paths: z.array(z.string()) });

export const AgentContext = z.object({
  paths: z.array(z.string()),
  inherited: z.array(z.object({ path: z.string(), skill_id: z.string(), skill_name: z.string() })),
});
```

The client's existing `useReindexContext` targets `POST /repos/:id/context/reindex`, which is not
built; `IndexStatus` is not changed.

### `contracts/trace.ts` — `PromptAssembly`

```ts
export const ContextSkipReason = z.enum([
  'not_found', 'unreadable', 'too_large', 'empty', 'outside_clone', 'not_cloned', 'over_cap',
]);
const ContextOrigin = z.enum(['agent', 'skill']);

// added to PromptAssembly, all nullish so traces written before L05 still parse:
specs_tokens: z.number().int().nullish(),     // tokens of the whole `specs` section; null when omitted
specs_calls: z.number().int().nullish(),      // LLM review calls the section was sent with
specs_loaded: z.array(z.object({
  path: z.string(),
  origin: ContextOrigin,
  skill_name: z.string().nullable(),          // set when origin is 'skill'
  tokens: z.number().int().nonnegative(),
  text: z.string(),                           // the document text exactly as sent
})).nullish(),
specs_skipped: z.array(z.object({
  path: z.string(),
  origin: ContextOrigin,
  skill_name: z.string().nullable(),
  reason: ContextSkipReason,
})).nullish(),
```

`RunTrace.specs_read` stays `z.array(z.string())` and now carries the inserted paths. The
failure trace (`traceFromBuffer`) and `emptyPromptAssembly` keep writing an empty `specs_read`
and no new fields (EC-25).

## Configuration and limits

| Name | Value | Where |
|---|---|---|
| `PROJECT_CONTEXT_ROOTS` | comma-separated folder names, default `specs,docs,insights`; entries are trimmed, empty entries and entries containing `/` are dropped | `src/platform/config.ts` (`EnvSchema` → `AppConfig.projectContextRoots`) |
| `MAX_CONTEXT_DOC_BYTES` | 102,400 | the module's `constants.ts` |
| `MAX_CONTEXT_DOCS` | 1,000 | same |
| `MAX_CONTEXT_PATHS` | 200 (also the contract's `.max`) | same |
| `CONTEXT_SOFT_CAP_TOKENS` | 4,000 | same; returned to the client |
| `CONTEXT_RUN_CAP_TOKENS` | 16,000 | same; returned to the client and enforced by the run |

The excluded directory list is the same set as repo-intel's `EXCLUDED_DIRS`. The module does not
import `repo-intel/constants` (`dep-no-cross-module`): it declares its own list, or receives it
through the container as L04 did for the caller limit. Check placement with the
`onion-architecture` skill and `pnpm arch:check`; no new violation and no new baseline entry.

## Tables

In `src/db/schema/context.ts` (the L05 domain file), generated with `pnpm db:generate`:

| Table | Columns | Keys |
|---|---|---|
| `agent_context_docs` | `agent_id uuid` → `agents.id` on delete cascade · `path text` · `order integer` | primary key (`agent_id`, `path`) |
| `skill_context_docs` | `skill_id uuid` → `skills.id` on delete cascade · `path text` · `order integer` | primary key (`skill_id`, `path`) |

`server/docs/schema.md` gets both tables in the `context.ts` row (by `doc-writer`).

## Module `src/modules/project-context/`

A new module, registered in `src/modules/index.ts`, with the usual `routes.ts` · `service.ts` ·
`repository.ts` and a pure `domain.ts` (type from path, path rules, effective-list merge, cap
application). The discovery walk takes a root path and does file-system reads only.

### Routes

| Route | Params / query / body | Answers |
|---|---|---|
| `GET /repos/:id/context` | `IdParams` | `200 ProjectContextList` · `404` unknown repository |
| `GET /repos/:id/context/file` | `IdParams`, query `{ path: string }` | `200 ProjectContextFile` · `404` unknown repository, invalid or undiscovered path |
| `GET /agents/:id/context` | `IdParams` | `200 AgentContext` · `404` |
| `PUT /agents/:id/context` | `IdParams`, body `ContextPathsInput` | `200 AgentContext` · `422` · `404` |
| `GET /skills/:id/context` | `IdParams` | `200 SkillContext` · `404` |
| `PUT /skills/:id/context` | `IdParams`, body `ContextPathsInput` | `200 SkillContext` · `422` · `404` |

Every route is workspace-scoped through `getContext` and inherits the global rate limit. A `PUT`
is one transaction: delete the owner's rows, insert the new ones with `order` = index. The
"under a search-root folder" check of R-SRV-35 runs in the service against the configured roots
(the contract cannot see the configuration) and maps to `422` with code `validation_error`.

The list route walks the clone on every request; nothing is cached or stored. `content` of the
file route is read through `GitClient.readFile`, and the path must also be in the walk's result
(R-SRV-36), so a file the walk would skip — a symlink, an excluded folder — is never served.

### The review run

In `src/modules/reviews/run-executor.ts`, inside `runOneAgent`, after the skills are resolved and
before `reviewPullRequest`:

1. Read the agent's paths and, for each skill of `promptSkillsForAgent`, its paths (the reviews
   repository reads `agent_context_docs` and `skill_context_docs`; `PromptSkill` gains the
   skill's id so the two can be joined).
2. Merge them into the effective list (R-SRV-22) — a pure function.
3. No clone → every path skipped `not_cloned` (R-SRV-26). Otherwise read each path (R-SRV-23,
   R-SRV-25), count its tokens, and apply the run cap in order (R-SRV-27).
4. Log one line per document, or one "none attached" line (R-SRV-29, R-SRV-38, R-SRV-39), with `runLog.info`, never `runLog.step` (a `step` that
   throws emits an `error` event, which the client shows as a toast — `server/INSIGHTS.md`).
5. Pass `specs` only when at least one document is inserted.
6. On completion write the trace fields of R-SRV-30–R-SRV-34. `specs_calls` is the number of
   review calls of the outcome (`outcome.chunks.length`).

## Tests

| File | Kind | Covers |
|---|---|---|
| `test/project-context-domain.test.ts` | hermetic | type from nearest root (R-SRV-6); path rules (R-SRV-7, R-SRV-35 shape); effective-list merge and de-duplication with three or more paths per owner (R-SRV-22); cap application in order (R-SRV-27) |
| `test/project-context-walk.test.ts` | hermetic, temp directory | roots and default roots (R-SRV-1, R-SRV-2); excluded directories (R-SRV-3); symlinked file and directory skipped (R-SRV-4); `too_large`, `unreadable` (R-SRV-8, R-SRV-9); cap at 1,000 sorted by path (R-SRV-10); token counts from the tokenizer (R-SRV-13) |
| `test/project-context.it.test.ts` | Postgres | the six routes: `200` shapes, `not_cloned` (R-SRV-11), `ref` (R-SRV-16), caps returned (R-SRV-18), order stored and returned (R-SRV-17), `422` cases (R-SRV-35), `404` cases (R-SRV-36, R-SRV-37), `used_by` counts with a disabled agent, a disabled skill and an agent linked to a disabled skill that attaches the path (R-SRV-15), `inherited` (R-SRV-21), no version bump (R-SRV-19), cascade on delete (R-SRV-20), no document text in any table (R-SRV-12) |
| `test/reviews-project-context.it.test.ts` | Postgres, mock LLM, temp clone | the prompt sent to the mock holds each document's path and text in effective order (R-SRV-22, R-SRV-23); a disabled skill's documents absent; the clone's working tree is read, not the PR head (R-SRV-23); the mock's call count is unchanged by attaching documents (R-SRV-24); skip reasons, `not_cloned`, `over_cap` (R-SRV-25–R-SRV-27); `repo_intel: false` still injects (R-SRV-28); Live Log lines (R-SRV-29, R-SRV-38, R-SRV-39); every trace field (R-SRV-30–R-SRV-34). A test that reads the trace polls until the route answers `200` (`server/INSIGHTS.md`). |
| `test/contracts.test.ts` | hermetic | the new contracts, and an old `PromptAssembly` without the new fields still parses |

Existing tests that pass `specs: ['…']` strings to the engine (`test/prompt-callers.test.ts`,
`test/prompt-structured.test.ts`) change to the new `{ path, text }` shape (see the
reviewer-core spec). Where each test belongs is decided by `../../TESTING.md`.

## Documentation

`README.md` — the API map gets the `project-context` module and its six routes; "Review context"
gets the project-context slot. `docs/schema.md` — the two tables. Written by `doc-writer` after
the code is verified.

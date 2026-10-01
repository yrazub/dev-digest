# L02 — Conventions Extractor (server)

A new `conventions` module: a four-step pipeline behind
`POST /repos/:id/conventions/extract`, candidate review routes, and one transactional
"candidates → skill → links" call.

Read [`specs/L02-conventions.md`](../../specs/L02-conventions.md) first. The client half is
[`../../client/specs/L02-conventions.md`](../../client/specs/L02-conventions.md). The skill
it creates follows [`L02-skills.md`](L02-skills.md).

## What already exists

| Piece | Where | State |
|---|---|---|
| `conventions` table (`rule`, `evidence_path`, `evidence_snippet`, `confidence`, `accepted`) | `src/db/schema/knowledge.ts` | present, empty |
| `ConventionCandidate` | `contracts/knowledge.ts` | present |
| `repoIntel.getConventionSamples(repoId, n)`: top-ranked files, tests, configs and migrations excluded | `src/modules/repo-intel/service.ts` | works, no caller |
| `conventions` entry in `FEATURE_MODELS`, and `getFeatureModelOverride` | `contracts/platform.ts`, `src/modules/settings/feature-models.ts` | works, no caller |
| `repos.clone_path`, `repo_index_state.last_indexed_sha` | schema | populated by import and indexing |

## Schema change (`pnpm db:generate`, never hand-edited)

`conventions`: add `category text not null`, `evidence_line_start integer not null`,
`evidence_line_end integer not null`,
`status text not null default 'pending'` (`pending | accepted | rejected`),
`created_at timestamptz default now()`. Drop `accepted`, because `status` replaces it and
the table is empty in every starter database. Add an index on `(repo_id, status)`.

## Contracts (`contracts/knowledge.ts`)

| Contract | Shape |
|---|---|
| `ConventionCategory` | `naming` `structure` `imports` `error-handling` `typing` `testing` `formatting` `api` `other` |
| `ConventionStatus` | `pending` `accepted` `rejected` |
| `ConventionCandidate` | `id`, `category`, `rule`, `evidence_path`, `evidence_line_start`, `evidence_line_end`, `evidence_snippet`, `evidence_url` (nullable: no index sha), `confidence` (0–1), `status`. **Remove `accepted`** |
| `ConventionExtractResult` | `candidates: ConventionCandidate[]`, `stats: { sampled_files, proposed, verified, dropped, model, scanned_at }` |
| `ConventionScanInfo` | `last_scan_at: string \| null`, `sampled_files: number \| null`, the header's "Detected from N sample files · last scan 1h ago" |
| `ConventionList` | `scan: ConventionScanInfo`, `candidates` — the `GET` response |
| `ConventionUpdate` | `status?`, `rule?`, `category?`; at least one field |
| `ConventionSkillDraftRequest` | `candidate_ids` (1+) |
| `ConventionSkillCreate` | `candidate_ids` (1+), `name`, `description`, `type`, `body`, `enabled` |
| `ConventionSkillDraft` | `name`, `description`, `type: 'convention'`, `body` |

The LLM's own output schema (`{ candidates: [{ category, rule, evidence: { path, line,
snippet }, confidence }] }`) is module-internal (`src/modules/conventions/llm-schema.ts`),
not a wire contract.

## Routes — `src/modules/conventions/`

| Method · path | Result | Notes |
|---|---|---|
| `POST /repos/:id/conventions/extract` | `ConventionExtractResult` | synchronous, 120 s timeout, tight rate limit like `POST /pulls/:id/review`. `409` if the repo is not indexed |
| `GET /repos/:id/conventions` | `{ scan: ConventionScanInfo, candidates: ConventionCandidate[] }` | all statuses. The client hides `rejected`. The scan info is stored per repo in `settings` (key `conventions_scan:<repoId>`), so no new table is needed |
| `PATCH /conventions/:id` | `ConventionCandidate` | accept, reject, inline edit |
| `POST /repos/:id/conventions/skill-draft` `{ candidate_ids }` | `ConventionSkillDraft` | pure code. `422` if any id is not `accepted` |
| `POST /repos/:id/conventions/skill` | `ConventionSkillCreate` → `201 Skill` | one transaction: `skills` (`source: 'extracted'`, `type: 'convention'`, `evidence_files`) and `skill_versions` v1. No agent links: linking goes through the agent's Skills tab. `422` if any candidate is not `accepted`, `409` if the name is taken |

## Pipeline — `service.ts`

1. **Sample, with no model involved.** The config globs `.eslintrc*`, `eslint.config.*`,
   `tsconfig*.json`, `.prettierrc*`, `prettier.config.*`, `.editorconfig`, `biome.json`
   are matched at the clone root and one level down (`server/`, `client/`, …). Add
   `getConventionSamples(repoId, 12)`. Each file is capped at 400 lines, or 12 KB for
   configs. Content is read through the same clone-reading helper repo-intel uses. The file
   list and sizes go to the run log.
2. **Classify.** The model comes from `getFeatureModelOverride(ws, 'conventions')`, falling
   back to the registry default. It is never a module constant (#53). Send one structured
   call. The prompt fences every file with `wrapUntrusted`, asks for 5–25 candidates,
   requires `evidence.snippet` to be a verbatim line, and forbids rules that only restate a
   config value already enforced by a linter.
3. **Verify, with no model involved** (`verify.ts`, pure). Drop the candidate if `path` is
   not in the sampled set. Otherwise search for the trimmed snippet within ±5 lines of
   `line`, then anywhere in the file. For a multi-line snippet, match its first non-blank
   line and check that the rest follow. On a hit, set `evidence_line_start` and
   `evidence_line_end` to the real range. On a miss, drop it. Also drop duplicates, meaning the same normalized rule text.
4. **Persist.** In one transaction, delete the repo's `pending` rows and insert the
   survivors, **except** those whose normalized rule, or whose evidence `path` + start line,
   matches an existing `rejected` or `accepted` row (#48). The evidence match keeps an edited
   rule's original wording from coming back. Build `evidence_url` on read from `repos.owner/name`,
   `last_indexed_sha`, `evidence_path` and the range (`#L<start>-L<end>`, or `#L<start>`
   when the range is a single line).

Normalized rule: lower-case, collapsed whitespace, trailing punctuation stripped.

## Skill draft (`draft.ts`, pure)

Follows the design's merged body:

````
# repo-conventions

House conventions for `<owner/name>`. Flag changes that violate any rule below and cite the
offending `file:line`.

## <Category>

### <rule-slug>

<rule>

Detected in `<path>:<start>-<end>`:

```
<snippet>
```
````

Rules are grouped under a `## <Category>` heading in enum order, and by confidence within
each category. The snippet fence is longer than any backtick run inside the snippet.
`rule-slug` is the first 4 words of the rule, kebab-cased. The default name is
`repo-conventions`, or `<name>-conventions` if that name is taken. The description is
`<N> house conventions extracted from <name>`.

## Tests

| File | Covers |
|---|---|
| `test/conventions-verify.test.ts` | exact line · near line · elsewhere in the file · multi-line snippet → correct range · missing snippet dropped · path outside the sample dropped · dedup |
| `test/conventions-draft.test.ts` | grouping, ordering, rejected never included |
| `test/conventions-extract.it.test.ts` | stubbed LLM plus a fixture clone: configs and top files sampled with no LLM call before step 2 · model taken from the Settings override · results persist · ReScan keeps accepted and rejected · rejected not re-proposed |
| `test/conventions-skill.it.test.ts` | creates the skill and v1 atomically · non-accepted id → 422 · duplicate name → 409 · skill appears in `GET /skills` |

## Acceptance

- [ ] `POST /repos/:id/conventions/extract` on an indexed repo returns verified candidates
      that are still there after a server restart.
- [ ] Every returned candidate's `evidence_url` opens the cited line on GitHub.
- [ ] `pnpm test`, `pnpm typecheck` and `pnpm arch:check` pass.

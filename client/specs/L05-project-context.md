# Project Context — client
Spec ID: SPEC-2026-10-16-project-context · Umbrella: [`specs/L05-project-context.md`](../../specs/L05-project-context.md) · Status: approved

## Scope
Covers AC-16–AC-29, AC-33–AC-37, AC-39–AC-54, AC-57,
AC-78–AC-80, AC-82–AC-86, AC-91 and AC-92 of the umbrella. The deferred umbrella criteria AC-31,
AC-32, AC-58, AC-60, AC-61 and AC-87 are carried by the deferred requirements at the end of the
Requirements section and are not part of this delivery.

Three surfaces: a new view-only **Project Context** page at `/repos/:repoId/context`, a
**Context** tab in the agent editor (`/agents/:id?tab=context`) and in the skill editor
(`/skills/:id?tab=context`, titled "Project context to use"), and changes to the **run trace**
drawer on the PR page. Every shape comes from `@devdigest/shared` (contracts in the server spec:
`ProjectContextList`, `ProjectContextFile`, `SpecFile`, `AgentContext`, `SkillContext`,
`ContextPathsInput`, `PromptAssembly`). The client never estimates tokens: every count is the
server's.

Design reference: N2b (Agent editor · Context), N2c (Skill editor · Project context to use), N6
(Project Context page), N10 (Run trace · Prompt assembly). The design shows the filled state only;
the other states are defined here.

## What already exists

| Piece | Where |
|---|---|
| `useContextFiles(repoId)` (`GET /repos/:id/context`, typed `SpecFile[]`) and `useReindexContext` (`POST …/context/reindex`, no server route) | `src/lib/hooks/context.ts` |
| `useRepoIntelStatus`, `useResyncRepoIntel` (`POST /repos/:id/resync`) | `src/lib/hooks/repo-intel.ts` |
| `useActiveRepo()` — the repo switcher's active repository | `src/lib/repo-context` |
| `activeKeyFor` maps `/context` → `context`; `shell.nav.context` = "Project Context" | `src/components/app-shell/helpers.ts`, `messages/en/shell.json` |
| `APP_NAV` — WORKSPACE holds only Pull Requests | `src/components/app-shell/nav.ts` |
| Agent editor tabs `config`, `skills`; the Skills tab (checkbox rows, filter, drag with keyboard sensor, optimistic save with rollback) | `src/app/agents/_components/AgentEditor/` |
| Skill editor tabs `config`, `preview`, `versions` (`SkillTab`) | `src/app/skills/_components/SkillDetail/` |
| `TraceBody` — "Specs read" row, a `PromptBlock` for `prompt_assembly.specs` labelled "Project context (dynamic)" | `src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/` |
| `Markdown` (react-markdown + remark-gfm, no raw HTML plugin; takes only `children`; its links allow `mailto:`, relative and other schemes and open in the same tab), `Drawer` (no Esc handling), `Modal`, `EmptyState`, `ErrorState`, `Skeleton`, `Badge` | `src/vendor/ui` (not edited) |
| `react-markdown` and `remark-gfm` as direct dependencies | `package.json` |
| `messages/en/context.json` with old keys for chunks, Re-index and Edit | `messages/en/context.json` |

## Requirements (EARS)

"The Context tab" below means both the agent's Context tab and the skill's Context tab.

| ID | Requirement | Covers |
|---|---|---|
| R-WEB-1 | WHEN `/repos/:repoId/context` opens, the Project Context page shall list every `documents` entry of `useContextFiles(repoId)` with its path, a type badge in the colour of its `kind` (see Placement) and `≈ <tokens> tokens`. | AC-16 |
| R-WEB-2 | WHEN the user selects a document row, the Project Context page shall load `GET /repos/:id/context/file?path=` and show `content` through the app's safe markdown component (R-WEB-48). | AC-17 |
| R-WEB-3 | The Project Context page shall render no New file, New folder, Upload, Edit or Delete control and no Preview/Edit switch. | AC-18 |
| R-WEB-4 | The WORKSPACE section of `APP_NAV` shall hold a `context` item (icon `Folder`, href `/repos/:repoId/context`) after Pull Requests. | AC-19, AC-91 |
| R-WEB-5 | The Project Context page footer shall show "`<N>` files · `<T>` tokens total", with N the number of listed documents and T `total_tokens`. | AC-20 |
| R-WEB-6 | WHEN the user presses Refresh, the Project Context page shall refetch `useContextFiles(repoId)`. | AC-21 |
| R-WEB-7 | WHEN the user types in the Project Context page's filter, the Project Context page shall keep only rows whose path contains the text, ignoring case. | AC-22 |
| R-WEB-8 | The Project Context page shall keep the selected path in the URL as `?path=<path>` and select it on load. | AC-23 |
| R-WEB-9 | IF `state` is `ready` and `documents` is empty, THEN the Project Context page shall show an `EmptyState` with "No markdown under `<roots>` in `<full_name>`", where `<roots>` is built from `ProjectContextList.roots` (each root followed by `/`, the last two joined by "or": "specs/, docs/ or insights/" for the defaults, "adr/" for a single root), and a Resync action that calls `useResyncRepoIntel`. | AC-24 |
| R-WEB-10 | WHILE `useContextFiles` is loading, the Project Context page and the Context tab shall show a `Skeleton`. | AC-25 |
| R-WEB-11 | IF `useContextFiles` fails, THEN the Project Context page and the Context tab shall show an `ErrorState` whose Retry refetches. | AC-26 |
| R-WEB-12 | WHILE `state` is `not_cloned`, the Project Context page and the Context tab shall show "Repository not cloned yet". | AC-27, AC-91 |
| R-WEB-13 | WHEN `capped` is true, the Project Context page shall show "Showing the first `<cap>` documents". | AC-28 |
| R-WEB-14 | WHEN a document is selected, the Project Context page shall show `used_by` as "Used by `<agents>` agents (`<via>` via skill) · `<skills>` skills", where agents = `agents_direct + agents_via_skill` (the server's counts: enabled and disabled agents and skills, "via skill" only through an enabled linked skill) and the parenthesis is shown only when `agents_via_skill` > 0. | AC-29 |
| R-WEB-17 | The agent editor's `TABS` shall be `config`, `skills`, `context`, in that order. | AC-33 |
| R-WEB-18 | The skill editor's `TABS` shall be `config`, `context`, `preview`, `versions`, in that order, and the Context tab's heading shall be "Project context to use". | AC-34 |
| R-WEB-19 | WHEN the user opens the Context tab, the Context tab shall list every document of the active repository's `useContextFiles` with a checkbox, its path, a type badge in the colour of its `kind` (see Placement) and a Preview button. | AC-35 |
| R-WEB-20 | The Context tab shall order rows as the attached paths in stored order, then the remaining documents by path. | AC-36 |
| R-WEB-21 | WHEN the user checks or unchecks a row, the Context tab shall send `PUT /agents/:id/context` or `PUT /skills/:id/context` with the new ordered `paths`. | AC-37 |
| R-WEB-22 | WHEN the user types in the Context tab's filter, the Context tab shall keep only rows whose path contains the text, ignoring case. | AC-39 |
| R-WEB-23 | WHEN the user presses Preview, the Context tab shall open a `Drawer` with the path, type badge, `≈ <tokens> tokens`, an Attach / Attached toggle that saves like the checkbox, and the content through the app's safe markdown component (R-WEB-48). | AC-40 |
| R-WEB-50 | WHILE the preview drawer is open, the preview drawer shall close when the user presses Esc. | AC-40 |
| R-WEB-24 | The Context tab shall show "≈ `<T>` tokens" under the list, where T is the sum of `tokens` of the attached documents found in the active repository. | AC-41 |
| R-WEB-25 | WHEN the user drops an attached row at a new position, by pointer or by keyboard, the Context tab shall save the paths in the new order. | AC-42, AC-53 |
| R-WEB-26 | WHILE the Context tab's filter is not empty, the Context tab shall disable dragging and show the hint that reordering is off while filtering. | AC-43 |
| R-WEB-27 | IF the tab's total exceeds `soft_cap_tokens`, THEN the Context tab shall show the total in the critical colour with an "over 4K soft cap" badge and leave the checkboxes enabled. | AC-44 |
| R-WEB-28 | IF the tab's total exceeds `run_cap_tokens`, THEN the Context tab shall show "A run inserts up to 16K tokens; it will skip: `<paths>`", naming the attached documents from the first one that crosses the cap to the last. | AC-45 |
| R-WEB-29 | IF an attached path is not in the active repository's `documents`, THEN the Context tab shall show it at its attached position with "not found in `<full_name>`", count it as 0 tokens, and keep its checkbox enabled for detaching. | AC-46 |
| R-WEB-30 | IF a document's `status` is `too_large` or `unreadable`, THEN the Context tab shall show "too large" or "cannot be read" on its row and enable its checkbox only while the document is attached, so that it can be detached and cannot be attached. | AC-47 |
| R-WEB-31 | IF a save fails, THEN the Context tab shall show the last list of attached paths the server confirmed for that agent or skill, drop the changes waiting to be saved, and show an error toast. | AC-48 |
| R-WEB-32 | WHILE a save is in flight for an agent or a skill, the Context tab shall send no second save for that owner, collapse every change made meanwhile into the latest list shown, and send that list once, after the save in flight succeeds. | AC-49 |
| R-WEB-33 | IF no row matches the filter, THEN the Context tab shall show "No documents match '`<text>`'". | AC-50 |
| R-WEB-34 | IF `useActiveRepo()` has no repository, THEN the Context tab shall show "Add a repository" with a link to the onboarding route. | AC-51 |
| R-WEB-35 | The Context tab shall label each checkbox "Attach `<path>`" for assistive technology. | AC-52 |
| R-WEB-36 | The agent editor and the skill editor shall read and write `?tab=context` for the Context tab. | AC-54, AC-92 |
| R-WEB-37 | WHEN the preview drawer is open, the drawer shall show `used_by` in the R-WEB-14 format. | AC-57 |
| R-WEB-41 | WHEN a trace has `specs_read` entries, the "Specs read" row shall show each path with `≈ <tokens> tok` taken from the matching `prompt_assembly.specs_loaded` entry. | AC-78 |
| R-WEB-42 | WHEN `prompt_assembly.specs` is not null, Prompt assembly shall show a block labelled "Project context — attached specs (untrusted)" with `prompt_assembly.specs_tokens` as its meta. | AC-79 |
| R-WEB-43 | WHEN the user expands a document row under the Project context block, the trace drawer shall show that entry's `text` with Copy and fullscreen actions. | AC-80 |
| R-WEB-44 | WHEN `prompt_assembly.specs_skipped` is not empty, the Project context block shall list each skipped path with a readable reason. | AC-82 |
| R-WEB-45 | WHILE `prompt_assembly.specs_calls` is greater than 1, the Project context block's meta shall read "≈ `<specs_tokens>` tokens per call · sent in `<specs_calls>` calls". | AC-83 |
| R-WEB-46 | IF `specs_read` is empty, THEN the "Specs read" row shall show "none" and Prompt assembly shall show no Project context block. | AC-84 |
| R-WEB-47 | WHEN a trace lacks `specs_tokens`, `specs_calls`, `specs_loaded` and `specs_skipped`, the trace drawer shall render as it does today. | AC-85 |
| R-WEB-48 | The Project Context page and the preview drawer shall render document content only through the app's safe markdown component in `src/components/`, which renders markdown with react-markdown and remark-gfm and no raw-HTML plugin (raw HTML shows as text), renders an `http:` or `https:` link as an anchor with `target="_blank"` and `rel="noopener noreferrer"`, and renders a link with any other scheme or a relative link as its plain text. | AC-86, AC-17, AC-40 |

R-WEB-50 carries umbrella NFR-7 (Esc closes the preview drawer): the vendored `Drawer` has no Esc
handling and is not edited, so the preview drawer handles the key itself.

### Deferred

Not part of this delivery; they come back with the deferred umbrella criteria they cover.

| ID | Requirement | Covers |
|---|---|---|
| R-WEB-15 | The Project Context page header shall show "read from `<ref.branch>` @ `<first 7 characters of ref.sha>`", and no such line when `ref` is null. | AC-31 (deferred) |
| R-WEB-16 | The Project Context page shall show a type filter with one option per distinct `kind` and its document count. | AC-32 (deferred) |
| R-WEB-38 | The agent's Context tab shall list `AgentContext.inherited` entries below the agent's attached rows, read-only, marked "via skill `<skill_name>`", and add their tokens to the total. | AC-58 (deferred) |
| R-WEB-39 | The Context tab shall show each row's `≈ <tokens> tokens`. | AC-60 (deferred) |
| R-WEB-40 | IF the active repository is ready and has no documents, THEN the Context tab shall show an `EmptyState` with a link to `/repos/:repoId/context`. | AC-61 (deferred) |
| R-WEB-49 | IF a path does not fit its row, THEN the row shall elide the middle of the path and show the full path in a `title` tooltip. | AC-87 (deferred) |

## Route and data

| Data | Source | Hook (`src/lib/hooks/`) |
|---|---|---|
| document list | `GET /repos/:id/context` → `ProjectContextList` | `useContextFiles(repoId)` in `context.ts` — retyped; key `["context", repoId]` |
| one document | `GET /repos/:id/context/file?path=` → `ProjectContextFile` | `useContextFile(repoId, path)` — new, key `["context-file", repoId, path]`, enabled when both are set |
| agent attachments | `GET` / `PUT /agents/:id/context` → `AgentContext` | `useAgentContext(agentId)`, `useSetAgentContext(agentId)` — new, key `["agent-context", agentId]` |
| skill attachments | `GET` / `PUT /skills/:id/context` → `SkillContext` | `useSkillContext(skillId)`, `useSetSkillContext(skillId)` — new, key `["skill-context", skillId]` |
| resync | `POST /repos/:id/resync` | `useResyncRepoIntel(repoId)` — existing |
| active repository | the repo switcher | `useActiveRepo()` — existing |

`useReindexContext` is removed: its route does not exist and nothing calls it. The set mutations
show the new list at once, run one save at a time per agent or skill, collapse the changes made
while a save is in flight into the latest list, and on failure show the last list the server
confirmed and drop the waiting changes (R-WEB-31, R-WEB-32); `useSetAgentSkills` has no such
queue, so it is not the model here. On success they invalidate `["context-file"]` (the "Used by"
counts). With `inherited` deferred, a skill's save does not invalidate `["agent-context"]`.
Changing the active repository changes `repoId`, so the Context tab lists the new repository's
documents; the stored paths do not change.

## Placement

| Surface | Folder |
|---|---|
| Project Context page | `src/app/repos/[repoId]/context/page.tsx` (thin) + `_components/ProjectContextView/` (list, filter, footer, preview pane) |
| The shared attach list (rows, filter, drag, totals, caps, states) and the preview drawer | one shared component that both editors import. It sits outside both routes' `_components/`, because a route may not import a sibling route's components; placed per the `frontend-ui-architecture` skill |
| Safe markdown component | a new app-level component folder in `src/components/` (kebab-case, like its siblings), used by the page and the preview drawer; `src/vendor/**` stays untouched |
| Agent Context tab | `src/app/agents/_components/AgentEditor/_components/ContextTab/` |
| Skill Context tab | `src/app/skills/_components/SkillDetail/_components/ContextTab/` |
| Trace changes | `RunTraceDrawer/_components/TraceBody/` and a new `_components/ProjectContextBlock/` that renders one row per `specs_loaded` entry with the existing `PromptBlock` |

The page has two columns, like N6. The left column holds the header (repository name and
Refresh), the filter and the document list, with the footer at the bottom. The right column holds
the selected document's path, its type badge, its tokens, "Used by …" and the rendered content.
There is no COVERAGE ring; the "read from" line and the type filter are deferred.

Type badge colours: `specs` accent, `docs` `#10b981`, `insights` `#f59e0b` (design); any other
`kind` (a custom search root) gets a neutral badge in the secondary text colour (user answer,
2026-10-16).

## Strings

- `messages/en/context.json` — rewritten for the page and the tabs. The keys for `chunks`,
  `reindex`, `indexing`, `indexStatus`, `mode.edit` and `editor.*` are removed. New keys cover the
  footer, Refresh, the filter, the empty (with the roots as a parameter), not-cloned,
  no-repository and cap states, "Used by", the soft-cap badge, the run-cap note, "not found in",
  "too large", "cannot be read", "Attach" / "Attached", the drag hint and the no-match text.
- `messages/en/agents.json` `editor.tabs.context` = "Context"; `messages/en/skills.json`
  `detail.tabs.context` = "Context".
- `messages/en/runs.json` — `trace.prompt.specs` = "Project context — attached specs
  (untrusted)", plus keys for the per-call meta, the skipped list and each skip reason.

## Tests

| File | Covers |
|---|---|
| `ProjectContextView.test.tsx` | R-WEB-1–R-WEB-3, R-WEB-5–R-WEB-14 with mocked hooks, including an empty state built from custom `roots` |
| the safe markdown component's test | R-WEB-48: raw HTML shown as text; `https:` link with `target` and `rel`; `javascript:`, `mailto:` and relative links not clickable |
| the shared attach list's test | R-WEB-19–R-WEB-35, R-WEB-37, R-WEB-50, with an agent owner and a skill owner; three or more rows for order and caps; an attached `too_large` row detachable; a failed save after queued changes |
| `AgentEditor.test.tsx`, `SkillDetail.test.tsx` | R-WEB-17, R-WEB-18, R-WEB-36 |
| `RunTraceDrawer.test.tsx` | R-WEB-41–R-WEB-47, including a trace fixture without the new fields |
| `nav` / app-shell test | R-WEB-4 |

Component tests mock `fetch`; a behaviour that only fails against a real server belongs in an
`e2e` flow, which `test-writer` owns — umbrella AC-91 and AC-92 are such a flow, over R-WEB-4,
R-WEB-12 and R-WEB-36 on the seeded stack. `../../TESTING.md` decides where each test goes.

## Documentation

`README.md` — the UI route map gets `/repos/:repoId/context` and the two `?tab=context` tabs;
`docs/data-flow.md` — the four new query keys and their invalidations. Written by `doc-writer`.

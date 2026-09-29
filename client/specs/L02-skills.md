# L02 — Skills (client)

The SKILLS LAB sidebar section, the Skills and Agents screens in the design's list + detail
layout, the agent's Skills tab, and the trace additions.

Read [`specs/L02-skills.md`](../../specs/L02-skills.md) first. The endpoints are in
[`../../server/specs/L02-skills.md`](../../server/specs/L02-skills.md). The design is
[`docs/DevDigest Design (skills).html`](../../docs/DevDigest%20Design%20(skills).html);
artboard names are quoted in *italics* below. Structure follows the
`frontend-ui-architecture` skill: thin `page.tsx`, logic in `_components/<Name>/`, data
only through `src/lib/hooks/*`, strings through `next-intl`, and types from
`@devdigest/shared`.

## Sidebar (#6 #44)

| Section | Items |
|---|---|
| WORKSPACE | Pull Requests |
| SKILLS LAB | Skills `/skills` (g s) · Agents `/agents` (g a) · Conventions `/repos/:repoId/conventions` (g c) |

Add a `skillsLab` group to `APP_NAV` in `src/components/app-shell/nav.ts` and move
`agents` into it. The labels already exist in `messages/en/shell.json` (`navSection.skillsLab`,
`nav.skills`, `nav.conventions`). The cheat sheet and ⌘K palette follow automatically. The
breadcrumb reads *Skills Lab › Agents*, and `activeKeyFor` already maps `/skills` and
`/conventions`. Do not edit `src/vendor/ui/nav.ts`.

## Layout: list + detail

Both screens share one `ListDetailLayout` (`src/components/list-detail-layout/`). It has a
fixed-width left column (title, primary button, search, scrollable list) and a right pane.
The route decides what the pane shows:

| Route | Left column | Right pane |
|---|---|---|
| `/skills` | skill list | empty hint ("Select a skill…") or the empty state |
| `/skills/:id` | skill list, selected card highlighted | skill detail (#10 #25) |
| `/agents` | agent tiles | empty hint, or *Agents · empty state* when there are no agents |
| `/agents/:id` | agent tiles, selected tile highlighted | agent editor (#35) |

Selecting a card is a client-side navigation, so the list does not re-render or lose its
scroll. On narrow screens (< 1024 px) the pane stacks under the list.

## Data layer

| Hook file | Hooks | Invalidates |
|---|---|---|
| `src/lib/hooks/skills.ts` (new) | `useSkills` · `useSkill(id)` · `useSkillVersions(id)` · `useCreateSkill` · `useUpdateSkill` · `useDeleteSkill` · `useRestoreSkillVersion` · `useImportSkill` (multipart or `{ url }`) | `['skills']`, `['skills', id]`, `['skills', id, 'versions']`, and `['agents']` on delete (counts change) |
| `src/lib/hooks/agents.ts` | `useAgentSkills(id)` → `AgentSkill[]` · `useSetAgentSkills(id)` (optimistic, rollback on error) | `['agents', id, 'skills']`, `['agents']`, `['skills']` (`agent_count`) |

`src/lib/api.ts` needs a `FormData` path for the import upload, without a JSON
`content-type`.

## Skills

### List column (#9 #11 #22–24)

- Header: **Skills**, **Add Skill** (a primary button with a menu: **Create** / **Import**)
  (#11), and *Search skills…* (filters by name and description, client-side).
- `SkillCard`: name (mono), directive description (2-line clamp), type badge coloured per
  type (rubric blue, convention green, security red, custom grey), source label (*Manual* /
  *Imported* / *Extracted*), `v<n>`, "N agents" (#22), the enabled `Toggle` (#9), and a
  **Delete** icon (#23). The design's pull/accept figures are later-lesson work and are
  left out.
- **Delete**, from the card or from Config's danger zone, opens `ConfirmDeleteModal`: the
  name, "Removes it from all N agents. This can't be undone.", and Cancel · Delete · ✕
  (#24). This one component is shared with agents.

### Create modal (#12)

`SkillFormModal`: **Name**, **Description** (hint: *"Say what the reviewer must do, e.g.
'Flag …'"*), **Type** (`SelectInput` over `SkillType`), and **Skill body** in the shared
`SkillBodyEditor`. Create → `POST /skills` (`source: manual`) → navigate to `/skills/:id`.

### Import modal (#15)

`ImportSkillModal`, in two steps.
1. **Source**: a drop zone (`.md`, `.zip`) **or** a URL field (https).
2. **Preview** (mandatory): the rendered body as the agent will receive it; editable name,
   description and type; an **Ignored files** list (scripts and other archive entries,
   never executed or stored); any warnings; and a fixed notice: *"An imported skill
   becomes instructions in your agent's prompt. Read it before saving."* **Save** →
   `POST /skills` with the draft's `source`. **Back** returns to step 1.

### Detail pane — `/skills/:id` (#25–29)

Header: name, type badge, `v<n>`. Tabs in `?tab=`: **Config · Preview · Versions**. The
design's Evals and Stats tabs are left out (HW8).

- **Config** (*Skill Editor · Config*): Enabled `Switch`, Name, Description, Type, Skill
  body in `SkillBodyEditor`, and a *Change note* input shown only when the body is dirty.
  **Save skill** · **Cancel**, and the line *"Saving snapshots the body as v<n+1>"* when
  the body is dirty. Below that, a **Delete skill** danger zone.
- **Preview** (*Skill Editor · Preview*): *"Rendered as the reviewing agent receives it."*,
  then the body through `Markdown`, never raw text (#26).
- **Versions** (*Skill Editor · Versions*): *"Version history · N versions"*, then rows of
  `v<n>` · note · date. The current row has a **Current** badge. Every other row has
  **Diff** and **Restore** (#27–29). Diff expands an inline unified diff of that version
  against current, built with `diff` (`createTwoFilesPatch`, new dependency) and rendered
  with the existing `diff-viewer`. Restore confirms, then `POST …/restore`, and a new top
  version appears.

`SkillBodyEditor` (shared by create, Config and Conventions' modal) is a monospace
`Textarea` with line numbers. Its header shows `<name>.md`, an *unsaved* marker, and
`~N tokens` (`ceil(chars / 4)`, client-side, labelled approximate). Under it:
*"The only text sent to the model. Everything else is metadata."*

## Agents

### List column (#7 #32–34)

- Header: **Agents**, **Add Agent** (opens the existing `CreateAgentModal`), and *Search
  agents…*.
- `AgentCard` (*Agent Editor · Config*, left column): name, enabled `Toggle`, description
  (1-line clamp), a model chip, a "N skills" chip from `agent.skill_count`, and a
  **Delete** icon → `ConfirmDeleteModal` instead of today's `window.confirm` (#33 #34). The
  design's runs/accept/cost row is later-lesson work.
- Empty state (*Agents · empty state*): *"No agents yet"*, the explanation, and **Create
  your first agent**.

### Detail pane — `/agents/:id` (#35–37)

Header: an agent icon and name. Tabs: exactly **Config** and **Skills**. The design's
Evals, Stats and CI tabs are left out.

- **Config**: the existing `ConfigTab`. Check it has Enabled, Name, Description, Provider,
  Model (dynamic list), Strategy and System prompt (#36). Add the design's hint under the
  system prompt: *"Loaded as the static system message. Skills are appended below it."*
- **Skills** (*Agent Editor · Skills*), as `_components/SkillsTab/`:
  - The heading **Skills**, a badge *"K of N enabled"*, and *Filter skills…* (#30).
  - The hint: *"Order matters — earlier skills appear earlier in the assembled prompt. Drag
    to reorder."*
  - One list of **every** skill in the workspace (#37). Checked (linked) rows come first in
    link order, then unchecked rows by name. Each row: drag handle ≡, checkbox, name
    (mono), type badge, and a muted *"disabled globally"* note when `skill.enabled` is
    false.
  - **Only checked rows can be dragged** (#31). Unchecked rows show no handle, which
    deliberately departs from the mock. Use `@dnd-kit/sortable` (new dependency, keyboard
    accessible). Dragging is disabled while the filter is non-empty.
  - Checking a skill appends it to the end of the order. Unchecking removes it. Every change
    sends the full ordered list of checked ids through `useSetAgentSkills`.

## Run trace (#19 #20)

In `TraceBody`, following *Run Trace · completed*:
- **Configuration**: a *Skills loaded* row listing `prompt_assembly.skills_loaded` as
  chips, in order. The row is hidden when the list is empty.
- **Prompt assembly**: the existing Skills `PromptBlock` gets a `~N tokens` badge from
  `prompt_assembly.skills_tokens`. Its expanded text shows one `### name (vN)` section per
  skill.

## Tests (colocated)

`SkillCard` (fields, toggle, delete opens confirm) · `ImportSkillModal` (file → preview →
ignored files listed → the save payload carries `source`) · `SkillsTab` (filter, no handle
on unchecked rows, checking sends the right ordered ids, "K of N" badge) · `VersionsTab`
(Diff and Restore calls, Current badge) · `SkillBodyEditor` (token count, unsaved marker) ·
`ConfirmDeleteModal` (Cancel, ✕ and Delete) · `TraceBody` (Skills loaded row and token
badge).

## Acceptance

- [ ] Every surface above matches its design artboard, minus the later-lesson tabs and
      metrics, and `pnpm test` and `pnpm typecheck` pass.
- [ ] e2e `08-skills.flow.json`: create skill → check it on an agent → reorder → run review
      → the trace shows *Skills loaded* and the Skills block with a token count.

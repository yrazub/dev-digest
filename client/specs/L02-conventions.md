# L02 — Conventions Extractor (client)

The `/repos/:repoId/conventions` screen: scan, review candidates, and create a skill from
the accepted ones.

Read [`specs/L02-conventions.md`](../../specs/L02-conventions.md) first. The endpoints are in
[`../../server/specs/L02-conventions.md`](../../server/specs/L02-conventions.md). The sidebar
item and the shared `SkillBodyEditor` come from [`L02-skills.md`](L02-skills.md). The design
is the artboards *Conventions (N7)*, *Conventions · Create skill (merged from accepted)* and
*Conventions · empty* in
[`docs/DevDigest Design (skills).html`](../../docs/DevDigest%20Design%20(skills).html).

## Data layer — `src/lib/hooks/conventions.ts` (new)

`useConventions(repoId)` → `{ scan, candidates }` · `useExtractConventions(repoId)` ·
`useUpdateConvention(repoId)` (optimistic status change) ·
`useConventionSkillDraft(repoId)` · `useCreateConventionSkill(repoId)`. The last one
invalidates `['skills']` as well as its own key.

## Empty state (*Conventions · empty*)

*"No conventions extracted yet"*, the design's line (*"Scan the repo to surface
house-rules — naming, error handling, structure — each backed by evidence you can turn into
a Skill."*), and the primary button **Run Scan** (#45; the design labels it *Run
extraction*). A non-indexed repo (`409`) shows "Index this repo first" instead of the
button.

## Scanned state (*Conventions (N7)*)

```
Conventions in <name>                                  [ReScan] [Deselect all] 3 of 12 accepted [Create skill]
Detected from 14 sample files · last scan 1h ago
┌───────────────────────────────────────────────────────────────────────────────┐
│ [naming]  Always use async/await instead of .then() chains                    │
│ [src/api/users.ts:23-31 ↗]                                                    │
│   const user = await db.users.find(id);                                       │
│ Confidence 91%                              [Accept] [Reject] [Edit]          │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **ReScan (#45)** sits in the header once a scan exists. It is a separate button from the
  empty state's Run Scan. Both show a spinner and disable while the synchronous request runs
  (up to 2 min). After the scan, the stats line reads *"… sampled · N proposed · N verified ·
  N dropped · model"*.
- **Index line**: under the title, *"Index: <sha7> · updated <ago>"* with **Resync index**
  (`POST /repos/:id/resync`). The scan reads DevDigest's clone, so a stale index means a scan
  of old code. Resync runs in the background; the line polls `index-state` until the index row
  changes (then a toast says to ReScan) or 60 s pass (the index was already current, or the
  repo has no clone). A never-indexed repo shows *"not indexed yet"*.
- **Cards (#46 #47)**: category chip, rule, evidence as a mono button
  `path:start-end` that opens `evidence_url` in a new tab, the snippet in a code block, and
  *Confidence NN%*. **Accept** becomes **Accepted** (filled) on click, and clicking again
  undoes it. **Reject** hides the card immediately. **Edit** is not in the mock and is
  added for #47 and #49.
- **Edit (#49)** turns that card's rule into a `Textarea` and its category into a select,
  in place, with Save and Cancel. No navigation.
- **Rejected (#48)** cards do not come back after a reload or ReScan. A "Show rejected (N)"
  link at the bottom lists them with Restore, for mistakes.
- **Header counters**: *"K of N accepted"* and **Deselect all**, which returns every
  accepted card to pending. There is no confirm, because the change is undone by accepting again.
- **Create skill (#50)** is visible only when K ≥ 1. This follows the criteria, where the
  mock shows it always.

## Create skill modal (*Conventions · Create skill*, #41 #51)

It calls `skill-draft` with the accepted ids, then shows:

- Title *"Create skill from conventions"*, and the draft name as a subtitle.
- The intro *"Merged from K accepted conventions in <name>. Everything below is editable
  before you save."* This explains that the skill comes from conventions (#51).
- **Name** (default `repo-conventions`), **Description**, **Type** (`convention`,
  changeable), and **Enabled** (*"Whether this block is added to agents' prompts."*).
- **Skill body** in `SkillBodyEditor`, pre-filled with the merged draft, with its token
  count and unsaved marker. Under it: *"The only text sent to the model. Merged from the
  accepted rules + evidence — edit freely."* (#41)
- The footer *"Saved as v1 · added to Skills Lab"*, then **Cancel** · **Create skill**, plus
  ✕.
- On success the modal closes, a toast says *"Skill created"*, and a banner above the cards
  offers **Open skill** (→ `/skills/:id`) and **Add to an agent →** (→ `/agents`) (#52). The
  toast kit takes text only, hence the banner. A `409` duplicate name shows inline on the
  Name field.

## Tests (colocated)

`ConventionCard` (evidence href with a range, confidence %, Accept toggles, inline edit
save/cancel) · `ConventionsView` (Run Scan in the empty state and ReScan in the header,
rejected hidden, Create skill only when accepted ≥ 1, "K of N accepted") ·
`CreateConventionSkillModal` (draft prefill, the payload carries the edited body, name and
enabled).

## Acceptance

- [ ] Scan → accept 3, reject 1, edit 1 → Create skill → the skill is on `/skills` with the
      edited body, and the rejected rule is absent from it.
- [ ] Reload keeps statuses, and ReScan does not bring back rejected candidates.
- [ ] `pnpm test` and `pnpm typecheck` pass.

# HW2 video — short script (~6–8 min)

Before recording: `./scripts/dev.sh`, have a small `my-skill.md` (or `.zip`) ready.
Pause the recording while a review runs (~40 s).

## 1. Skills (~1.5 min)

1. Sidebar → **SKILLS LAB → Skills**. Show the cards: name, type, description, toggle,
   version, agent count.
2. Click a card → preview opens in the side panel.
3. **+ → Create** → fill name, description, type, markdown body → save.
4. **+ → Import** → drop `my-skill.md` → preview → save. Its card shows source "imported".

## 2. Agents — assign a skill (~1.5 min)

1. **SKILLS LAB → Agents** → show the tiles (name, model, toggle, skill count).
2. Open **Test Quality Reviewer** → tabs **Config** and **Skills**.
3. **Skills** tab: all skills are listed → search for the new skill → toggle it on.
4. Drag `edge-cases` above `branch-coverage` (only enabled skills can be dragged).

## 3. Conventions extractor (~2 min)

1. **SKILLS LAB → Conventions** → **Run Scan**.
2. The cards show the rule, source file and confidence %, with Accept / Reject / Edit.
3. **Edit** one card inline, **Reject** one, **Accept** two or three.
4. Reload the page → the rejected card is gone.
5. **Create skill** → the modal lets you edit the name, description and body → **Create**.
6. **Skills** page → the new `repo-conventions` skill is in the list.

## 4. Experiments (~2 min)

Use **PR #901** (happy-path test → Test Quality Reviewer) and
**PR #902** (breaking API change → API Contract Reviewer).

1. Open PR #901 → **Agent runs → Review runs**. Four runs already exist.
2. Open the trace of an **older** run: no Skills block, one vague finding.
3. Open the trace of a **newer** run: a Skills block with `branch-coverage` + `edge-cases`
   (~828 tokens), and findings that name the uncovered branches and the empty-input edge case.
4. Do the same on PR #902: without skills it's a miss; with the 4 API skills it flags the
   breaking change.
5. Live: press **Run Review** on PR #901 → open the new trace → the skills appear in the order
   you set in step 2.4.

## After recording

Put the skill order back, disable or delete the test skills.

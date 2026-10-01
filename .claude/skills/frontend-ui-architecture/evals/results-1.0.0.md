# Eval results: v1.0.0 (2026-09-27)

Each scenario in `evals.json` was run once with the skill (the agent read `SKILL.md` and the
linked references) and once as a baseline (skills forbidden), both on Claude Opus 5.5.
Triggering was checked separately: an agent saw only the `name` and `description` of every
skill in `.claude/skills/` and chose which to load. The prompts are hypothetical, so none of
the code was compiled or run. There is one run per arm, and the grading was not blind.

| # | Scenario | With skill | Baseline | Difference |
|---|---|---|---|---|
| 1 | helper placement | pass: colocated `helpers.ts`, `now` injected, promotion path one rung at a time | pass: colocated, with a test | small. The skill adds the promotion ladder and the rule IDs |
| 2 | cross-feature import | pass: firm violation, route composition or move to shared, lint zones; notes that `no-restricted-imports` cannot express the rule | pass, but hedged: offers a public `@/features/auth` barrel as an acceptable feature-to-feature path, and suggests `no-restricted-imports` | **moderate.** The skill gives a firm rule and the correct lint tool |
| 3 | logic extraction | pass: pure helpers and named constants beside the component, effect removed, `'use client'` dropped | pass: same refactor, but the helpers are promoted straight to the route's `_lib/` | small. The skill keeps the code colocated until a second consumer appears |
| 4 | aggregating barrel request | pass: declines, explains the module-graph cost, the mixed server/client problem and cycles, offers per-component `index.ts` plus a lint guard | **creates** `components/index.ts` (heavy components left out) | **large.** Only the skill run held the rule |
| 5 | negative trigger ("useEffect runs twice") | not loaded (the trigger check chose `react-best-practices`, or no skill) | — | correct |

Trigger check (7 prompts): `frontend-ui-architecture` was chosen for all five organization
prompts, and together with `react-best-practices` for the refactor that also touches effects.
It was not chosen for the `useEffect` question or the Postgres column question.

## Findings

- A strong model already knows most of this material. The skill's value is **consistency and
  firmness**: it states a single default instead of offering options (evals 2 and 4), keeps
  code colocated instead of promoting it early (eval 3), and names rules by ID in reviews.
- Triggering overlap: the description of `react-best-practices` also lists "code
  organization", so an agent may load that skill instead of this one for placement questions.
  To fix it, remove the phrase from that description or add a pointer to this skill there.

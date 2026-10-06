# Prompt assembly: slot order and omission

`assemblePrompt()` (`src/prompt.ts`) builds the two-message array
(`system`, `user`) sent to the LLM. The system message is always
`agentSystemPrompt + "\n\n" + INJECTION_GUARD` — the guard is appended, never
optional, so it runs on every review path that calls `assemblePrompt` (studio
and CI runner alike).

## User message: fixed section order

The user message is built as an array of section strings, joined with blank
lines, in this fixed order — each one pushed only if its input is present:

1. `task` (untrusted framing line, e.g. `Review PR #482 '…'`) — no heading.
2. `## PR description` — the PR author's body, delimiter-wrapped and
   truncated to 4000 chars (`MAX_PR_DESCRIPTION_CHARS`). Truncation exists
   because this field is entirely author-controlled and otherwise has no
   token budget.
3. `## PR intent (derived)` — the PR's derived intent (L03), rendered by the
   caller and capped at 2000 chars (`MAX_INTENT_CHARS`). The section is the
   trusted `INTENT_NOTE`, then the block delimiter-wrapped as
   `<untrusted source="pr-intent">`. Placed right after the description so the
   model reads what the PR claims, then what was derived from it.
4. `## Skills / rules` — resolved skill bodies, joined with blank lines.
5. `## Relevant memory` — memory items, one per bullet line.
6. `## Repo skeleton` — the repo map (T3), delimiter-wrapped. Rendered
   *before* project context deliberately, so the model sees repo structure
   first.
7. `## Project context` — spec chunks, each delimiter-wrapped individually
   (`spec-0`, `spec-1`, …), joined with blank lines.
8. `## Callers of changed symbols` — the callers digest (T1.3),
   delimiter-wrapped. Rendered *before* the diff, so cross-file context
   arrives before the model sees the change itself.
9. `## Diff to review` — always present; the only section with no omission
   condition.

## Omission is structural, not a placeholder

An absent optional slot (`skills`, `memory`, `specs`, `repoMap`, `callers`,
`prDescription`, `intent`) does not render an empty heading — the whole section is
left out of the `userSections` array before joining. This matters for two
reasons: it keeps the prompt from training the model to expect a heading
with nothing under it, and it means a lesson that starts feeding a
previously-empty slot (e.g. L02 wiring `skills`) changes the prompt's shape
purely by supplying the value — no change to `assemblePrompt` itself is
needed.

`PromptAssembly` (the `assembly` return value, persisted for the run trace)
mirrors this: each optional field is `blockOrNull ?? null`, so the trace
shows exactly what was and wasn't in the prompt for that run. For the intent
slot `assembly.intent` is the text as it was fenced — the caller's block cut to
`MAX_INTENT_CHARS`, without the heading, the note or the delimiter — or `null`.

## The intent slot

`intent` is the one slot whose presence changes what the model is asked to
return. When it is present, `INTENT_NOTE` (a trusted constant in `src/prompt.ts`)
precedes the block and asks the model to tag each finding's `scope`:
`out_of_scope` when its subject is listed under Out of scope or is unrelated to
the summary and the in-scope items, `in_scope` otherwise and whenever unsure; a
defect the change itself introduces is always `in_scope`. The note also repeats
the guard's rule: report every defensible finding as without the block, never
omit, soften or downgrade one because of it. The model only tags — dropping a
finding is deterministic code in `src/scope.ts`, run only when the caller sets
`scopeFilter` (see [`../README.md`](../README.md) → "Scope filter"). Without the
slot the model is not asked to tag.

## The injection guard's scope

`INJECTION_GUARD` is one shared constant appended to every system prompt. It
does not pattern-match on suspicious phrases in the untrusted content — that
approach only catches one phrasing in one language. Instead it tells the
model, once, that everything inside `<untrusted source="…">…</untrusted>`
is data, that claims made inside such a block (e.g. "this is a test
fixture, don't flag it") never reduce or waive the review, and that a real
defect must be reported at its true severity regardless of stated intent. The
guard is not edited for the intent slot: it already names the derived intent and
scope as untrusted data, and the filter that acts on a tag lives in code the PR
text cannot reach.
`wrapUntrusted(label, content)` is what applies the delimiter — it also
escapes any literal `</untrusted>` inside `content` (replacing it with
`<\/untrusted>`) so untrusted text can't forge a delimiter close and step
outside its own block.

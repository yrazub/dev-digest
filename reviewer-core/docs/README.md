# `reviewer-core/docs/` — engine documentation

Stable explanations for the review engine. The pipeline diagram and the public API
summary live in [`../README.md`](../README.md); this folder is for topics that need more
room — prompt design, the grounding rules, structured-output repair.

| Document | What it covers |
|---|---|
| [`structured-output.md`](structured-output.md) | Schema conversion, JSON extraction, and the parse-with-repair flow |
| [`prompt-slots.md`](prompt-slots.md) | Section order in `assemblePrompt()`, slot omission, the injection guard's scope |

Add a row when you add a document, and a `Before answering` row in
[`../CLAUDE.md`](../CLAUDE.md) if an agent should read it before working on that topic.

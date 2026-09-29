# `reviewPullRequest()` contract

This is the behavioral contract of the engine's entry point
(`src/review/run.ts`), stated as invariants that must hold for every caller
(the studio server today; the CI runner from L06 onward) — not a feature
walkthrough. If a change breaks one of these, it is a regression even if
every existing test still passes on paper.

## Input → output

Given a `ReviewInput` (system prompt, model id, a parsed `UnifiedDiff`, an
injected `LLMProvider`, plus optional resolved skills/memory/specs/callers/
repo map), `reviewPullRequest()` returns a `ReviewOutcome` whose `review`
field is a `Review` — verdict, score, and a `findings` array — that has
already passed the grounding gate. Callers never see pre-grounding findings;
there is no "raw" review to opt into.

## Invariants

1. **Every finding in the returned `review.findings` cites a real location
   in the diff.** For diff-scoped findings, `[start_line, end_line]` must
   intersect at least one new-side line covered by an actual hunk in that
   file (`grounding.ts` → `buildLineIndex` + `rangeIntersects`). A finding
   whose file isn't even present in the diff is dropped regardless of kind.

2. **Full-file finding kinds are exempt from the line-range check, not from
   grounding entirely.** `secret_leak`, `lethal_trifecta`, `phantom`, and
   `hook` findings only need their `file` to appear in the diff — they are
   not tied to a specific hunk because the scanners that produce them
   analyze the whole file, not a diff range. This exemption is a fixed set
   (`FULL_FILE_KINDS`); adding a new full-file scanner kind means adding it
   to that set explicitly, not weakening the general line-range check.

3. **A finding that fails grounding is dropped, not surfaced as an error.**
   It appears in `ReviewOutcome.dropped` (finding + reason) purely for
   observability — an `info` event is emitted per drop, and the trace
   records it — but the run itself never fails because of a dropped
   finding, and the caller must not treat `dropped.length > 0` as a review
   failure.

4. **`review.score` is always recomputed from the post-grounding findings
   (`scoreFromFindings(ground.kept)`), never taken from the model's own
   self-reported score.** This holds even in map-reduce mode, where each
   chunk's partial `Review` carries a score the model produced for that
   chunk alone — `reduceReviews()` merges the partials' findings, but the
   final score assigned to the returned `Review` is still recomputed after
   grounding, not inherited from any partial or from the merge step.

5. **Mode selection (`single-pass` vs `map-reduce`) does not change the
   grounding contract.** Grounding is applied exactly once, after
   `reduceReviews()` merges chunk results — never once per chunk. A finding
   is graded against the *whole* diff's hunks regardless of which chunk
   produced it.

6. **The engine performs no I/O beyond the injected `LLMProvider`.** No
   database, GitHub, filesystem, or `process.env` access inside `run.ts`,
   `prompt.ts`, or `grounding.ts`. This is what makes `reviewPullRequest()`
   equally valid from the studio server (which persists + streams SSE) and
   the CI runner (which posts a comment + writes an artifact) — both supply
   their own `LLMProvider` and do their own side effects around the call,
   and this contract is what a test with a stubbed provider is actually
   allowed to assume.

7. **Cancellation is checked only at chunk boundaries.** `checkCancelled()`
   is called before each chunk's LLM call, not mid-call. A caller that
   needs sub-chunk cancellation is out of scope for this contract — the
   engine guarantees only that no *new* expensive call starts after
   cancellation is requested.

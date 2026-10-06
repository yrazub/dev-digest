# Insights — `@devdigest/reviewer-core`

Traps we have already hit in the engine. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the section list and the entry format, and the
`engineering-insights` skill for what is worth capturing.

---

## Codebase Patterns

- **2026-09-20** — `ReviewOutcome.grounding` is a **display string** (`"1/2 passed"`), and it is
  frozen by a contract: `RunStats.grounding` in `@devdigest/shared` is a `z.string()`, and
  `server/test/reviews.it.test.ts` asserts the literal `'1/2 passed'`. Anything that needs the
  gate's numbers must derive them alongside that field rather than reshaping it or parsing it
  back out. The gate's *reasons* are already exposed separately as `ReviewOutcome.dropped`.
  **Evidence 2026-09-26:** `src/grounding.ts:89` builds the string;
  `../server/src/vendor/shared/contracts/trace.ts:68` — `RunStats.grounding: z.string()`;
  `../server/test/reviews.it.test.ts:203` asserts `'1/2 passed'`; `src/review/run.ts:101` —
  `dropped`.

- **2026-10-05** — `FULL_FILE_KINDS` (`src/grounding.ts:16`) is now read by two gates: grounding and the scope filter (`src/scope.ts:2`). Adding a scanner kind there also exempts it from scope filtering — intended, but it is one edit with two effects.
- **2026-10-05** — `ReviewOutcome.scope` has three states (`src/review/run.ts:123`, `:232`): `null` (no tagged finding, filter off), `{ enabled: false, tagged, … }` (the model tagged, nothing filtered) and `{ enabled: true, … }`. A caller reads `scope?.enabled`; non-null does not mean the filter ran.
  The server executor sets `stats.scope_filtered` from `outcome.scope?.enabled` (`../server/src/modules/reviews/run-executor.ts`, `runOneAgent`).
- **2026-10-05** — `MockLLMProvider` answers every `completeStructured` call with the same fixture, so a map-reduce test built on it gets N copies of each finding and cannot tell "filtered once over the merged set" from "filtered per chunk". Override `completeStructured` per call and parse with `req.schema` (`sequenced`, `test/run.test.ts:429`).

## Session Notes

- **2026-10-05** — L03: the `intent` prompt slot and the scope filter after grounding (`src/scope.ts`).

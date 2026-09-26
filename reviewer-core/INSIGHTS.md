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

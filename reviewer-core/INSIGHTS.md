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

## Recurring Errors & Fixes

### A review run on OpenRouter stays "running" for 10–30+ minutes and then fails or is cancelled
**Date:** 2026-10-02
**Cause:** two gaps together. (1) Review calls sent no `max_tokens`, and some upstream
providers (OpenInference for `deepseek/deepseek-v4-flash`) occasionally never close the
structured JSON: the OpenRouter logs showed 17,794 and 38,684 output tokens for one review
(normally ~3k) with an empty finish reason, at ~35 tok/s, i.e. 8–17 minutes of billed
generation. (2) The OpenAI SDK's `timeout` stops at response headers
(`fetch(...).finally(() => clearTimeout(timeout))` in `openai/core.js`), and OpenRouter
sends headers at once and keeps the body open while the model runs, so no timer ever fired.
**Fix / rule:** every review call carries `maxTokens` (`DEFAULT_REVIEW_MAX_TOKENS`) and
`timeoutMs` (`DEFAULT_REVIEW_CALL_TIMEOUT_MS`), and `OpenRouterProvider.withDeadline` passes an
`AbortSignal` that covers the body. A capped reply that is still invalid JSON
(`finish_reason === 'length'`) fails at once instead of being re-prompted. The server adds a
run deadline and aborts the in-flight call on Cancel (`RunBus.signalFor`). Check
openrouter.ai/logs (output tokens, finish reason, provider) before blaming "slowness".
**Evidence:** `src/llm/openrouter.ts` `withDeadline` and the `finish_reason === 'length'`
guard; `src/review/run.ts` `DEFAULT_REVIEW_MAX_TOKENS`; `test/openrouter.test.ts`.

## Tool & Library Notes

- **2026-10-02** — OpenRouter's `provider.ignore` matches the provider slug (`open-inference`,
  the `tag` prefix from `GET /api/v1/models/<id>/endpoints`) or the API name (`OpenInference`),
  but silently ignores the logs page's display name with a space (`Open Inference`): a request
  with `ignore: ["Open Inference"]` was still routed there. Verify an ignore entry with a few
  live calls and read `provider` in the response (`src/llm/openrouter.ts` `ignoreProviders`;
  the default lives in `../server/src/platform/config.ts` `OPENROUTER_IGNORED_PROVIDERS`).
- **2026-10-02** — Review limits re-sized from measured runs: `DEFAULT_REVIEW_MAX_TOKENS` 8k → 16k
  and `DEFAULT_REVIEW_CALL_TIMEOUT_MS` 3 → 5 min. DeepSeek V4 Flash counts reasoning as output, so
  output grows with the diff even with zero findings (6,815 tokens on an 82-file PR); at a slow
  provider's ~27 tok/s a 3-minute call caps output near 4,800 tokens. OpenRouter calls also send
  `provider.sort: 'throughput'` (the same model ran at 27 vs 100 tok/s across providers)
  (`src/review/run.ts`, `src/llm/openrouter.ts`).

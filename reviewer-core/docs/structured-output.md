# Structured output: schema, extraction, repair

`src/llm/structured.ts` is what turns a model's free-text completion into a
validated `Review` object. Both providers (`llm/openrouter.ts` and the
studio's OpenAI/Anthropic clients) go through it — it is provider-agnostic.

## Schema conversion

`toJsonSchema(schema, name)` reuses OpenAI's own Zod → JSON Schema converter
(`zodResponseFormat`) rather than a bespoke one, so the schema handed to the
model is exactly what the OpenAI SDK would generate for
`response_format: json_schema`. The same `JsonSchema` value is reused for
Anthropic too, as the `input_schema` of a forced tool call — one schema
definition, two different "make the model emit this shape" mechanisms.

## Extraction

`extractJson(text)` is a fallback, not the primary path (see below). It
handles model output that isn't pure JSON:

1. Strips a ```` ```json ... ``` ```` fence if present.
2. Otherwise finds the first `{` or `[` and walks forward counting brace/
   bracket depth until it returns to zero, returning that balanced span.
3. If no opening brace/bracket exists at all, returns the trimmed text
   unchanged (so the caller's `JSON.parse` fails with a clear error rather
   than this function silently swallowing the problem).

## Parse-with-repair

`parseWithRepair(schema, raw)` is the actual entry point `review/run.ts`
calls. Its parse order matters:

1. **Try `JSON.parse(raw.trim())` directly first.** In strict
   `json_schema` mode the model's raw output usually already *is* pure JSON,
   with no fence and no leading prose.
2. **Only on failure, fall back to `extractJson(raw)`** and parse that. The
   fallback isn't tried first because it can be fooled by a `` ``` `` fence or
   a `{` that appears *inside* a JSON string value — for example a finding's
   `rationale` that itself contains a markdown code block. Extracting on
   the first `{` in that case would grab the wrong span.
3. If JSON parsing still fails, or the parsed value fails `schema.safeParse`,
   the function returns `{ ok: false, error, repromptMessage }` instead of
   throwing. `repromptMessage` is written to be re-sent to the model
   verbatim: a JSON-parse failure asks for "ONLY a single valid JSON object,
   no prose"; a schema failure lists every Zod issue path + message so the
   model can see exactly which field it got wrong.

The retry loop itself — how many times a reprompt is attempted before giving
up — lives in the LLM provider (`llm/openrouter.ts` and its studio
equivalents), which calls `parseWithRepair` after each attempt and decides
whether to resend `repromptMessage`. `structured.ts` only classifies
success/failure and drafts the correction; it never retries on its own.

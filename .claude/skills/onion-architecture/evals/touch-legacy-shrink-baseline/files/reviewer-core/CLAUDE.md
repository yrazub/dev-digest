# `@devdigest/reviewer-core` - the review engine (test fixture)

Pure engine: diff -> prompt -> LLM -> findings. The server imports `src/index.ts` only.
Everything it needs from the outside world arrives as an argument or an injected `LLMProvider`.

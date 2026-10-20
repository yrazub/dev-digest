# Workflow retro ledger

One row per `/workflow-retro` run, so multi-agent runs can be compared over time. Token columns
count sub-agents and main sessions together; "cache hit" is cache-read ÷ (input + cache-read +
cache-write).

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
| 2026-10-17 | l05-project-context (spec → plan → execute-plan 14 phases, 4 sessions) | 102 sub-agents (0 nested) + 4 main sessions | 505M total: 479M cache-read + 25M cache-write + <0.01M fresh → 1.33M out | 95% | ~28 h main-session time (incl. idle) | 1.0–1.1x | n/a | Honor the 3-phase `/execute-plan` CHECKPOINT and run the final checks in a fresh chat: the one orchestrator chat that ran phases 7–14 plus final checks read 202M cached tokens, ~43% of the whole feature |
| 2026-10-19 | l05-pr-brief (spec → plan → execute-plan 11 phases incl. 2 fix phases → final checks → PR, 6 sessions) | 49 sub-agents (0 nested) + 6 main sessions | 348.5M total: 327.8M cache-read + 20.6M cache-write + <0.01M fresh → 1.01M out | 94% | ~21 h sub-agent wall over 6 sessions (incl. idle) | 0.25–1.0x | ≈ $231 API-equivalent (Opus 5.5 / Sonnet 5.5, 1 h cache writes at 2× input) | Add a layer/colocation self-check to the implementer brief and run architecture-reviewer after the last server and the last client phase — the two fix rounds were ≈ $41 |

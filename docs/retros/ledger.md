# Workflow retro ledger

One row per `/workflow-retro` run, so multi-agent runs can be compared over time. Token columns
count sub-agents and main sessions together; "cache hit" is cache-read ÷ (input + cache-read +
cache-write).

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
| 2026-10-17 | l05-project-context (spec → plan → execute-plan 14 phases, 4 sessions) | 102 sub-agents (0 nested) + 4 main sessions | 505M total: 479M cache-read + 25M cache-write + <0.01M fresh → 1.33M out | 95% | ~28 h main-session time (incl. idle) | 1.0–1.1x | n/a | Honor the 3-phase `/execute-plan` CHECKPOINT and run the final checks in a fresh chat: the one orchestrator chat that ran phases 7–14 plus final checks read 202M cached tokens, ~43% of the whole feature |

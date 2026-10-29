---
type: llm
focus: trace
weight: 1
---

server/INSIGHTS.md gains a new entry saying pnpm test silently excludes *.it.test.ts when Docker is not running (so a green run can skip integration tests), citing server/vitest.config.ts with a line number near the exclude line and the dockerAvailable symbol.

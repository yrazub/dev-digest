---
type: llm
focus: trace
weight: 1
---

The Drizzle unit-of-work implementation is constructed in runs/routes.ts (or the container) and passed to RunService; the service does not construct it.

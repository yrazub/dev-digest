---
type: llm
focus: trace
weight: 1
---

server/src/modules/runs/service.ts imports nothing from drizzle-orm or src/db, and it does not call db.transaction itself.

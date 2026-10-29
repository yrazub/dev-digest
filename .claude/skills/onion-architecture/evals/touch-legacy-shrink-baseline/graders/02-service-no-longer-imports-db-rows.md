---
type: llm
focus: trace
weight: 1
---

server/src/modules/reviews/service.ts no longer imports from src/db (including src/db/rows.ts) and no ReviewRow type is exposed by the service.

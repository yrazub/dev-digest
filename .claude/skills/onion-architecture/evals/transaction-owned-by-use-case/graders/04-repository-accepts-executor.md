---
type: llm
focus: trace
weight: 1
---

RunRepository can be constructed with a transaction executor (the db or a tx), so that the same repository code runs inside db.transaction; the Drizzle db.transaction call lives in the repository file or an adapter next to it, not in the service.

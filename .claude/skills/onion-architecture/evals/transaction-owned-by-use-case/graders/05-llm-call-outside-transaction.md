---
type: llm
focus: trace
weight: 1
---

runReview (the LLM call) happens before the transaction is opened, and nothing slow or external runs inside the transaction callback.

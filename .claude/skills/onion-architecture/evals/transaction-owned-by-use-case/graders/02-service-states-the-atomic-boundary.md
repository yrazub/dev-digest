---
type: llm
focus: trace
weight: 1
---

RunService expresses the 'these two writes land together' decision itself, by calling a port (a UnitOfWork-style run/transaction method, or an equivalent single port call) around saveFindings and markDone, rather than the decision being hidden inside one repository method that quietly does both.

---
tags: [onion-architecture]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Add GET /pulls/:id/reviews/:reviewId to the server: it returns one review of a pull request and answers 404 when there is none. Put it in the existing reviews module. I can't run anything here, so don't try to run pnpm.

Input files: the fixture repo under files/ (server/, reviewer-core/)

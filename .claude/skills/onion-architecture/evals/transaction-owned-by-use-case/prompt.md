---
tags: [onion-architecture]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

A run's findings get saved and then the run is marked done, as two separate writes in modules/runs. If the second write fails the run stays 'running' with its findings already saved. Fix that so the two writes land together or not at all. I can't run anything here, so don't try to run pnpm.

Input files: the fixture repo under files/ (server/, reviewer-core/)

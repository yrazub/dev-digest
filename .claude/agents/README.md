# Agents

Project subagents for Claude Code. Each `*.md` file here (except this one) defines one agent:
YAML frontmatter for its name, tools and model, then its system prompt. This file is the map
of the set — what each agent is for and how they fit together. The rules themselves live in
the agent files and are not repeated here.

## Catalog

| Agent | Responsibility | Writes files | Model |
|---|---|---|---|
| [researcher](researcher.md) | Answers a question with evidence, from the repository or from external sources | no | `sonnet` |
| [planner](planner.md) | Turns a request or spec into a Development Plan | no | `opus`, effort `high` |
| [implementer](implementer.md) | Builds an approved plan and proves it passes the existing checks | yes | `sonnet`, effort `high` |

Architecture review and security review are deliberately not in this set: they are done by
separate reviewers, after the implementer, through the
[`pr-self-review`](../skills/pr-self-review/SKILL.md) skill.

## How they fit together

```
request ──► planner ──► Development Plan (text)
                             │  user approves; the main session saves it
                             ▼
                  specs/<feature>-plan.md ──► implementer ──► Implementation report
                                                                   │
                        main session: commit · engineering-insights · /pr-self-review · push
```

`researcher` is independent of that chain: use it whenever a question needs investigation
before a plan or a decision.

### Feature workflow

Nothing in this chain is automatic. The agents cannot see each other's output, so the main
session carries each step:

1. Run `planner` with the request or the spec path.
2. Show the plan to the user in full and wait for approval. Resolve its "Open questions"
   first; a changed plan goes back through `planner`, not through hand edits.
3. Save the approved plan **verbatim** to `specs/<feature>-plan.md` and add a row to
   [`specs/README.md`](../../specs/README.md). The planner has no `Write` tool — if the main
   session does not save the plan, it exists only in the conversation.
4. Run `implementer` with the **path** to that file, not with pasted plan text.
5. Read the Implementation report. On `partial` or `blocked`, take it to the user instead of
   re-running blindly.
6. Commit phase by phase, and record the report's "Insight candidates" through the
   `engineering-insights` skill.
7. Run `/pr-self-review`. Push or open a PR only on a pass verdict.

Agents do not call each other. No agent has the `Agent` tool, so every handoff goes through
the main session, and what passes between `planner` and `implementer` is the plan file, not a
retelling of it. Each agent starts with no conversation history: whatever it needs must be in
the task it is given or in the repository.

## Permissions

| Agent | `tools` | Permission mode | Kept out on purpose |
|---|---|---|---|
| researcher | `Read, Grep, Glob, Bash, WebSearch, WebFetch` | inherited | `Write`, `Edit`, `Skill`, `Agent` |
| planner | `Read, Grep, Glob` | inherited | `Write`, `Edit`, `Bash`, `Skill`, `Agent`, web tools |
| implementer | `Read, Grep, Glob, Edit, Write, Bash, Skill` | `acceptEdits` | `Agent`, web tools |

What enforces what:

- **The `tools` list is the hard boundary.** `planner` cannot change a file because it has no
  tool that could. `researcher` has `Bash`, so its read-only behaviour rests on its prompt
  (inspection commands only).
- **`implementer`'s limits are prompt-level.** It is told not to commit, push, install
  unplanned dependencies, or edit `server/src/db/migrations/**`, lock files and
  `client/src/vendor/**`. Nothing blocks those edits mechanically; a `PreToolUse` path guard
  was considered and not added (root [`INSIGHTS.md`](../../INSIGHTS.md), Decisions,
  2026-10-04).
- **The push gate still applies.** The `PreToolUse` hook in
  [`.claude/settings.json`](../settings.json) denies `git push` and `gh pr create` without a
  passing `pr-self-review` verdict, whichever agent runs the command.
- **`acceptEdits` yields to the parent.** If the main session runs in a more permissive mode,
  that mode applies to the subagent instead.

No agent preloads skills through the `skills:` field. `implementer` loads them on demand with
the `Skill` tool; `planner` reads the `SKILL.md` files it needs with `Read`.

## Inputs and outputs

| Agent | Give it | It reads on its own | It returns |
|---|---|---|---|
| researcher | one concrete question, anchored to a package, feature, library or version | module `CLAUDE.md` and `README.md`, code, tests, git history; or official docs, changelogs, source repositories | a **research report** as its final message: Answer · Findings with evidence · References or Sources · Not found · Not checked |
| planner | a feature request, a spec path or a bug description | module `CLAUDE.md` files, `specs/`, `TESTING.md`, every relevant `INSIGHTS.md`, [`routing.json`](../skills/pr-self-review/routing.json), the matching `SKILL.md` files, the code it names | a **Development Plan** as its final message: Context read · Constraints · Phases (file table with skills and blocking rules, tests, `Verify`, `Done when`) · Out of scope · Risks · Open questions |
| implementer | the path to an approved plan | the plan, the `CLAUDE.md` of each touched package, the skills each phase names | changed files in the working tree, uncommitted, plus an **Implementation report**: Phases · Verification with command output · Deviations · Not done / blocked · Insight candidates · For reviewers |

All three reply with clarifying questions, or stop, rather than guess when the input is
missing or ambiguous. The exact templates are in each agent file under "Output" (for
`researcher`, under "Repository research" and "External research").

What the main session does with each result:

- **Plan** — show it to the user; once approved, save it to `specs/<feature>-plan.md` and add
  a row to [`specs/README.md`](../../specs/README.md).
- **Implementation report** — commit phase by phase, record the "Insight candidates" through
  the `engineering-insights` skill, then run `/pr-self-review` before any push.

## How `planner` and `implementer` share skills

The planner matches every file in the plan against the globs in
[`routing.json`](../skills/pr-self-review/routing.json) — the same table the review step uses —
and writes the matching skills, and the `critical_rules` IDs a reviewer blocks on, into each
phase's file table. The implementer loads exactly those skills, phase by phase. So the plan,
the implementation and the later review all answer to one set of rules, and a plan cannot ask
for something the review will reject.

A new skill therefore needs no change to either agent: add it to `routing.json` and both pick
it up.

## Sources for `planner` and `implementer`

The rules of these two agents were derived from a `researcher` pass on 2026-10-04. The pages
were read through `WebFetch`, which returns a summary rather than the raw page, so the wording
below is paraphrase; only the prompting page was checked against a raw copy.

| Rule in the agent | Applies to | Source |
|---|---|---|
| An explicit `tools` allowlist — omitting the field inherits every tool | both | [Sub-agents][sub] |
| No `skills:` preload — the field injects each skill's full body into every run and is not an allowlist; a subagent can still invoke skills through the `Skill` tool | both | [Sub-agents][sub], [Skills][skills] |
| The plan is self-contained and passed as a file — a subagent starts with no history, and a reference on disk avoids retelling | both | [Sub-agents][sub], [Multi-agent research system][multi] |
| Plan sections: files and interfaces, what is out of scope, a verification step at the end of each phase | planner | [Claude Code best practices][bp] |
| No plan for a change that fits in one sentence | planner | [Claude Code best practices][bp] |
| Strict output template, because the next step consumes it | both | [Skill authoring best practices][skill-bp] |
| Opus for planning, Sonnet for implementation; effort `high` where verification matters | both | [Model configuration][model] |
| Report evidence — the real output of each command — rather than asserting success | implementer | [Claude Code best practices][bp] |
| The agent that does the work does not grade it; review is a separate step | implementer | [Claude Code best practices][bp] |
| No changes beyond what the plan asks for | implementer | [Prompting best practices][prompt] |
| Rules are stated with their reason, without capitals or "MUST" | both | [Prompting best practices][prompt] |
| The prompts point to `CLAUDE.md` instead of copying it — subagents load it anyway | both | [Sub-agents][sub], [Claude Code best practices][bp] |
| A small, non-overlapping tool set | both | [Effective context engineering][ctx] |

Two rules have no primary source and are our own inference from the above:

- **"Treat the plan as authoritative; on a real conflict stop and report instead of
  re-planning"** (`implementer`) — inferred from the self-contained-spec guidance.
- **"Leave `skills:` empty and choose skills through `routing.json`"** — the docs describe
  what the field does, not how to choose among many skills.

Project-specific rules in both agents (contracts first, generated migrations, protected paths,
package managers, the verification commands) come from the root [`CLAUDE.md`](../../CLAUDE.md)
and the module `CLAUDE.md` files, not from external sources.

[sub]: https://code.claude.com/docs/en/sub-agents
[skills]: https://code.claude.com/docs/en/skills
[bp]: https://code.claude.com/docs/en/best-practices
[skill-bp]: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
[model]: https://code.claude.com/docs/en/model-config
[prompt]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[multi]: https://www.anthropic.com/engineering/multi-agent-research-system
[ctx]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

## Adding or changing an agent

- One file per agent, `<name>.md`, with `name` and `description` in the frontmatter. The
  description says what the agent does and when to use it — it is what the main session
  delegates on.
- Always set `tools`. Give the agent the fewest tools its job needs.
- Define the output template in the agent file, and add the agent to the tables above.
- Validate with `claude plugin validate .claude/agents/`.

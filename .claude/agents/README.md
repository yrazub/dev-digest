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
| [implementer](implementer.md) | Builds the code of an approved plan, phase by phase, and proves it passes the existing checks; writes no tests | yes | `sonnet`, effort `high` |
| [test-writer](test-writer.md) | Writes every test: adds the tests a phase needs and repairs the existing tests it broke | yes, tests only | `sonnet`, effort `high` |
| [architecture-reviewer](architecture-reviewer.md) | Checks a change or a module against the architectural boundaries and returns findings with evidence | no | `opus`, effort `high` |
| [plan-verifier](plan-verifier.md) | Checks finished code and tests against every item of the plan and the requirements | no | `opus`, effort `medium` |
| [doc-writer](doc-writer.md) | Describes an implemented feature in the documentation, with diagrams | yes, Markdown only | `sonnet`, effort `high` |

The blocking review and the security review stay with the
[`pr-self-review`](../skills/pr-self-review/SKILL.md) skill. `architecture-reviewer` is an
earlier, advisory, whole-change pass: it uses the same rule IDs and the same CRITICAL bar, and it
gates nothing.

These are Claude Code subagents for building this repository — not the product's review agents
([`docs/agent-prompts/`](../../docs/agent-prompts/)) and not the L06 "Plan Verifier" product
feature (root [`README.md`](../../README.md)).

## How they fit together

```
request ──► planner ──► Development Plan (text)
                             │  user approves; the main session saves it
                             ▼
                  specs/<feature>-plan.md
                             │
     ┌── for each phase, in order ────────────────────────────────────────┐
     │  implementer ──► Implementation report  (baseline, code, no tests) │
     │       ▼                                                            │
     │  test-writer ──► Test report  (the phase is closed when it is green)│
     └────────────────────────────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
        plan-verifier              architecture-reviewer
      Verification report           Architecture review
              └──────────────┬──────────────┘
                             │  gaps ──► implementer (code) or test-writer (tests), then check again
                             ▼
                        doc-writer ──► Documentation report
                             │
     main session: commit · engineering-insights · /pr-self-review · push
```

`researcher` is independent of that chain: use it whenever a question needs investigation
before a plan or a decision. `test-writer` can also be used outside the chain — to cover existing
code, or test-first for a bug: `test-writer` writes the failing reproduction, `implementer`
fixes the code, `test-writer` confirms it is green.

### Feature workflow

Nothing in this chain is automatic. The agents cannot see each other's output, so the main
session carries each step:

1. Run `planner` with the request or the spec path.
2. Show the plan to the user in full and wait for approval. Resolve its "Open questions"
   first; a changed plan goes back through `planner`, not through hand edits.
3. Save the approved plan **verbatim** to `specs/<feature>-plan.md` and add a row to
   [`specs/README.md`](../../specs/README.md). The planner has no `Write` tool — if the main
   session does not save the plan, it exists only in the conversation.
4. For each phase of the plan, in order:
   1. Run `implementer` with the plan path and the phase number. On the first phase it runs the
      baseline; from the second phase on, tell it that the previous phase closed green and paste
      the closing result lines, so it skips the baseline. A red baseline stops it: take that to
      the user.
   2. Read the Implementation report. On `partial` or `blocked`, take it to the user instead of
      re-running blindly.
   3. Run `test-writer` with the plan path, the phase number and the report's "Existing tests
      failing" table. For a phase that only adds tests, skip 1 and 2.
   4. The phase is closed only when the Test report's status is `green`. "Suspected
      regressions", "Suspected product bugs" and "Needs a production change" go back to
      `implementer` for the same phase, then `test-writer` runs again. Read "Existing tests
      edited" every time it is not empty: each row must quote a plan or spec item.
   5. Commit the closed phase, code and tests together.
5. After the last phase, run `plan-verifier` with the plan path (and the base ref when the
   branch is not cut from `origin/main`) and `architecture-reviewer` with the changed-file list,
   a patch file and the plan path. Both are read-only and independent, so they can run in
   parallel. The patch is made by the main session, outside the repository tree:
   `git diff "$(git merge-base origin/main HEAD)" > <scratch>/change.patch`; untracked new files
   are not in it and are named in the file list as new.
6. Read both reports. A `FAIL` or `INCOMPLETE` verdict, or a CRITICAL or WARNING finding, goes
   to the user. A code gap goes back to `implementer`; a missing test, or an existing test edited
   without a plan or spec item, goes to `test-writer`. After any fix, run step 5 again — a check
   made before the fix says nothing about the code after it.
7. Run `doc-writer` with the plan path and the changed-file list when the feature changed
   something the documentation describes. Apply the "For the main session" items of its report
   yourself.
8. Commit what is left, and record the "Insight candidates" of the implementer and the
   test-writer through the `engineering-insights` skill.
9. Run `/pr-self-review`. Push or open a PR only on a pass verdict. `architecture-reviewer` does
   not replace this step and its report is not a verdict.

Agents do not call each other. No agent has the `Agent` tool, so every handoff goes through the
main session; what passes between agents is the plan file and the report sections named above,
carried by the main session. Each agent starts with no conversation history: whatever it needs
must be in the task it is given or in the repository.

## Permissions

| Agent | `tools` | Permission mode | Kept out on purpose |
|---|---|---|---|
| researcher | `Read, Grep, Glob, Bash, WebSearch, WebFetch` | inherited | `Write`, `Edit`, `Skill`, `Agent` |
| planner | `Read, Grep, Glob` | inherited | `Write`, `Edit`, `Bash`, `Skill`, `Agent`, web tools |
| implementer | `Read, Grep, Glob, Edit, Write, Bash, Skill` | `acceptEdits` | `Agent`, web tools |
| test-writer | `Read, Grep, Glob, Edit, Write, Bash, Skill` | `acceptEdits` | `Agent`, web tools |
| architecture-reviewer | `Read, Grep, Glob` | inherited | `Write`, `Edit`, `Bash`, `Skill`, `Agent`, web tools |
| plan-verifier | `Read, Grep, Glob, Bash` | inherited | `Write`, `Edit`, `Skill`, `Agent`, web tools |
| doc-writer | `Read, Grep, Glob, Edit, Write` | `acceptEdits` | `Bash`, `Skill`, `Agent`, web tools |

What enforces what:

- **The `tools` list is the hard boundary.** `planner` cannot change a file because it has no
  tool that could. `researcher` has `Bash`, so its read-only behaviour rests on its prompt
  (inspection commands only).
- **`architecture-reviewer` is read-only by its tool list,** like `planner`. `plan-verifier` has
  `Bash` to re-run the `Verify` commands, so its read-only behaviour rests on its prompt, like
  `researcher`.
- **`implementer`'s limits are prompt-level.** It is told not to commit, push, install
  unplanned dependencies, or edit `server/src/db/migrations/**`, lock files and
  `client/src/vendor/**`. Nothing blocks those edits mechanically; a `PreToolUse` path guard
  was considered and not added (root [`INSIGHTS.md`](../../INSIGHTS.md), Decisions,
  2026-10-04).
- **The test split and `doc-writer`'s scope are prompt-level too.** `implementer` writes no test
  files, `test-writer` writes no production code, and `doc-writer` writes Markdown documentation
  only. What catches a breach is `plan-verifier`'s "Existing tests changed" and "Scope" sections
  and a look at `git status`.
- **The push gate still applies.** The `PreToolUse` hook in
  [`.claude/settings.json`](../settings.json) denies `git push` and `gh pr create` without a
  passing `pr-self-review` verdict, whichever agent runs the command.
- **`acceptEdits` yields to the parent.** If the main session runs in a more permissive mode,
  that mode applies to the subagent instead.

No agent preloads skills through the `skills:` field. `implementer` and `test-writer` load them
on demand with the `Skill` tool; `planner`, `architecture-reviewer` and `doc-writer` read the
`SKILL.md` files they need with `Read`; `plan-verifier` uses no skills.

## Inputs and outputs

| Agent | Give it | It reads on its own | It returns |
|---|---|---|---|
| researcher | one concrete question, anchored to a package, feature, library or version | module `CLAUDE.md` and `README.md`, code, tests, git history; or official docs, changelogs, source repositories | a **research report** as its final message: Answer · Findings with evidence · References or Sources · Not found · Not checked |
| planner | a feature request, a spec path or a bug description | module `CLAUDE.md` files, `specs/`, `TESTING.md`, every relevant `INSIGHTS.md`, [`routing.json`](../skills/pr-self-review/routing.json), the matching `SKILL.md` files, the code it names | a **Development Plan** as its final message: Context read · Constraints · Phases (file table with skills and blocking rules, the test work order, `Verify (code)` and `Verify (phase)`, `Done when`) · Out of scope · Risks · Open questions |
| implementer | the path to an approved plan and the phase to build; from the second phase on, the statement that the previous phase closed green | the plan, the `CLAUDE.md` of each touched package, the skills each phase names | changed code in the working tree, uncommitted, no tests, plus an **Implementation report**: Phases · Baseline · Verification · Existing tests failing · Deviations · Not done / blocked · Insight candidates · For reviewers |
| test-writer | after a phase: the plan path, the phase and the implementer's "Existing tests failing" table; standalone: the behaviour to cover and where it lives; for a bug: the description and the expected behaviour; for a gap: the `plan-verifier` item IDs with their quoted requirements | the plan phase, the spec, `TESTING.md`, the module `CLAUDE.md` and `INSIGHTS.md`, the source under test, the nearest sibling test, the skills [`routing.json`](../skills/pr-self-review/routing.json) matches to the test files | test files in the working tree, uncommitted, plus a **Test report**: Tests written · Existing tests edited · Existing tests deleted · Suspected regressions · Suspected product bugs · Left failing, pre-existing · Verification · Needs a production change · Not covered · Insight candidates |
| architecture-reviewer | the mode (`change` or `audit`); for `change`, the changed-file list with new files marked and a patch file when there is one; for `audit`, a directory or module; optionally the plan path and the `pnpm arch:check` result line | root and module `CLAUDE.md`, `routing.json` and the architecture `SKILL.md` files it matches, the dependency-cruiser config and baseline, the architecture documents, the root and module `INSIGHTS.md`, the files in scope and their importers | an **Architecture review** as its final message: Findings · Pre-existing · Checked · Left to the machine check · Not checked |
| plan-verifier | the plan path, and the base ref when the branch is not cut from `origin/main` | the plan, the spec and its module specs, the root and package `CLAUDE.md`, the diff against the base, the code and tests; it re-runs the `Verify` commands | a **Verification report** as its final message: Plan items · Existing tests changed · Requirement items · Commands re-run · Scope · Gaps · Not verified, with a `PASS`, `FAIL` or `INCOMPLETE` verdict |
| doc-writer | the material (a plan path, a spec path or other text), the changed-file list, and whether the feature was verified | the material, the root `CLAUDE.md`, the `CLAUDE.md`, `README.md` and `docs/README.md` of each touched package, the code, the target document, the `mermaid-diagram` skill | Markdown documents in the working tree, uncommitted, plus a **Documentation report**: Documents written · Diagrams · Index rows added · Not documented · Unverified · For the main session |

All seven reply with clarifying questions, or stop, rather than guess when the input is
missing or ambiguous. The exact templates are in each agent file under "Output" (for
`researcher`, under "Repository research" and "External research").

What the main session does with each result:

- **Plan** — show it to the user; once approved, save it to `specs/<feature>-plan.md` and add
  a row to [`specs/README.md`](../../specs/README.md).
- **Implementation report** — read it, then pass its "Existing tests failing" table to
  `test-writer`; a `partial` or `blocked` status goes to the user.
- **Test report** — close the phase on `green`, or send the findings back to `implementer`; read
  "Existing tests edited" every time, since each row must quote a plan or spec item.
- **Verification report** — a `FAIL` or `INCOMPLETE` verdict goes to the user; code gaps go to
  `implementer`, test gaps to `test-writer`; check again after any fix.
- **Architecture review** — CRITICAL and WARNING findings go to the user. It is advice, not the
  `/pr-self-review` verdict.
- **Documentation report** — apply its "For the main session" items yourself.
- Commit the closed phase, record the "Insight candidates" through the `engineering-insights`
  skill, then run `/pr-self-review` before any push.

## How the agents share skills

The planner matches every file in the plan against the globs in
[`routing.json`](../skills/pr-self-review/routing.json) — the same table the review step uses —
and writes the matching skills, and the `critical_rules` IDs a reviewer blocks on, into each
phase's file table. The implementer loads exactly those skills, phase by phase. So the plan,
the implementation and the later review all answer to one set of rules, and a plan cannot ask
for something the review will reject.

Test files are not in the plan's file table. `test-writer` looks them up in the same
`routing.json` (`react-testing-library` for client tests) and reads `onion-architecture`'s
`references/testing-by-layer.md` for server and reviewer-core tests, which no skill is routed to.
`architecture-reviewer` uses the same table for the architecture skills, and `doc-writer` reads
`mermaid-diagram`.

A new skill therefore needs no change to any agent: add it to `routing.json` and they pick it
up.

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
| The agent that does the work does not grade it, and the agent that wrote the code does not write its tests; review is a separate step | implementer, test-writer | [Claude Code best practices][bp] |
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

## Sources for `test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer` and the test split

The rules below were derived on 2026-10-04. The pages were read through `WebFetch`, which
returns a model's summary rather than the raw page. Quoted strings were relayed by the
summariser and not checked against the raw pages, except the prompting best-practices quotes
marked "verbatim". "Inference" means no primary source states the rule; "project" means it comes
from this repository; "user decision" means the user settled it on 2026-10-04.

Each rule has an ID (C common, T test ownership, A `architecture-reviewer`, V `plan-verifier`,
D `doc-writer`), so a later change can say which rule it touches.

| Rule in the agent | Applies to | Source |
|---|---|---|
| **C1** A fresh context checks the work; the agent that did it does not grade it | plan-verifier, architecture-reviewer, the implementer / test-writer split | [Claude Code best practices][bp] |
| **C2** Flag only gaps that affect correctness or the stated requirements; "Report gaps, not style preferences" | plan-verifier, architecture-reviewer | [Claude Code best practices][bp] |
| **C3** Show evidence — the command and what it returned — rather than asserting success | all agents that run commands | [Claude Code best practices][bp] |
| **C4** "Never speculate about code you have not opened." | all | [Prompting best practices][prompt] |
| **C5** A subagent sees its prompt, the task, `CLAUDE.md` and a git status snapshot, not the conversation; a read-only reviewer uses `tools: Read, Grep, Glob`; a `Bash`-enabled agent can still write | all; tool sets | [Sub-agents][sub] |
| **C6** Hooks are deterministic, prompt rules are advisory | the limits above, under "What enforces what" | [Claude Code best practices][bp] |
| **C7** Explicit `tools`, no `skills:` preload, no `Agent` tool, strict output template, point to `CLAUDE.md` | all | project — the table above, root `INSIGHTS.md:262-278` |
| **T1** Tests and code are written by different agents in different contexts | implementer, test-writer | [Claude Code best practices][bp] — "have one Claude write tests, then another write code to pass them". The source describes test-first; tests after code, per phase, is the user decision. What is taken from the source is the separation. Test-first is kept for bugs: "write a failing test that reproduces the issue, then fix it" |
| **T2** A test is never weakened to get green; a test that looks wrong is reported | test-writer | [Prompting best practices][prompt] (verbatim): "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."; "Tests are there to verify correctness, not to define the solution."; "If … any of the tests are incorrect, please inform me rather than working around them." |
| **T2a** An existing test's expectation is changed only when a quoted plan or spec item changes that behaviour; it is deleted only when an item removes the behaviour; every such edit is listed with old, new and the item | test-writer | user decision. How it stays consistent with T2: the quote addresses an agent that edits tests so its own solution passes. Here the agent that writes the solution cannot edit tests at all, which is stricter than the quote; the agent that edits them did not write the code, changes an expectation only to the newly *specified* behaviour, and leaves any failure the plan does not explain in place and reports it — the "inform me rather than working around them" clause. Read literally the quote forbids any edit, so this is a deliberate narrowing, not something the source states |
| **T3** No tests for cases that cannot happen; do not chase every gap | test-writer | [Claude Code best practices][bp]; project — `TESTING.md:8-23` |
| **T4** Tests resemble how the software is used | test-writer | [Testing Library guiding principles][tl-principles] |
| **T5** Query priority: `getByRole` first, `getByTestId` last | test-writer | [Testing Library query priority][tl-priority]; project — `.claude/skills/react-testing-library/SKILL.md:280-305` |
| **T6** No implementation-detail tests; `userEvent` over `fireEvent`; `query*` only for absence; no side effects in `waitFor` | test-writer | secondary, by the library's author — [Testing implementation details][kcd-impl], [Common mistakes with React Testing Library][kcd-mistakes] |
| **T7** `vi.mock` is hoisted; reset mocks between tests; fake timers and stubbed globals do not reset on their own | test-writer | [Vitest mocking][vitest-mock] |
| **T8** Routes are tested through `app.inject()`, with no port | test-writer | [Fastify testing guide][fastify-test]; project — `testing-by-layer.md:12` |
| **T9** Testcontainers: the dynamically mapped port, never a fixed one | test-writer | [Testcontainers for Node][testcontainers] |
| **T10** Suite, suffix and doubles by layer; mock the outside world only | test-writer | project — `TESTING.md:14-21`, `:79-88`; `testing-by-layer.md:7-23` |
| **T11** A skipped integration file is not a pass, for a baseline or a phase verify | implementer, test-writer, plan-verifier | project — `server/INSIGHTS.md:136-156` |
| **T12** Testability seams are production code and are planned as implementer work | planner, implementer, test-writer | project — `adapter-implements-port`, `.claude/skills/onion-architecture/SKILL.md:105`; user decision |
| **T13** The implementer establishes a green baseline before it changes anything and does not start on a red one | implementer | user decision; no primary source in the research base |
| **T14** The implementer classes each failing existing test (expected, unexpected, pre-existing, unclassified) against the baseline; the class is a hint for `test-writer`, not a justification | implementer, test-writer | inference |
| **T15** A suspected product bug gets a failing test and a report, never a bent assertion; every test asserts an observable result; no whole-tree snapshots | test-writer | inference — nothing found in primary sources on tautological tests, snapshot abuse or tests that cannot fail |
| **A1** Validate each issue in a second pass; quote the exact rule; leave out linter-catchable problems and nitpicks; say so explicitly when the run is clean | architecture-reviewer | [Anthropic `/code-review` plugin][code-review-plugin] (summary) |
| **A2** Report only what you are confident of; fields: file, line, severity, category, description, recommendation, confidence; focus on what the change newly adds | architecture-reviewer | [Anthropic security-review prompt][security-review-prompt] |
| **A3** Finding fields: rule ID, message, location with line and snippet, level, baseline state | architecture-reviewer | [SARIF 2.1.0][sarif] |
| **A4** Explain why; facts over preference; do not demand speculative abstraction | architecture-reviewer | [Google eng-practices][eng-practices]; project — `dep-proportionate`, `.claude/skills/onion-architecture/SKILL.md:62` |
| **A5** What a dependency-cruiser rule can and cannot see | architecture-reviewer | [dependency-cruiser docs][depcruise] (rules-reference.md, cli.md, faq.md); project — `enforcement-dependency-cruiser.md:31-41` |
| **A6** Severity scale and the CRITICAL bar | architecture-reviewer | project — `critical-rules.md:3-24`, `routing.json:27-37`, `:45-54` |
| **A7** Client boundaries have no machine check | architecture-reviewer | project — `client/INSIGHTS.md:43-50` |
| **A8** The machine checker owns import-graph facts and the reviewer covers what a path rule cannot see; a zero-finding report lists what was checked | architecture-reviewer | inference |
| **A9** Pre-existing violations in a separate section rather than dropped | architecture-reviewer | inference — a design choice; the Anthropic prompts drop them |
| **V1** Check that every requirement is implemented, the listed edge cases have tests, and nothing outside the scope changed; report gaps, not style | plan-verifier | [Claude Code best practices][bp] — Anthropic's own plan-conformance prompt |
| **V2** Grade what was produced, not the path taken; give the judge a way out ("Unknown") | plan-verifier | [Demystifying evals for AI agents][evals] |
| **V3** Ground truth comes from the environment: tool results, code execution | plan-verifier | [Building effective agents][building] |
| **V4** A syntax-only check, or a command that failed to start, does not count; say what was not run and why | plan-verifier | [Prompting Claude Sonnet 5.5][sonnet-prompt] |
| **V5** A later agent sees progress and declares the job done; the checker does not edit the spec or the tests | plan-verifier | [Effective harnesses for long-running agents][harness] |
| **V6** Verification methods; a record names requirement, method, result; closure needs documented objective evidence | plan-verifier | [NASA SE Handbook 5.3][nasa] |
| **V7** A different model grades than the one that generated; detailed rubric; structured output | plan-verifier | [Develop tests][develop-tests] |
| **V8** Done is all-or-nothing | plan-verifier | [Scrum Guide][scrum] |
| **V9** The per-item table, the four statuses, and the PASS / FAIL / INCOMPLETE rule | plan-verifier | inference — the four-state vocabulary is an adaptation, not from a standard |
| **V10** Re-run the checks rather than trust a report; the reported baseline and the list of edited tests are claims, not evidence | plan-verifier | inference from C1, C3 and V3 |
| **V11** Every edited or deleted existing test is traced to a plan or spec item | plan-verifier | follows from T2 and T2a; inference |
| **D1** Choose the form by two questions; reference describes and only describes; no empty structures | doc-writer | Diátaxis — [compass][dx-compass], [reference][dx-reference], [how to use][dx-use] |
| **D2** Structure, runtime flows, cross-cutting concepts and decisions have different homes | doc-writer | [arc42][arc42]; project — the `docs/README.md` files |
| **D3** Only the diagrams that add value | doc-writer | [C4 diagrams][c4]; project — `.claude/skills/mermaid-diagram/SKILL.md:16-19` |
| **D4** Diagram type by content; no experimental types; fenced `mermaid` blocks render on GitHub | doc-writer | [Mermaid syntax reference][mermaid-syntax]; [GitHub diagrams][gh-diagrams] |
| **D5** Docs live, are reviewed and are versioned with the code | doc-writer | [Docs as code][wtd] |
| **D6** Active voice, sentence-case headings, descriptive link text, no pre-announcing | doc-writer | [Google developer style guide][google-style] |
| **D7** `CLAUDE.md` is always-loaded context, not documentation | doc-writer | [Claude Code best practices][bp] |
| **D8** Nothing beyond what was asked; no extra files | doc-writer | [Prompting best practices][prompt] |
| **D9** Which document owns which topic; index rows | doc-writer | project — `docs/README.md:3-15`, `server/docs/README.md:3-13`, `client/docs/README.md:3-15`, `reviewer-core/docs/README.md:3-13`, `e2e/docs/README.md:3-13`, the module `CLAUDE.md` routing tables |
| **D10** Document what the code does, not what the plan intended; unimplemented items go to the report; link instead of copying code | doc-writer | inference |

Rules with no primary source — our own inference or a user decision: T2a (a deliberate narrowing
of T2), T13, T14, T15, A8, A9, V9, V10, V11 and D10.

Topics no primary source covered: tautological tests, snapshot abuse and tests that cannot fail
(T15); a "single source of truth" rule and a diagram size limit for documentation, which were
looked for and not adopted as rules.

[tl-principles]: https://testing-library.com/docs/guiding-principles/
[tl-priority]: https://testing-library.com/docs/queries/about/#priority
[kcd-impl]: https://kentcdodds.com/blog/testing-implementation-details
[kcd-mistakes]: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
[vitest-mock]: https://vitest.dev/guide/mocking
[fastify-test]: https://fastify.dev/docs/latest/Guides/Testing/
[testcontainers]: https://node.testcontainers.org/features/containers/
[code-review-plugin]: https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/code-review/commands/code-review.md
[security-review-prompt]: https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/prompts.py
[sarif]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html
[eng-practices]: https://google.github.io/eng-practices/review/reviewer/
[depcruise]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/
[evals]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
[building]: https://www.anthropic.com/engineering/building-effective-agents
[sonnet-prompt]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5
[harness]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
[nasa]: https://www.nasa.gov/reference/5-3-product-verification/
[develop-tests]: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
[scrum]: https://scrumguides.org/scrum-guide.html
[dx-compass]: https://diataxis.fr/compass/
[dx-reference]: https://diataxis.fr/reference/
[dx-use]: https://diataxis.fr/how-to-use-diataxis/
[arc42]: https://docs.arc42.org/home/
[c4]: https://c4model.com/diagrams
[mermaid-syntax]: https://mermaid.js.org/intro/syntax-reference.html
[gh-diagrams]: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
[wtd]: https://www.writethedocs.org/guide/docs-as-code/
[google-style]: https://developers.google.com/style/highlights

## Adding or changing an agent

- One file per agent, `<name>.md`, with `name` and `description` in the frontmatter. The
  description says what the agent does and when to use it — it is what the main session
  delegates on.
- Always set `tools`. Give the agent the fewest tools its job needs.
- A checking agent gets no `Write` or `Edit`, and no `Bash` unless it has to run something. Only
  `test-writer` touches test files.
- Define the output template in the agent file, and add the agent to the tables above.
- Validate with `claude plugin validate .claude/agents/`.

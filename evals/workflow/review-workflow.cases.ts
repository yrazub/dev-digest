import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier: asserts that the real on-disk harness (CLAUDE.md files, skills and
 * subagents, loaded through settingSources:["project"]) behaves as documented. The judge is the
 * tool-call trace (files read, skills engaged, subagents launched), never the model's own words.
 * The sessions have a read-only allow-list (Read, Grep, Glob, Task, Agent, Skill).
 *
 * What is under test is the routing in the CLAUDE.md files. The root CLAUDE.md ("Before answering")
 * and each module CLAUDE.md (server/, client/, reviewer-core/) carry a table that says which
 * document to read first for a kind of task. A prompt therefore NEVER names the document: it
 * describes the task and asks the agent to follow this repo's own guidance, so a pass means the
 * routing worked, not that the model obeyed a file name.
 *
 * Budget: 8 cases, 9 Claude sessions (the contrast case runs two).
 *   - 2 x root routing (trace)
 *   - 2 x module routing, server and client (trace, module CLAUDE.md then the document)
 *   - 1 x contrast: real repo versus an empty directory
 *   - 2 x activation pair for engineering-insights
 *   - 1 x dispatch of architecture-reviewer
 */
export const cases: WorkflowCase[] = [
  // --- root CLAUDE.md routing: one table row per case ------------------------------------------
  {
    kind: "trace",
    name: "root routing: a Project Context change leads to docs/project-context.md",
    prompt:
      "I am about to change how a repository document reaches the review prompt and the run trace. " +
      "Before touching any code, follow this repo's own guidance on which document to read for " +
      "that, and read it.",
    expectFilesRead: ["docs/project-context.md"],
    maxTurns: 8,
  },
  {
    kind: "trace",
    name: "root routing: a testing question leads to TESTING.md",
    prompt:
      "I want to add a test for a new helper in the API. Follow this repo's own guidance on where " +
      "a test belongs and which kind to write, and read the document it points to.",
    expectFilesRead: ["TESTING.md"],
    maxTurns: 8,
  },

  // --- module CLAUDE.md routing: root -> module CLAUDE.md -> document -------------------------
  // Both hops are asserted: the package's own CLAUDE.md, then the document it routes to. A module
  // CLAUDE.md is not loaded until the agent works in that package, so reading it is the evidence
  // that the root table sent the agent there. (An open question without an instruction to read
  // makes the agent only advise reading it, which is why the prompts tell it to follow the guidance.)
  {
    kind: "trace",
    name: "server routing: a schema change leads through server/CLAUDE.md to server/docs/schema.md",
    prompt:
      "I need to add a column to a table in the API's database. Before anything else, follow this " +
      "repo's own guidance for backend schema changes and read the document it points to.",
    expectFilesRead: ["server/CLAUDE.md", "server/docs/schema.md"],
    maxTurns: 8,
  },
  {
    kind: "trace",
    name: "client routing: fetching data in a component leads through client/CLAUDE.md to client/docs/data-flow.md",
    prompt:
      "I need to show data from the API in a new component of the web client. Before writing " +
      "anything, follow this repo's own guidance on data fetching and read the document it " +
      "points to.",
    expectFilesRead: ["client/CLAUDE.md", "client/docs/data-flow.md"],
    maxTurns: 8,
  },

  // --- contrast: is it CLAUDE.md that leads the agent there? -----------------------------------
  // Same task as the server routing case. Treatment is the real repo; control runs in an empty
  // temporary directory with no project settings, so it cannot reach the document at all.
  {
    kind: "contrast",
    name: "contrast: the schema document is read in the repo and not in an empty directory",
    prompt:
      "I need to add a column to a table in the API's database. Before anything else, follow this " +
      "repo's own guidance for backend schema changes and read the document it points to.",
    expectFileRead: "server/docs/schema.md",
    maxTurns: 8,
  },

  // --- activation pair: engineering-insights --------------------------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "I just found out why a pgvector query returned zero rows: the column dimension no longer " +
      "matched after we changed the embedding model. I want to record this so nobody hits it again.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative: explaining the same topic must NOT record an insight",
    prompt:
      "Explain how column dimensions work in pgvector and why a mismatch returns zero rows.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- dispatch -------------------------------------------------------------------------------
  {
    kind: "dispatch",
    name: "an architecture plan review pulls in the architecture-reviewer subagent",
    // The module must not exist yet, or the model reviews existing code inline instead of
    // delegating. There is no `exports` module in server/src/modules.
    prompt:
      "I plan to add a NEW module `exports` to server/src/modules, with a route, a service and a " +
      "repository. Before I write any code, you MUST launch the architecture-reviewer subagent to " +
      "check this plan against the onion layers. Do not review it yourself.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 8,
  },
];

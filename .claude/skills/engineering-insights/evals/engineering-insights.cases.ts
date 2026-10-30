import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureReader, type SkillCase } from "../../../../evals/src/index.js";

// Package-format evals for engineering-insights. Each case asks for a short, structured answer
// (one line per finding) so the result is stable on a small model. Session logs and the existing
// INSIGHTS.md are read from the Skill Creator case folders in this directory, so there is one copy;
// ./fixtures only holds the extra fixture that has no Skill Creator twin.

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = fixtureReader(import.meta.url);
const fromCase = (caseDir: string, path: string) =>
  readFileSync(join(HERE, caseDir, "files", path), "utf8");

const DEDUPE = "dedupe-extend-and-supersede";
const VENDOR = "skill-vendor-and-cross-module";

export const cases: SkillCase[] = [
  {
    name: "decides skip, extend, new entry or supersede for each finding of a session",
    kind: "quality",
    prompt: `Below is a session log with four findings and the current server/INSIGHTS.md. For each of the four findings, decide what to do with server/INSIGHTS.md and give one line in this form: <finding> | <skip | extend | new entry | supersede> | <the existing entry it repeats, extends or replaces, or the related existing entry it must be linked to with See also, or none> | <section it goes under>. Output only the four lines.\n\n### session-log.md\n${fromCase(DEDUPE, "session-log.md")}\n\n### server/INSIGHTS.md\n${fromCase(DEDUPE, "server/INSIGHTS.md")}`,
    practices: [
      "for the repeated 'relation \"reviews\" does not exist' error (finding 1) the decision is skip, because server/INSIGHTS.md already records it",
      "for the rebase failure 'column \"status\" ... already exists' (finding 2) the decision is a new entry or an extension, not skip",
      "for the rebase failure 'column \"status\" ... already exists' (finding 2) the line names the existing 'relation does not exist' entry as the related one, not none",
      "for the removed db:push script (finding 3) the decision is supersede, and the line names the old db:push tip as the entry it replaces",
      "for the tests that silently skip *.it.test.ts when Docker is not running (finding 4) the decision is a new entry (not skip or extend)",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
  {
    name: "routes findings to the right INSIGHTS.md files, tags a skill finding, links two-sided changes",
    kind: "quality",
    prompt: `Below is a session log with four findings. The repository has four INSIGHTS.md files: root, server, client and reviewer-core. For each finding give one line in this form: <finding> | <the INSIGHTS.md file or files it goes to> | <tags or links the entries need>. Add one last line saying whether anything contradicts an instruction in the repository and what the instruction should say instead. Output only these lines.\n\n### session-log.md\n${fromCase(VENDOR, "session-log.md")}`,
    practices: [
      "the finding about the zod skill's snippet (result.error.errors does not exist in Zod 4) goes to the root INSIGHTS.md with a Skill tag naming zod",
      "the zod finding is routed to server/INSIGHTS.md as well as the root INSIGHTS.md (both files are named for it)",
      "the stale vendored severity enum (missing SUGGESTION) goes to client/INSIGHTS.md, not to a file under client/src/vendor",
      "the confidence field that the engine emits but the server mapper drops goes to both reviewer-core/INSIGHTS.md and server/INSIGHTS.md, each pointing at the other with See also",
      "the last line says that the CLAUDE.md instruction 'run npm install after pulling' is wrong or contradicted, and says it should say to use npm ci instead",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
  {
    name: "a session of only renames and formatting produces no entry (negative control)",
    kind: "quality",
    prompt: `Here is a session log. Produce the INSIGHTS.md entries worth recording for it. If nothing is worth recording, say so and write no entry. Output only the entries, or the statement that there are none.\n\n${fx("session-trivial.md")}`,
    practices: [
      "says that nothing in the session is worth recording",
      "writes no INSIGHTS.md entry, and does not invent a finding, a decision or a lesson from the typo fix, the rename, the formatter run or the lint setting",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
];

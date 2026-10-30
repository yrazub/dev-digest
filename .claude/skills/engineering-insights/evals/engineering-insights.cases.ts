import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillCase } from "../../../../evals/src/index.js";

// Package-format twin of the two Skill Creator cases in this folder (dedupe-extend-and-supersede/,
// skill-vendor-and-cross-module/). Fixtures are read from those folders. The package's skill runner
// gives the model NO tools, so the prompts inline the session log and the files the skill would
// have opened, and ask for the INSIGHTS.md lines as text; the judge scores the proposed entries.

const HERE = dirname(fileURLToPath(import.meta.url));
const FENCE = "`".repeat(3);

function files(caseDir: string, paths: string[]): string {
  return paths
    .map((p) => `### ${p}\n${FENCE}\n${readFileSync(join(HERE, caseDir, "files", p), "utf8")}${FENCE}`)
    .join("\n\n");
}

const ANSWER_FORMAT =
  "You cannot edit files here. For each INSIGHTS.md you would change, give its path and the exact lines you would add (and under which heading, or beneath which existing entry), as text. Do not copy the whole file. Then tell me what you did and anything I should look at.";

export const cases: SkillCase[] = [
  {
    name: "repeat, narrower case and stale entry: skip, link, supersede",
    kind: "quality",
    prompt: `end of session - session-log.md is what I did today. update the insights files with whatever is worth keeping. be careful with what is already recorded in server/INSIGHTS.md. tell me what you did.\n\n${ANSWER_FORMAT}\n\nThe repository's files (the other INSIGHTS.md files start with the same format header and have no entries):\n\n${files("dedupe-extend-and-supersede", [
      "session-log.md",
      "INSIGHTS.md",
      "server/INSIGHTS.md",
      "server/package.json",
      "server/vitest.config.ts",
    ])}`,
    practices: [
      "the answer writes no new entry for the repeated 'relation \"reviews\" does not exist' error, which server/INSIGHTS.md already records",
      "the rebase failure ('column \"status\" ... already exists') is recorded with the rule to regenerate the migration after a rebase, and a reader of the existing 'relation does not exist' entry can find it: either as a dated line beneath that entry or as a separate entry plus a See also / Evidence line beneath the existing entry",
      "the old db:push tip is not reworded or deleted; a line beginning 'Superseded' with a date is added beneath it, saying db:push no longer exists",
      "the replacement rule (schema changes go through pnpm db:generate then pnpm db:migrate) is recorded, citing server/package.json",
      "the silent skipping of *.it.test.ts when Docker is not running is recorded as a new entry citing server/vitest.config.ts around line 16, naming dockerAvailable",
      "the reply tells me that a new finding contradicted an existing entry (the db:push note)",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    name: "skill advice, vendored copy, two-sided change and an instruction that is wrong",
    kind: "quality",
    prompt: `wrap up: session-log.md is today's session. capture what future sessions need, in the right INSIGHTS.md files. if anything you find disagrees with an instruction we have in the repo, tell me instead of just changing it.\n\n${ANSWER_FORMAT}\n\nThe repository has four INSIGHTS.md files (root, server, client, reviewer-core), each with the same format header and no entries. The other files:\n\n${files("skill-vendor-and-cross-module", [
      "session-log.md",
      "CLAUDE.md",
      ".claude/skills/zod/SKILL.md",
      "server/package.json",
      "server/src/modules/reviews/parse-input.ts",
      "server/src/modules/runs/finding-mapper.ts",
      "reviewer-core/src/engine/to-finding.ts",
      "server/src/vendor/shared/severity.ts",
      "client/src/vendor/shared/severity.ts",
      "client/src/features/findings/SeverityBadge.tsx",
      ".github/workflows/reviewer-core.yml",
    ])}`,
    practices: [
      "the root INSIGHTS.md gets an entry about the zod skill's snippet (result.error.errors) being wrong for Zod 4, and that entry carries a '**Skill:**' line naming zod",
      "the zod finding is written twice: a module entry (server) about ZodError.errors being gone in Zod 4 / use error.issues, and the tagged root entry, each carrying a '**See also:**' line pointing at the other file",
      "no change is proposed to anything under .claude/skills/zod/, and no change to client/src/vendor/ (the stale severity enum is only recorded, in client/INSIGHTS.md, with the fix 're-sync the copy, then add the SUGGESTION key in SeverityBadge.tsx')",
      "the confidence field gets one entry in reviewer-core/INSIGHTS.md and one in server/INSIGHTS.md, each stated from that module's side, each with a '**See also:**' line pointing at the other module's file",
      "the npm install versus npm ci CI failure is recorded with the reviewer-core.yml run line as evidence, and CLAUDE.md is not edited",
      "the reply tells me that the CLAUDE.md instruction 'reviewer-core: run npm install after pulling' is wrong and proposes the edit (use npm ci), instead of only writing the insight",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
];

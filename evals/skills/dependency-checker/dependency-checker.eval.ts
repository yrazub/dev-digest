import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { describeSkill, runSkillCases, SKILLS_DIR } from "../../src/index.js";
import { cases } from "./dependency-checker.cases.js";

// The course ships these cases but not the skill itself (.claude/skills/dependency-checker/SKILL.md).
// Without it every case would fail with "SKILL.md not found", so skip them until the skill exists.
const skillExists = existsSync(join(SKILLS_DIR, "dependency-checker", "SKILL.md"));

if (skillExists) {
  describeSkill("dependency-checker", () => runSkillCases("dependency-checker", cases));
} else {
  describe.skip("skill:dependency-checker (SKILL.md is not in this repo)", () =>
    runSkillCases("dependency-checker", cases));
}

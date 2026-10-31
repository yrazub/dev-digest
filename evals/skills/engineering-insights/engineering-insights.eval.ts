import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "../../../.claude/skills/engineering-insights/evals/engineering-insights.cases.js";

describeSkill("engineering-insights", () => runSkillCases("engineering-insights", cases));

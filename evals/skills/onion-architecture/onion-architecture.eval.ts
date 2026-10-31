import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "../../../.claude/skills/onion-architecture/evals/onion-architecture.cases.js";

describeSkill("onion-architecture", () => runSkillCases("onion-architecture", cases));

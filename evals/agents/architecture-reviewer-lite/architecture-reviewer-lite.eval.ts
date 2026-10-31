import { describeAgent, runAgentCases } from "../../src/index.js";
// Reuses the strict variant's cases: same fixtures, same finding practices, same thresholds. Only
// the injected agent artifact differs (architecture-reviewer-lite has the "cite the specific
// documented rule per finding" hard rule removed). The practices that demand that citation are
// dropped here: they would be red by design, and CI must not fail on the very thing that makes
// the agent "lite". The A/B on citation is measured locally with eval:repeat and eval:delta on the
// strict cases.
import { cases, citationPractices } from "../architecture-reviewer/architecture-reviewer.cases.js";

const liteCases = cases
  .map((c) => ({ ...c, practices: (c.practices ?? []).filter((p) => !citationPractices.has(p)) }))
  .filter((c) => c.practices.length > 0);

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", liteCases));

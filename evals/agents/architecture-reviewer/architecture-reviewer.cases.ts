import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent's Step 0 stops with "Clarification needed" when a `change` task has no file list, so
// every prompt names the mode and the files. The files exist only in the patch (they are not in
// the working tree), so the agent has to review from the patch.
const reviewPrompt = (files: string[], patch: string) =>
  `Mode: change. Baseline: the patch below (no patch file). Changed files, all modified:\n${files
    .map((f) => `- ${f}`)
    .join("\n")}\n\nThe files exist only in this patch, not in the working tree: review from the patch. ` +
  `Do not report files that are absent from the tree (a module's repository or routes file, for ` +
  `example): they are not part of this change. ` +
  `Audit it against DevDigest's documented architecture rules. Output only your report.\n\n${patch}`;

const REVIEW_PROMPT = reviewPrompt(
  [
    "server/src/modules/checkout/domain/checkout.ts",
    "server/src/modules/checkout/service.ts",
  ],
  fx("checkout-service.diff"),
);

// A second diff. Its violations map onto rules a competent model describes in prose but does not
// name unless the agent forces a citation: `core-no-node-io` (a skill rule ID) and the grounding
// gate, whose rule has no skill ID and lives only in reviewer-core/CLAUDE.md. This is the
// discriminating case for the strict-vs-lite A/B: both variants should FIND both problems, but
// only the strict variant (which must quote a rule per finding) should reliably cite them.
const REVIEWER_CORE_PROMPT = reviewPrompt(
  ["reviewer-core/src/pipeline/run.ts"],
  fx("reviewer-core-gate.diff"),
);

// A diff that violates NO documented rule (a local-variable rename, no new imports). A grounded
// reviewer reports no findings; this surfaces the COST of relaxing the citation rule, since a lite
// variant freed from "quote a rule" is more prone to fabricating a best-practice finding.
const BENIGN_PROMPT = reviewPrompt(
  ["server/src/modules/blast/score.ts"],
  fx("benign-refactor.diff"),
);

// A diff that edits a vendored copy. The rule against it ("do not touch client/src/vendor/**")
// lives only in CLAUDE.md files and has no skill rule ID, so a reviewer that is not forced to cite
// a rule can describe the problem in prose and skip the path:line. The file is real, so the agent
// can read it and the CLAUDE.md that forbids the edit.
const VENDOR_PROMPT = reviewPrompt(
  ["client/src/vendor/shared/contracts/findings.ts"],
  fx("vendor-edit.diff"),
).replace("The files exist only in this patch, not in the working tree: review from the patch. ", "");

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so both are graded on the same task. The practice that should move between the two
// series is the one that demands a rule citation per finding; read the practices, not the case
// total.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing FastifyReply from 'fastify' as a violation: an inner layer depends on a web framework",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation: a concrete repository is constructed outside the composition root",
      "names a documented rule ID for EVERY finding (for example dep-domain-framework-free, dep-inward-only, di-composition-root-only) and not only a prose description",
      "gives each finding a severity of CRITICAL, WARNING or SUGGESTION",
      "quotes the offending line of code verbatim as evidence for each finding, not a paraphrase",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent a runtime-bug or security finding for the optional `reply?: FastifyReply` parameter; it appears only as part of the framework-import finding",
      "stays scoped to structural, layering and DI findings and does not comment on naming, style or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites a documented rule for each reviewer-core violation",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation: the pure engine must do no Node I/O",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before findings are emitted",
      "names a core-* rule ID from the onion-architecture skill (core-no-node-io or core-stays-pure) for the fs-import finding, not only a prose description",
      "cites reviewer-core/CLAUDE.md, by path:line or by quoting its rule that the grounding gate is mandatory, for the skipped-gate finding",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "cites the CLAUDE.md rule for an edit to a vendored copy",
    kind: "quality",
    prompt: VENDOR_PROMPT,
    practices: [
      "flags that the vendored client copy of the contract (client/src/vendor/shared/contracts/findings.ts) was changed by hand and now differs from the authored contract in the server",
      "cites a documented rule for that finding: a rule ID, or a CLAUDE.md line given by path:line or by quote, not only a prose description",
      "says the fix is to change the authored contract in server/src/vendor/shared and re-sync the client copy",
    ],
    threshold: 0.6,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no findings for the rename, or only SUGGESTION-level observations; it does not report a CRITICAL or WARNING finding",
      "does not claim that the diff violates a documented rule or name a rule ID as broken",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];

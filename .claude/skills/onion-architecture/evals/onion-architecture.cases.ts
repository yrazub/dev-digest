import { fixtureReader, type SkillCase } from "../../../../evals/src/index.js";

// Package-format evals for onion-architecture. Short, structured answers so the result is stable
// on a small model: reviews of small fixtures, one placement question, and a negative control.
// Fixtures live in ./fixtures (read with fixtureReader). The agentic Skill Creator cases that
// edit a whole fixture repo are in the sibling folders (transaction-owned-by-use-case/, ...).
//
// Practices are written at the level of the concept ("DB access belongs in a repository") so any
// correct wording passes. One practice per case names something only this skill knows (a rule ID,
// the UnitOfWork pattern); with a 0.6 threshold a single miss on it does not fail the case.

const fx = fixtureReader(import.meta.url);

const REVIEW_INSTRUCTIONS =
  "Review the code below for architectural and layering problems only. For each problem: name the violation (and the project's rule ID if it defines one), say which layer the code is in versus where it belongs, and give the concrete fix. Output only your review.";

export const cases: SkillCase[] = [
  {
    name: "review flags the layering violations in a new digests module",
    kind: "quality",
    prompt: `${REVIEW_INSTRUCTIONS}\n\n### service.ts\n${fx("digests-service.ts")}\n\n### routes.ts\n${fx("digests-routes.ts")}`,
    practices: [
      "flags the Drizzle query inside the service (a database query in the use-case layer) and says it belongs in a repository",
      "flags that the service constructs the GitHub adapter itself (new GitHubAdapter, reading process.env) and says adapters are built in the composition root and injected",
      "flags that the service takes the whole Container instead of the narrow dependencies it uses",
      "flags the route handler for calling .parse(req.params) itself or for querying the database directly, and says routes should be thin and validate through the route schema",
      "cites at least two project rule IDs for its findings (for example db-only-in-repository, di-composition-root-only, di-narrow-deps, edge-thin-routes, edge-schema-first)",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
  {
    name: "says who owns the transaction when two writes must be atomic",
    kind: "quality",
    prompt:
      "In a Fastify + Drizzle codebase organised in onion-architecture modules, a runs module must save a run's findings and mark the run done as one atomic step, after an LLM call has produced the findings. Answer in at most five short bullets: which layer decides that the two writes are atomic, where db.transaction is called, how the service triggers it without importing Drizzle, whether the repository sees the db or the transaction, and where the LLM call goes relative to the transaction. Output only the bullets.",
    practices: [
      "says the service (use case) is the layer that decides which writes must be atomic",
      "says the service starts the transaction through a port that takes the work to run as a callback (a UnitOfWork-style run(work) method), not through one repository method that performs both writes",
      "says the repository accepts either the db or the transaction as its executor so the same code runs inside the transaction",
      "says the LLM call happens before the transaction opens, so no external call runs inside it",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
  {
    name: "review of a layered pulls module reports no violations (negative control)",
    kind: "quality",
    prompt: `${REVIEW_INSTRUCTIONS} If there are no problems, say so plainly.\n\n### ports.ts\n${fx("pulls-ports.ts")}\n\n### repository.ts\n${fx("pulls-repository.ts")}\n\n### service.ts\n${fx("pulls-service.ts")}`,
    practices: [
      "reports no layering violation in the code, or only minor non-blocking observations, and does not call anything a violation or critical problem",
      "does not claim that the repository's use of drizzle-orm or the db schema is a violation, since the repository is the layer that is meant to use them",
      "does not claim that the service depends on a concrete class or on Drizzle; it depends on the PullStore port",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
  {
    name: "review of a change that edits a baselined legacy service says to migrate it and shrink the baseline",
    kind: "quality",
    prompt: `Review this diff for architectural and layering problems only. The project checks layering with dependency-cruiser and keeps known leaks in a baseline file (below). List each violation the new code introduces or continues, with the project's rule ID if there is one. Then say what the project's rules expect me to do about the existing reviews service and the baseline in this change. Output only the review.\n\n${fx("reviews-get-review.diff")}\n\nCurrent baseline (.dependency-cruiser-known-violations.json):\n${fx("known-violations-baseline.json")}`,
    practices: [
      "flags that the new service method returns the Drizzle ReviewRow type instead of a contract from the shared package",
      "flags that the service still takes the whole Container instead of narrow dependencies",
      "says that because this change edits the baselined reviews service, it should be migrated now (narrow dependencies, contract type) and the baseline should shrink, for example by running pnpm arch:baseline in the same change",
    ],
    threshold: 0.6,
    maxTurns: 3,
  },
];

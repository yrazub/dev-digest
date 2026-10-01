import type { ConventionCategory } from "@devdigest/shared";

/**
 * Client-local copy of the convention rules from `@devdigest/shared`
 * (`ConventionCategory`, `CONVENTION_RULE_MAX`). The client can only import
 * TYPES from the vendored shared package — see `skill-rules.ts` for why. Keep
 * these in sync with `contracts/knowledge.ts`.
 */
export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "imports",
  "error-handling",
  "typing",
  "testing",
  "formatting",
  "api",
  "other",
];

export const CONVENTION_RULE_MAX = 500;

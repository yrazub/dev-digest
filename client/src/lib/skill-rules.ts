import type { SkillType } from "@devdigest/shared";

/**
 * Client-local copy of the skill rules from `@devdigest/shared` (`SkillType`,
 * `SkillName`). The client can only import TYPES from the vendored shared
 * package — a runtime value pulls `vendor/shared/index.ts` into the webpack
 * bundle, whose `./contracts/*.js` re-exports Next cannot resolve (same reason
 * as `feature-models.ts`). Keep these in sync with `contracts/knowledge.ts`.
 */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Same rule as the server's `SkillName`: lower-case kebab slug, 1–80 chars. */
export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= 80 && SKILL_NAME.test(name);
}

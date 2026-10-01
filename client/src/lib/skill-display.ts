import type { Skill, SkillType } from "@devdigest/shared";

/** Badge colour per skill type (design: rubric blue, convention green, security red, custom grey). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--info)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Case-insensitive match on name or description. */
export function filterSkills<T extends Pick<Skill, "name" | "description">>(skills: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q));
}

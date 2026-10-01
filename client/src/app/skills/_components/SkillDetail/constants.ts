import type { IconName } from "@devdigest/ui";

export type SkillTab = "config" | "preview" | "versions";

/** Detail tabs (design: Skill Editor). Evals and Stats are later lessons. */
export const TABS: readonly { key: SkillTab; icon: IconName }[] = [
  { key: "config", icon: "Settings" },
  { key: "preview", icon: "Eye" },
  { key: "versions", icon: "History" },
];

export function toSkillTab(value: string | null): SkillTab {
  return TABS.some((tb) => tb.key === value) ? (value as SkillTab) : "config";
}

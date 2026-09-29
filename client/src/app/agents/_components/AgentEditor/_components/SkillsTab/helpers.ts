import type { AgentSkill } from "@devdigest/shared";

/** Ids of the linked skills, in prompt order. */
export function linkedIds(skills: AgentSkill[]): string[] {
  return skills
    .filter((s) => s.linked)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => s.id);
}

/** Checking a skill appends it to the end of the prompt; unchecking removes it. */
export function toggleLinked(ids: string[], id: string, on: boolean): string[] {
  if (on) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((x) => x !== id);
}

/** Move `activeId` to `overId`'s position (drag-and-drop reorder). */
export function moveLinked(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

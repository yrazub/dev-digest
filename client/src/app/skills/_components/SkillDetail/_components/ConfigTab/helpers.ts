import type { Skill, SkillUpdate } from "@devdigest/shared";

export interface SkillForm {
  name: string;
  description: string;
  type: Skill["type"];
  enabled: boolean;
  body: string;
}

/** Only the fields that differ from the saved skill; the note rides along with a body change. */
export function buildPatch(skill: Skill, form: SkillForm, note: string): SkillUpdate {
  const patch: SkillUpdate = {};
  if (form.name !== skill.name) patch.name = form.name;
  if (form.description.trim() !== skill.description) patch.description = form.description.trim();
  if (form.type !== skill.type) patch.type = form.type;
  if (form.enabled !== skill.enabled) patch.enabled = form.enabled;
  if (form.body !== skill.body) {
    patch.body = form.body;
    if (note.trim()) patch.version_note = note.trim();
  }
  return patch;
}

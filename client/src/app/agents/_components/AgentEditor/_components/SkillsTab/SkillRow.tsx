/* SkillRow — one skill on the agent's Skills tab: drag handle (checked rows
   only, #31), per-agent checkbox, name, type badge and a note when the skill
   is disabled globally. */
"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import type { AgentSkill } from "@devdigest/shared";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import { TYPE_COLOR } from "@/lib/skill-display";
import { s } from "./styles";

export function SkillRow({
  skill,
  draggable,
  onToggle,
}: {
  skill: AgentSkill;
  /** Only checked rows, and only while no filter is applied. */
  draggable: boolean;
  onToggle: (on: boolean) => void;
}) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    disabled: !draggable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ ...s.row(skill.linked, isDragging), transform: CSS.Transform.toString(transform), transition }}
      data-testid={`skill-row-${skill.name}`}
    >
      {draggable ? (
        <button
          type="button"
          aria-label={t("skillsTab.dragHandle", { name: skill.name })}
          style={s.handle}
          {...attributes}
          {...listeners}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        <span style={s.handleSpace} aria-hidden />
      )}
      <Checkbox checked={skill.linked} onChange={onToggle} label={<span className="mono" style={s.name}>{skill.name}</span>} />
      {!skill.enabled && <span style={s.disabled}>{t("skillsTab.disabledGlobally")}</span>}
      <span style={s.type}>
        <Badge color={TYPE_COLOR[skill.type]}>{tSkills(`type.${skill.type}`)}</Badge>
      </span>
    </li>
  );
}

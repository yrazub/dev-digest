/* SkillCard — one skill in the Skills list column (design: Skill Editor, left
   column): name, directive description, type + source, version, agent count,
   the global enabled toggle and delete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import { TYPE_COLOR } from "@/app/skills/_lib/skill-display";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onSelect,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active?: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()} title={t("card.toggle")}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.delete}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={TYPE_COLOR[skill.type]}>{t(`type.${skill.type}`)}</Badge>
        <span style={s.meta}>{t(`source.${skill.source}`)}</span>
        <span style={s.meta}>{t("card.version", { version: skill.version })}</span>
        <span style={s.meta}>{t("card.agents", { count: skill.agent_count })}</span>
      </div>
    </div>
  );
}

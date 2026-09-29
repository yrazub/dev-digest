/* AgentCard — one agent tile (#32): name, description, model chip, enabled
   toggle, linked-skill count and delete (#33, confirmed by the parent). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
  onDelete,
}: {
  ag: Agent;
  active?: boolean;
  /** Overrides `ag.skill_count` (e.g. an optimistic count). */
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("agents");
  const color = modelColor(ag.model);
  const skills = skillCount ?? ag.skill_count;
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
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
        )}
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        <Badge color="var(--text-secondary)" icon="Sparkles">
          {t("card.skillCount", { count: skills })}
        </Badge>
      </div>
    </div>
  );
}

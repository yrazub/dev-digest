/* SkillDetail — the right-hand pane of /skills/:id: header (name, type,
   version) and the Config · Preview · Versions tabs (design: Skill Editor).
   Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Badge, Tabs } from "@devdigest/ui";
import { TYPE_COLOR } from "@/lib/skill-display";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
  onDelete,
}: {
  skill: Skill;
  tab: SkillTab;
  onTab: (t: SkillTab) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(`detail.tabs.${tb.key}`), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 className="mono" style={s.title}>
          {skill.name}
        </h2>
        <Badge color={TYPE_COLOR[skill.type]}>{t(`type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)" mono>
          {t("card.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as SkillTab)} pad="0 28px" />
      </div>
      <div style={s.body}>
        {/* key: a different skill (or a restore) resets the form to the saved state */}
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} onDelete={onDelete} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}

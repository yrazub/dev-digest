/* SkillsTab — which skills this agent uses, and in what order (design: Agent
   Editor · Skills). Lists EVERY workspace skill (#37): checked ones first in
   prompt order, then the rest. Checking links a skill, the drag handle on a
   checked row reorders it (#31), and the order is exactly the order of the
   skill blocks in the agent's prompt (#14). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { filterSkills } from "@/lib/skill-display";
import { linkedIds, moveLinked, toggleLinked } from "./helpers";
import { SkillRow } from "./SkillRow";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useAgentSkills(agentId);
  const setLinks = useSetAgentSkills(agentId);
  const [query, setQuery] = React.useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return <Skeleton height={220} />;
  if (isError || !skills) return <ErrorState body={t("skillsTab.loadError")} onRetry={() => refetch()} />;
  if (skills.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skillsTab.empty")}
        cta={t("skillsTab.emptyCta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  const ids = linkedIds(skills);
  const filtering = query.trim().length > 0;
  const visible = filterSkills(skills, query);
  const linked = visible.filter((sk) => sk.linked);
  const rest = visible.filter((sk) => !sk.linked);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setLinks.mutate(moveLinked(ids, String(active.id), String(over.id)));
  };
  const toggle = (id: string, on: boolean) => setLinks.mutate(toggleLinked(ids, id, on));

  return (
    <div style={s.wrap}>
      <div style={s.headRow}>
        <h3 style={s.heading}>{t("skillsTab.heading")}</h3>
        <Badge color="var(--accent)">{t("skillsTab.enabledCount", { enabled: ids.length, total: skills.length })}</Badge>
        <label style={s.filter}>
          <Icon.Search size={13} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skillsTab.filterPlaceholder")}
            aria-label={t("skillsTab.filterPlaceholder")}
            style={s.filterInput}
          />
        </label>
      </div>
      <p style={s.hint}>{filtering ? t("skillsTab.dragDisabled") : t("skillsTab.orderHint")}</p>

      {visible.length === 0 ? (
        <p style={s.hint}>{t("skillsTab.noMatch", { query })}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={linked.map((sk) => sk.id)} strategy={verticalListSortingStrategy}>
            <ul style={s.list}>
              {linked.map((sk) => (
                <SkillRow key={sk.id} skill={sk} draggable={!filtering} onToggle={(on) => toggle(sk.id, on)} />
              ))}
            </ul>
          </SortableContext>
          {linked.length > 0 && rest.length > 0 && <div style={s.divider} />}
          <ul style={s.list}>
            {rest.map((sk) => (
              <SkillRow key={sk.id} skill={sk} draggable={false} onToggle={(on) => toggle(sk.id, on)} />
            ))}
          </ul>
        </DndContext>
      )}
    </div>
  );
}

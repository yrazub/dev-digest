/* AgentRow — one agent on the overview: name, model, last-run line, recall sparkline and
   the Recall / Prec / Cite mini metrics of its latest done run. Activating it opens the agent's view. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Sparkline } from "@devdigest/ui";
import type { EvalAgentOverview } from "@devdigest/shared";
import { METRIC_COLOR } from "@/components/eval/constants";
import { pct } from "@/components/eval/helpers";
import { lastRunParams, sparklinePoints } from "./helpers";
import { s } from "./styles";

export function AgentRow({ agent, onOpen }: { agent: EvalAgentOverview; onOpen: () => void }) {
  const t = useTranslations("eval");
  const [hovered, setHovered] = React.useState(false);
  const { latest } = agent;

  const metrics = [
    { key: "recall", label: t("dashboard.mini.recall"), value: latest?.recall ?? null, color: METRIC_COLOR.recall },
    {
      key: "precision",
      label: t("dashboard.mini.precision"),
      value: latest?.precision ?? null,
      color: METRIC_COLOR.precision,
    },
    {
      key: "citation",
      label: t("dashboard.mini.citation"),
      value: latest?.citation_accuracy ?? null,
      color: METRIC_COLOR.citation,
    },
  ];

  return (
    <button
      type="button"
      style={s.agentRow(hovered)}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={s.iconBox}>
        <Icon.Cpu size={17} />
      </span>
      <span style={s.agentMain}>
        <span style={s.agentHead}>
          <span style={s.agentName} title={agent.agent_name}>
            {agent.agent_name}
          </span>
          <span className="mono" style={s.modelChip} title={agent.model}>
            {agent.model}
          </span>
        </span>
        <span style={{ ...s.subLine, display: "block" }}>
          {latest ? t("dashboard.lastRun", lastRunParams(latest)) : t("dashboard.noAgentRuns")}
        </span>
      </span>
      {latest && (
        <span style={s.sparkline} data-testid="recall-sparkline">
          <Sparkline data={sparklinePoints(agent.recall_trend)} color={METRIC_COLOR.recall} w={60} h={24} />
        </span>
      )}
      <span style={s.miniMetrics}>
        {metrics.map((m) => (
          <span key={m.key} style={s.miniMetric}>
            <span style={{ ...s.miniLabel, display: "block" }}>{m.label}</span>
            <span style={{ ...s.miniValue(m.color), display: "block" }}>{pct(m.value)}</span>
          </span>
        ))}
      </span>
      <span style={s.chevron}>
        <Icon.ChevronRight size={18} />
      </span>
    </button>
  );
}

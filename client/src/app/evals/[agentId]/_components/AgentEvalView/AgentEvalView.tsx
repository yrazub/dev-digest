/* AgentEvalView — /evals/:agentId (design: Eval dashboard → one agent). Header with the agent
   switcher and the run button, the regression banner, three metric cards, the metric trend,
   then the runs table with a checkbox per done run; a row opens the run drawer. Every agent,
   run and prompt text is a React text node. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, SectionLabel, Skeleton, Dropdown } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RunDrawer, RunEvalButton, RunsTable } from "@/components/eval";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEvalCases, useAgentEvalRuns } from "@/lib/hooks/evals";
import type { EvalSuiteRun } from "@devdigest/shared";
import { precisionDip, toggleSelection } from "./helpers";
import { MetricCards } from "./MetricCards";
import { RegressionBanner } from "./RegressionBanner";
import { s } from "./styles";
import { TrendCard } from "./TrendCard";

const PAGE = 20;

export function AgentEvalView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [limit, setLimit] = React.useState(PAGE);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [opened, setOpened] = React.useState<{ runId: string; el: HTMLElement } | null>(null);

  const agents = useAgents().data ?? [];
  const casesQuery = useAgentEvalCases(agentId);
  const runsQuery = useAgentEvalRuns(agentId, limit);

  const agent = agents.find((a) => a.id === agentId);
  const runs = runsQuery.data?.runs ?? [];
  const runsTotal = runsQuery.data?.total ?? 0;
  const caseCount = casesQuery.data?.cases.length ?? 0;
  const name = agent?.name ?? runs[0]?.agent_name ?? "";
  const dip = precisionDip(runs);

  const openRun = (run: EvalSuiteRun, el: HTMLElement) => setOpened({ runId: run.id, el });
  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/evals" },
    { label: name },
  ];

  let body: React.ReactNode;
  if (runsQuery.isError) {
    body = <ErrorState body={t("dashboard.agentLoadError")} onRetry={() => runsQuery.refetch()} />;
  } else if (runsQuery.isLoading) {
    body = (
      <div style={s.stack}>
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    );
  } else {
    body = (
      <>
        {dip && <RegressionBanner n={dip.n} version={dip.version} />}
        <MetricCards runs={runs} />
        <TrendCard runs={runs} />
        <div style={s.runsHeader}>
          <SectionLabel icon="History">{t("dashboard.recentRuns")}</SectionLabel>
        </div>
        <div style={s.runsHint}>
          {selected.length === 0 ? t("dashboard.selectHint") : t("dashboard.selected", { count: selected.length })}
        </div>
        {runs.length === 0 ? (
          <p style={s.muted}>{t("dashboard.noRuns")}</p>
        ) : (
          <RunsTable
            runs={runs}
            onOpen={openRun}
            selection={{ selected, onToggle: (id) => setSelected((cur) => toggleSelection(cur, id)) }}
          />
        )}
        {runs.length < runsTotal && (
          <div style={s.showMore}>
            <Button kind="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              {t("dashboard.showMore")}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/evals" style={s.back}>
          <Icon.ChevronLeft size={16} />
          {t("dashboard.allAgents")}
        </Link>
        <div style={s.header}>
          <div style={s.headerMain}>
            <div style={s.titleRow}>
              <h1 style={s.title} title={name}>
                {name}
              </h1>
              {agent && (
                <span className="mono" style={s.modelChip} title={agent.model}>
                  {agent.model}
                </span>
              )}
            </div>
            <p style={s.subtitle}>
              {t("dashboard.agentSubtitle", { runs: runsTotal, cases: caseCount })}
            </p>
          </div>
          <div style={s.actions}>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="secondary" size="sm" icon="Cpu" iconRight="ChevronDown">
                  {t("dashboard.switchAgent")}
                </Button>
              }
              items={agents.map((a) => ({
                label: a.name,
                icon: "Cpu" as const,
                onClick: () => router.push(`/evals/${a.id}`),
              }))}
            />
            <RunEvalButton agentId={agentId} caseCount={caseCount} runs={runs} kind="primary" />
          </div>
        </div>
        {body}
      </div>
      {opened && <RunDrawer runId={opened.runId} returnFocusTo={opened.el} onClose={() => setOpened(null)} />}
    </AppShell>
  );
}

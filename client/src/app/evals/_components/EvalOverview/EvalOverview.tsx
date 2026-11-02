/* EvalOverview — /evals (design: Eval dashboard). One row per agent with its latest done
   run's metrics, then the six newest runs of all agents. Rows open /evals/<agentId>. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalOverview } from "@/lib/hooks/evals";
import { AgentRow } from "./AgentRow";
import { RecentRunRow } from "./RecentRunRow";
import { s } from "./styles";

export function EvalOverview() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useEvalOverview();

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];
  const open = (agentId: string) => router.push(`/evals/${agentId}`);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={s.stack}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  } else if (isError || !data) {
    body = <ErrorState body={t("dashboard.loadError")} onRetry={() => refetch()} />;
  } else {
    body = (
      <>
        <SectionLabel icon="Cpu">{t("dashboard.agentsHeading")}</SectionLabel>
        {data.agents.length === 0 ? (
          <EmptyState
            icon="Cpu"
            title={t("dashboard.noAgents")}
            body={
              <Link href="/agents" style={s.emptyLink}>
                {t("dashboard.goToAgents")}
              </Link>
            }
          />
        ) : (
          <div style={s.agentList}>
            {data.agents.map((agent) => (
              <AgentRow key={agent.agent_id} agent={agent} onOpen={() => open(agent.agent_id)} />
            ))}
          </div>
        )}
        <SectionLabel icon="History">{t("dashboard.recentAll")}</SectionLabel>
        <div style={s.panel}>
          {data.recent_runs.map((run, i) => (
            <RecentRunRow
              key={run.id}
              run={run}
              last={i === data.recent_runs.length - 1}
              onOpen={() => open(run.agent_id)}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.subtitle}>{t("dashboard.overviewSubtitle")}</p>
          </div>
        </div>
        {body}
      </div>
    </AppShell>
  );
}

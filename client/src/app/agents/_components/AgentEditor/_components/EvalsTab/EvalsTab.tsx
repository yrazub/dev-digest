/* EvalsTab — an agent's eval cases and runs (design: Agents → Evals). The metric strip and
   the case outcomes read the latest done run; the Runs section lists the newest 20 with
   "Show more", and a row opens the run drawer. Every case, run and finding text is a React
   text node. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, MonoLink, SectionLabel } from "@devdigest/ui";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { RunDrawer, RunEvalButton, RunsTable, latestDone, previousDone } from "@/components/eval";
import { useAgentEvalCases, useAgentEvalRuns, useDeleteEvalCase, useEvalRun } from "@/lib/hooks/evals";
import type { EvalCaseRecord, EvalSuiteRun } from "@devdigest/shared";
import { CaseRow } from "./CaseRow";
import { deleteDisabled, outcomeByCase, passingCount } from "./helpers";
import { MetricStrip } from "./MetricStrip";
import { s } from "./styles";

const PAGE = 20;

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const [limit, setLimit] = React.useState(PAGE);
  const [toDelete, setToDelete] = React.useState<EvalCaseRecord | null>(null);
  const [opened, setOpened] = React.useState<{ runId: string; el: HTMLElement } | null>(null);

  const casesQuery = useAgentEvalCases(agentId);
  const runsQuery = useAgentEvalRuns(agentId, limit);
  const del = useDeleteEvalCase(agentId);

  const cases = casesQuery.data?.cases ?? [];
  const runs = runsQuery.data?.runs ?? [];
  const runsTotal = runsQuery.data?.total ?? 0;
  const latest = latestDone(runs);
  const previous = previousDone(runs);
  const outcomes = outcomeByCase(useEvalRun(latest?.id).data);
  const passing = passingCount(cases, outcomes);
  const blocked = deleteDisabled(runs);

  const askDelete = (c: EvalCaseRecord) => {
    del.reset();
    setToDelete(c);
  };
  const closeDelete = () => {
    del.reset();
    setToDelete(null);
  };
  const confirmDelete = () => {
    if (toDelete) del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
  };
  const openRun = (run: EvalSuiteRun, el: HTMLElement) => setOpened({ runId: run.id, el });

  let list: React.ReactNode;
  if (casesQuery.isError) list = <p style={s.error}>{t("evalsTab.loadError")}</p>;
  else if (!casesQuery.data) list = <p style={s.muted}>{t("evalsTab.loadingCases")}</p>;
  else if (cases.length === 0) list = <p style={s.muted}>{t("evalsTab.emptyCases")}</p>;
  else
    list = (
      <ul style={s.list}>
        {cases.map((c) => (
          <CaseRow
            key={c.id}
            c={c}
            outcome={outcomes.get(c.id)}
            deleteBlocked={blocked}
            onDelete={askDelete}
          />
        ))}
      </ul>
    );

  return (
    <div style={s.wrap}>
      <SectionLabel icon="Gauge" right={<MonoLink href={`/evals/${agentId}`}>{t("evalsTab.viewDashboard")}</MonoLink>}>
        {t("evalsTab.metricsTitle")}
      </SectionLabel>
      <MetricStrip latest={latest} previous={previous} />
      <p style={s.scoringNote}>{t("evalsTab.scoringNote")}</p>

      <div style={s.casesHeader}>
        <h2 style={s.casesHeading}>{t("evalsTab.casesHeading")}</h2>
        {cases.length > 0 && (
          <Badge
            color={passing === cases.length ? "var(--ok)" : "var(--warn)"}
            bg={passing === cases.length ? "var(--ok-bg)" : "var(--warn-bg)"}
          >
            {t("evalsTab.passing", { passing, total: cases.length })}
          </Badge>
        )}
        <Badge>{t("evalsTab.casesCount", { count: cases.length })}</Badge>
        <span style={s.spacer} />
        <RunEvalButton agentId={agentId} caseCount={cases.length} runs={runs} kind="secondary" />
      </div>
      {list}

      <div style={s.runs}>
        <SectionLabel icon="History">{t("evalsTab.runsHeading")}</SectionLabel>
        {runs.length === 0 ? (
          <p style={s.muted}>{t("dashboard.noRuns")}</p>
        ) : (
          <RunsTable runs={runs} onOpen={openRun} />
        )}
        {runs.length < runsTotal && (
          <div style={s.showMore}>
            <Button kind="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              {t("dashboard.showMore")}
            </Button>
          </div>
        )}
      </div>

      {toDelete && (
        <ConfirmDeleteModal
          title={t("evalsTab.deleteTitle")}
          body={
            <>
              <p style={s.confirmText}>{t("evalsTab.deleteConfirm", { name: toDelete.name })}</p>
              {del.isError && (
                <p role="alert" style={s.confirmError}>
                  {del.error.message}
                </p>
              )}
            </>
          }
          cancelLabel={t("evalsTab.cancel")}
          confirmLabel={t("evalsTab.delete")}
          pending={del.isPending}
          onConfirm={confirmDelete}
          onClose={closeDelete}
        />
      )}

      {opened && <RunDrawer runId={opened.runId} returnFocusTo={opened.el} onClose={() => setOpened(null)} />}
    </div>
  );
}

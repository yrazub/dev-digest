/* RunsTable — the runs of one agent, newest first. With `selection` the first column is a
   checkbox (the agent view's Compare picker); without it a status chip sits in the version
   cell (the Evals tab). A row opens the run drawer on click, Enter or Space. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCostUsd } from "@/lib/format-cost";
import type { EvalSuiteRun } from "@devdigest/shared";
import { METRIC_COLOR } from "./constants";
import { formatRunTime, runCheckboxLabel } from "./helpers";
import { MetricBar } from "./MetricBar";
import { s } from "./styles";

export interface RunsSelection {
  selected: readonly string[];
  onToggle: (runId: string) => void;
}

function RunRow({
  run,
  last,
  selection,
  onOpen,
}: {
  run: EvalSuiteRun;
  last: boolean;
  selection?: RunsSelection;
  onOpen: (run: EvalSuiteRun, el: HTMLElement) => void;
}) {
  const t = useTranslations("eval");
  const [hovered, setHovered] = React.useState(false);
  const hasCheckbox = selection !== undefined;
  const selected = selection?.selected.includes(run.id) ?? false;
  const unselectable = run.status !== "done";
  const ranAt = formatRunTime(run.started_at);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed on the checkbox belong to it, not to the row.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(run, e.currentTarget);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      style={s.row({ hasCheckbox, selected, hovered, last })}
      onClick={(e) => onOpen(run, e.currentTarget)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {selection && (
        <input
          type="checkbox"
          aria-label={runCheckboxLabel(run)}
          checked={selected}
          disabled={unselectable}
          style={unselectable ? s.checkboxDisabled : s.checkbox}
          onChange={() => selection.onToggle(run.id)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <span className="mono" style={s.ranAt} title={ranAt}>
        {ranAt}
      </span>
      <span className="mono" style={s.version}>
        v{run.config.agent_version}
        {!selection && <span style={s.statusChip(run.status)}>{t(`runs.status.${run.status}`)}</span>}
      </span>
      {run.status === "running" && (
        <span style={s.statusSpan(false)}>
          {t("dashboard.runningProgress", { done: run.cases_done, total: run.cases_total })}
        </span>
      )}
      {run.status === "failed" && (
        <span style={s.statusSpan(true)} title={run.error ?? undefined}>
          {selection && <strong>{t("runs.failed")}</strong>}
          {selection && run.error ? " " : null}
          {run.error}
        </span>
      )}
      {run.status === "done" && (
        <>
          <MetricBar value={run.recall} color={METRIC_COLOR.recall} />
          <MetricBar value={run.precision} color={METRIC_COLOR.precision} />
          <MetricBar value={run.citation_accuracy} color={METRIC_COLOR.citation} />
        </>
      )}
      <div style={s.pass}>
        {run.status === "done" ? `${run.cases_passed}/${run.cases_total}` : "—"}
        {run.status === "done" && run.cases_errored > 0 && (
          <div style={s.errored}>{t("runs.errored", { errored: run.cases_errored, total: run.cases_total })}</div>
        )}
      </div>
      <span className="mono" style={s.cost}>
        {formatCostUsd(run.cost_usd)}
      </span>
    </div>
  );
}

export function RunsTable({
  runs,
  onOpen,
  selection,
}: {
  runs: readonly EvalSuiteRun[];
  onOpen: (run: EvalSuiteRun, el: HTMLElement) => void;
  selection?: RunsSelection;
}) {
  const t = useTranslations("eval");
  return (
    <div style={s.panel}>
      <div style={s.headerRow(selection !== undefined)}>
        {selection && <span />}
        <span>{t("dashboard.table.ranAt")}</span>
        <span>{t("dashboard.table.version")}</span>
        <span>{t("dashboard.table.recall")}</span>
        <span>{t("dashboard.table.precision")}</span>
        <span>{t("dashboard.table.citation")}</span>
        <span>{t("dashboard.table.pass")}</span>
        <span>{t("dashboard.table.cost")}</span>
      </div>
      {runs.map((run, i) => (
        <RunRow key={run.id} run={run} last={i === runs.length - 1} selection={selection} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* RecentRunRow — one run of the cross-agent feed: agent, time, version, three metric bars and
   passed / total. A running run shows its progress and a failed one "failed" in place of the bars. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { MetricBar, METRIC_COLOR, formatRunTime } from "@/components/eval";
import { s } from "./styles";

export function RecentRunRow({ run, last, onOpen }: { run: EvalSuiteRun; last: boolean; onOpen: () => void }) {
  const t = useTranslations("eval");
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      type="button"
      style={s.runRow(hovered, last)}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={s.runAgent} title={run.agent_name}>
        {run.agent_name}
      </span>
      <span className="mono" style={s.runTime}>
        {formatRunTime(run.started_at)}
      </span>
      <span className="mono" style={s.runVersion}>
        v{run.config.agent_version}
      </span>
      {run.status === "done" ? (
        <>
          <MetricBar value={run.recall} color={METRIC_COLOR.recall} />
          <MetricBar value={run.precision} color={METRIC_COLOR.precision} />
          <MetricBar value={run.citation_accuracy} color={METRIC_COLOR.citation} />
        </>
      ) : (
        <span style={s.runStatus(run.status === "failed")}>
          {run.status === "running"
            ? t("dashboard.runningProgress", { done: run.cases_done, total: run.cases_total })
            : t("runs.failed")}
        </span>
      )}
      <span style={s.runPass}>
        {run.cases_passed}/{run.cases_total}
      </span>
    </button>
  );
}

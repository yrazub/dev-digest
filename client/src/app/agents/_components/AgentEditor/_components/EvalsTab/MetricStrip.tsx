/* MetricStrip — the latest done run's recall, precision, citation accuracy and cases passed.
   A percentage tile carries its delta against the previous done run; with fewer than two done
   runs there is no delta (R-WEB-40). */
import React from "react";
import { useTranslations } from "next-intl";
import { DeltaLabel } from "@/components/eval/DeltaLabel";
import { METRIC_COLOR } from "@/components/eval/constants";
import { deltaPoints, pct } from "@/components/eval/helpers";
import type { EvalSuiteRun } from "@devdigest/shared";
import { s } from "./styles";

type Metric = "recall" | "precision" | "citation_accuracy";

const TILES: readonly { metric: Metric; label: "recall" | "precision" | "citationAccuracy"; color: string }[] = [
  { metric: "recall", label: "recall", color: METRIC_COLOR.recall },
  { metric: "precision", label: "precision", color: METRIC_COLOR.precision },
  { metric: "citation_accuracy", label: "citationAccuracy", color: METRIC_COLOR.citation },
];

export function MetricStrip({ latest, previous }: { latest: EvalSuiteRun | null; previous: EvalSuiteRun | null }) {
  const t = useTranslations("eval");
  return (
    <div style={s.strip}>
      {TILES.map(({ metric, label, color }) => (
        <div key={metric} style={s.tile}>
          <div style={s.tileLabel}>{t(`dashboard.metrics.${label}`)}</div>
          <div className="mono" style={s.tileValue(color)}>
            {pct(latest?.[metric])}
          </div>
          <div style={s.tileDelta}>
            {latest && previous && <DeltaLabel delta={deltaPoints(latest[metric], previous[metric])} />}
          </div>
        </div>
      ))}
      <div style={s.tile}>
        <div style={s.tileLabel}>{t("evalsTab.casesPassed")}</div>
        <div className="mono" style={s.tileValue("var(--text-secondary)")}>
          {latest ? `${latest.cases_passed}/${latest.cases_total}` : "—"}
        </div>
        <div style={s.tileDelta} />
      </div>
    </div>
  );
}

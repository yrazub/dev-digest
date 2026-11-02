/* MetricCards — the latest done run's recall, precision and citation accuracy, each with a
   sparkline of the done runs and its delta in points against the previous done run. No delta
   with fewer than two done runs; "—" for an unknown metric (R-WEB-32, R-WEB-39, R-WEB-40). */
import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import { DeltaLabel } from "@/components/eval/DeltaLabel";
import { METRIC_COLOR } from "@/components/eval/constants";
import { deltaPoints, latestDone, previousDone } from "@/components/eval/helpers";
import type { EvalSuiteRun } from "@devdigest/shared";
import { metricSpark, type TrendMetric } from "./helpers";
import { s } from "./styles";

const CARDS: readonly { metric: TrendMetric; label: "recall" | "precision" | "citationAccuracy"; color: string }[] = [
  { metric: "recall", label: "recall", color: METRIC_COLOR.recall },
  { metric: "precision", label: "precision", color: METRIC_COLOR.precision },
  { metric: "citation_accuracy", label: "citationAccuracy", color: METRIC_COLOR.citation },
];

export function MetricCards({ runs }: { runs: readonly EvalSuiteRun[] }) {
  const t = useTranslations("eval");
  const latest = latestDone(runs);
  const previous = previousDone(runs);

  return (
    <div style={s.cards}>
      {CARDS.map(({ metric, label, color }) => {
        const value = latest?.[metric];
        const spark = metricSpark(runs, metric);
        return (
          <div key={metric} style={s.card}>
            <div style={s.cardHead}>
              <span style={s.cardLabel}>{t(`dashboard.metrics.${label}`)}</span>
              {spark.length > 0 && (
                <span style={s.sparkline}>
                  <Sparkline data={spark} color={color} w={56} h={20} />
                </span>
              )}
            </div>
            <div className="mono" style={s.cardValue(color)}>
              {value == null ? (
                "—"
              ) : (
                <>
                  {Math.round(value * 100)}
                  <span style={s.cardSuffix}>%</span>
                </>
              )}
            </div>
            <div style={s.cardDelta}>
              {latest && previous && <DeltaLabel delta={deltaPoints(latest[metric], previous[metric])} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

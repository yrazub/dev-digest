/* TrendCard — "Metric trend": recall, precision and citation over the done runs, oldest first,
   on a local recharts line chart (the vendored LineChart has no tooltip or dots and draws null
   as 0). A null value is a gap. The tooltip text comes from `trendTooltipLabel` and renders as a
   React text node. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { Card, SectionLabel } from "@devdigest/ui";
import { METRIC_COLOR } from "@/components/eval/constants";
import type { EvalSuiteRun } from "@devdigest/shared";
import { trendPoints, trendTooltipLabel, type TrendPoint } from "./helpers";
import { s } from "./styles";

const LINES = [
  { key: "recall", legend: "recall", color: METRIC_COLOR.recall },
  { key: "precision", legend: "precision", color: METRIC_COLOR.precision },
  { key: "citation", legend: "citation", color: METRIC_COLOR.citation },
] as const;

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = payload?.[0]?.payload as TrendPoint | undefined;
  if (!active || !point) return null;
  return <div style={s.tooltip}>{trendTooltipLabel(point)}</div>;
}

const percentTick = (v: number) => `${Math.round(v * 100)}%`;

export function TrendCard({ runs }: { runs: readonly EvalSuiteRun[] }) {
  const t = useTranslations("eval");
  const data = trendPoints(runs);

  const legend = (
    <div style={s.legend}>
      {LINES.map((l) => (
        <span key={l.key} style={s.legendItem}>
          <span style={s.legendSwatch(l.color)} />
          {t(`dashboard.legend.${l.legend}`)}
        </span>
      ))}
    </div>
  );

  return (
    <Card style={s.trend}>
      <SectionLabel icon="TrendingUp" right={legend}>
        {t("dashboard.metricTrend")}
      </SectionLabel>
      <div style={s.chart}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: -10 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="version" hide />
            <YAxis
              domain={[0, 1]}
              tick={{ fontSize: 12, fill: "var(--text-muted)" }}
              tickFormatter={percentTick}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<TrendTooltip />} />
            {LINES.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={2}
                dot
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* MetricBar — a 0..1 metric as a track with a fill, and its value as text beside it
   ("NN%", or "—" with an empty track when the metric is null). */
import React from "react";
import { pct } from "./helpers";
import { s } from "./styles";

export function MetricBar({ value, color }: { value: number | null; color: string }) {
  return (
    <div style={s.bar}>
      <div style={s.barTrack} aria-hidden="true">
        <div style={s.barFill(value, color)} />
      </div>
      <span className="mono" style={s.barLabel}>
        {pct(value)}
      </span>
    </div>
  );
}

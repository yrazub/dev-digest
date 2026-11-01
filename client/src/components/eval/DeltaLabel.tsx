/* DeltaLabel — a delta in points ("▲ +12pt" / "▼ −8pt" / "±0pt"); nothing when it is unknown. */
import React from "react";
import { deltaText } from "./helpers";
import { s } from "./styles";

export function DeltaLabel({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const tone = delta > 0 ? "ok" : delta < 0 ? "crit" : "muted";
  return <span style={s.delta(tone)}>{deltaText(delta)}</span>;
}

/* UnanchoredFindings — end-of-file block for findings whose line is not in the
   rendered patch (or whose file has no patch). Rendered only when findings are passed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { sortBySeverity } from "../findings";
import { fs } from "../styles";

export function UnanchoredFindings({
  findings,
  renderFinding,
}: {
  findings: FindingRecord[];
  renderFinding: (finding: FindingRecord) => React.ReactNode;
}) {
  const t = useTranslations("prReview");
  if (findings.length === 0) return null;
  return (
    <div style={fs.unanchoredWrap}>
      <span style={fs.unanchoredTitle}>{t("smartDiff.findingsOutsideDiff")}</span>
      {sortBySeverity(findings).map((f) => (
        <div key={f.id}>{renderFinding(f)}</div>
      ))}
    </div>
  );
}

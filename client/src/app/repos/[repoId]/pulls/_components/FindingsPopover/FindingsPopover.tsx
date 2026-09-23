/* FindingsPopover — the PR-list FINDINGS cell: a row of per-severity badges
   for the PR's latest completed run, and on hover a read-only preview of that
   run's actual findings. No buttons, no Markdown, no FindingCard — Accept/
   Reject stays exclusive to the Review-runs accordion (hw1 #21 vs #22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { severityCounts, type SeverityCounts } from "../../[number]/_components/FindingsPanel/helpers";
import { lineLabel } from "../../[number]/_components/FindingCard/helpers";
import { s } from "./styles";

export function FindingsPopover({
  findingsBySeverity,
  findingsPreview,
}: {
  findingsBySeverity: SeverityCounts | null | undefined;
  findingsPreview: Finding[] | null | undefined;
}) {
  const t = useTranslations("prReview");
  const [show, setShow] = React.useState(false);
  const counts = severityCounts(findingsBySeverity);

  if (counts.length === 0) return <span style={s.muted}>—</span>;

  const total = counts.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div
      data-testid="findings-popover-trigger"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={s.wrap}
    >
      <div style={s.badgeRow}>
        {counts.map(([sev, n]) => (
          <SeverityBadge key={sev} severity={sev} count={n} compact />
        ))}
      </div>
      {show && (
        <div style={s.popover}>
          <div style={s.popoverTitle}>{t("list.findingsPopover.title", { count: total })}</div>
          <div style={s.popoverList}>
            {(findingsPreview ?? []).map((f) => (
              <div key={f.id} style={s.previewRow}>
                <div style={s.previewHeader}>
                  <SeverityBadge severity={f.severity} compact />
                  <span style={s.previewTitle}>{f.title}</span>
                  <CategoryTag category={f.category} />
                </div>
                <div className="mono" style={s.previewMeta}>
                  {f.file}:{lineLabel(f)}
                  <span style={s.previewConfidence}>
                    <ConfidenceNum value={f.confidence} />
                  </span>
                </div>
                <div style={s.previewRationale}>{f.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

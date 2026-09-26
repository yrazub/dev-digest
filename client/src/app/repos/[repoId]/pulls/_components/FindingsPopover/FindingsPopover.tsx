/* FindingsPopover — a row of per-severity badges for one run, and on hover a
   read-only preview of that run's actual findings. Used by the PR-list FINDINGS
   column and the Agent-runs Timeline. No buttons, no Markdown, no FindingCard —
   Accept/Reject stays exclusive to the Review-runs accordion (hw1 #21 vs #22). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { severityCounts, type SeverityCounts } from "../../[number]/_components/FindingsPanel/helpers";
import { lineLabel } from "../../[number]/_components/FindingCard/helpers";
import { POPOVER_WIDTH, POPOVER_MAX_HEIGHT, s } from "./styles";

const GAP = 6;
const VIEWPORT_MARGIN = 8;
// Lets the pointer cross the gap between the badges and the popover without
// the popover closing under it.
const CLOSE_DELAY_MS = 120;

type Placement = { left: number; top?: number; bottom?: number };

/** Below the trigger when it fits (or has more room than above), else above; clamped to the viewport. */
function placeFor(rect: DOMRect): Placement {
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
  );
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow >= POPOVER_MAX_HEIGHT + GAP || spaceBelow >= rect.top) {
    return { left, top: rect.bottom + GAP };
  }
  return { left, bottom: window.innerHeight - rect.top + GAP };
}

export function FindingsPopover({
  findingsBySeverity,
  findingsPreview,
}: {
  findingsBySeverity: SeverityCounts | null | undefined;
  findingsPreview: Finding[] | null | undefined;
}) {
  const t = useTranslations("prReview");
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const counts = severityCounts(findingsBySeverity);
  const items = findingsPreview ?? [];

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const open = () => {
    cancelClose();
    if (triggerRef.current) setPlacement(placeFor(triggerRef.current.getBoundingClientRect()));
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPlacement(null), CLOSE_DELAY_MS);
  };

  // The popover is fixed-positioned from a one-off measurement, so any scroll
  // (the app scrolls <main>, not the document — hence capture) or resize
  // would leave it detached from its badges: close instead.
  React.useEffect(() => {
    if (!placement) return;
    const close = () => setPlacement(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [placement]);

  React.useEffect(() => cancelClose, []);

  if (counts.length === 0) return <span style={s.muted}>—</span>;

  const total = counts.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div
      ref={triggerRef}
      data-testid="findings-popover-trigger"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      style={s.wrap}
    >
      <div style={s.badgeRow}>
        {counts.map(([sev, n]) => (
          <SeverityBadge key={sev} severity={sev} count={n} compact />
        ))}
      </div>
      {/* Portaled to <body>: the PR-list table card clips its rows with
          overflow:hidden, which would cut an in-row popover off. */}
      {placement &&
        items.length > 0 &&
        createPortal(
          <div
            role="dialog"
            aria-label={t("list.findingsPopover.title", { count: total })}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{ ...s.popover, ...placement }}
          >
            <div style={s.popoverTitle}>{t("list.findingsPopover.title", { count: total })}</div>
            <div style={s.popoverList}>
              {items.map((f) => (
                <div key={f.id} style={s.previewRow}>
                  <div style={s.previewHeader}>
                    <SeverityBadge severity={f.severity} compact />
                    <span style={s.previewTitle}>{f.title}</span>
                    <CategoryTag category={f.category} />
                  </div>
                  <div className="mono" style={s.previewMeta}>
                    <span style={s.previewPath}>
                      {f.file}:{lineLabel(f)}
                    </span>
                    <span style={s.previewConfidence}>
                      <ConfidenceNum value={f.confidence} />
                    </span>
                  </div>
                  <div style={s.previewRationale}>{f.rationale}</div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

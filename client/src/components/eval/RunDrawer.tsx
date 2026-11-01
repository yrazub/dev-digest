/* RunDrawer — a right-side panel with one run's per-case results: outcome, case name, kind,
   the grounded findings (matching ones marked), the dropped count and the error. A local panel
   rather than the vendored Drawer, which has no Esc handling. Closes on Esc or its button and
   puts focus back on `returnFocusTo`. Every text is a React text node. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useEvalRun } from "@/lib/hooks/evals";
import type { EvalCaseResult } from "@devdigest/shared";
import { KIND_PILL, OUTCOME_ICON } from "./constants";
import { formatRunTime } from "./helpers";
import { s } from "./styles";

function ResultBlock({ result }: { result: EvalCaseResult }) {
  const t = useTranslations("eval");
  const outcome = OUTCOME_ICON[result.outcome];
  const OutcomeIcon = Icon[outcome.icon];
  const pill = KIND_PILL[result.kind];
  const output = result.actual_output;

  return (
    <li style={s.result}>
      <div style={s.resultHead}>
        <span
          role="img"
          aria-label={t(`runs.outcome.${result.outcome}`)}
          title={t(`runs.outcome.${result.outcome}`)}
          style={s.outcomeIcon(outcome.color)}
        >
          <OutcomeIcon size={15} />
        </span>
        <span className="mono" style={s.caseName} title={result.case_name ?? undefined}>
          {result.case_name}
        </span>
        <span style={s.kindPill(pill.color, pill.bg, pill.border)}>{t(`kind.${result.kind}`)}</span>
      </div>
      {output && output.findings.length > 0 && (
        <ul style={s.findings}>
          {output.findings.map((f, i) => (
            <li key={`${f.file}:${f.start_line}:${i}`} style={s.finding}>
              <span className="mono" style={s.findingLoc} title={`${f.file}:${f.start_line}-${f.end_line}`}>
                {f.file}:{f.start_line}-{f.end_line}
              </span>
              <span style={s.findingTitle} title={f.title}>
                {f.title}
              </span>
              {f.matches && <span style={s.matches}>{t("drawer.matches")}</span>}
            </li>
          ))}
        </ul>
      )}
      {output && output.findings.length === 0 && <div style={s.dropped}>{t("drawer.noFindings")}</div>}
      {output && output.dropped > 0 && <div style={s.dropped}>{t("drawer.dropped", { count: output.dropped })}</div>}
      {result.error && <div style={s.drawerError}>{result.error}</div>}
    </li>
  );
}

export function RunDrawer({
  runId,
  onClose,
  returnFocusTo,
}: {
  runId: string;
  onClose: () => void;
  /** The element that opened the drawer; it gets focus back when the drawer closes. */
  returnFocusTo: HTMLElement | null;
}) {
  const t = useTranslations("eval");
  const { data, isError } = useEvalRun(runId);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    closeRef.current?.focus();
    return () => returnFocusTo?.focus();
  }, [returnFocusTo]);

  let body: React.ReactNode;
  if (isError) body = <div style={s.drawerError}>{t("drawer.loadError")}</div>;
  else if (!data) body = <div style={s.drawerMuted}>{t("drawer.loading")}</div>;
  else
    body = (
      <>
        {data.status === "failed" && data.error && <div style={s.drawerError}>{data.error}</div>}
        <ul style={s.resultList}>
          {data.results.map((r) => (
            <ResultBlock key={r.id} result={r} />
          ))}
        </ul>
      </>
    );

  return (
    <div role="dialog" aria-modal="true" aria-label={t("drawer.label")} style={s.drawer}>
      <div style={s.drawerHead}>
        <span className="mono" style={s.drawerTitle}>
          {data
            ? t("drawer.title", { version: `v${data.config.agent_version}`, time: formatRunTime(data.started_at) })
            : t("drawer.label")}
        </span>
        <button ref={closeRef} type="button" aria-label={t("drawer.close")} onClick={onClose} style={s.closeBtn}>
          <Icon.X size={14} />
        </button>
      </div>
      <div style={s.drawerBody}>{body}</div>
    </div>
  );
}

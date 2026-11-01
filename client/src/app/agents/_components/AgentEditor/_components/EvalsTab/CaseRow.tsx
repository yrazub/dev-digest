/* CaseRow — one eval case: its outcome in the latest done run, name, kind, location, an expand
   toggle that shows the stored diff fragment as text, and Delete. The two controls are native
   buttons: the vendored IconBtn has neither `disabled` nor `aria-expanded`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { KIND_PILL, NEVER_RUN_ICON, OUTCOME_ICON } from "@/components/eval";
import type { EvalCaseOutcome, EvalCaseRecord } from "@devdigest/shared";
import { caseLocation } from "./helpers";
import { s } from "./styles";

export function CaseRow({
  c,
  outcome,
  deleteBlocked,
  onDelete,
}: {
  c: EvalCaseRecord;
  /** Undefined when the case has no result in the latest done run ("never run"). */
  outcome: EvalCaseOutcome | undefined;
  deleteBlocked: boolean;
  onDelete: (c: EvalCaseRecord) => void;
}) {
  const t = useTranslations("eval");
  const [expanded, setExpanded] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  const icon = outcome ? OUTCOME_ICON[outcome] : NEVER_RUN_ICON;
  const OutcomeIcon = Icon[icon.icon];
  const outcomeLabel = outcome ? t(`runs.outcome.${outcome}`) : t("evalsTab.neverRun");
  const pill = KIND_PILL[c.expected_output.kind];
  const location = caseLocation(c);
  const ExpandIcon = expanded ? Icon.ChevronDown : Icon.ChevronRight;
  const showControls = hovered || focused;

  return (
    <li style={s.caseItem}>
      <div
        style={s.caseRow(hovered)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span role="img" aria-label={outcomeLabel} title={outcomeLabel} style={s.outcomeIcon(icon.color)}>
          <OutcomeIcon size={15} />
        </span>
        <div style={s.caseText}>
          <div style={s.nameLine}>
            <span className="mono" style={s.caseName} title={c.name}>
              {c.name}
            </span>
            <span style={s.kindPill(pill.color, pill.bg, pill.border)}>{t(`kind.${c.expected_output.kind}`)}</span>
          </div>
          <div style={s.subLine} title={location}>
            {location}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={t("evalsTab.expandCase", { name: c.name })}
          onClick={() => setExpanded((v) => !v)}
          style={s.rowBtn({ active: showControls || expanded, disabled: false, danger: false })}
        >
          <ExpandIcon size={14} />
        </button>
        <button
          type="button"
          aria-label={t("evalsTab.deleteCase", { name: c.name })}
          disabled={deleteBlocked}
          onClick={() => onDelete(c)}
          style={s.rowBtn({ active: showControls, disabled: deleteBlocked, danger: true })}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
      {expanded && (
        <pre className="mono" style={s.fragment}>
          {c.input_diff}
        </pre>
      )}
    </li>
  );
}

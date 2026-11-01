/* EvalCaseAction — the "Turn into eval case" control of a FindingCard: the button, its
   disabled reasons, and the saved / in-set / error line under the action row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, MonoLink } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useAgentEvalCases, useCreateEvalCase } from "@/lib/hooks/evals";
import { evalActionState, kindOf } from "./helpers";
import { s } from "./styles";

export function EvalCaseAction({ f, agentId }: { f: FindingRecord; agentId: string | null }) {
  const t = useTranslations("prReview");
  const descId = React.useId();
  const cases = useAgentEvalCases(agentId);
  const create = useCreateEvalCase(agentId);

  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const state = evalActionState({
    accepted,
    dismissed,
    agentId,
    inSet: cases.data?.cases.some((c) => c.source_finding_id === f.id) ?? false,
    pending: create.isPending,
    saved: create.isSuccess,
  });
  const evalsHref = agentId ? `/agents/${agentId}?tab=evals` : undefined;
  const link = <MonoLink href={evalsHref}>{t("finding.viewInEvals")}</MonoLink>;

  if (state === "saved") {
    const kind = create.data?.case.expected_output.kind ?? kindOf(f);
    return (
      <div style={s.line}>
        <span>{t(`finding.evalSaved.${kind}`)}</span>
        {link}
      </div>
    );
  }
  if (state === "inSet") {
    return (
      <div style={s.line}>
        <span>{t("finding.inEvalSet")}</span>
        {link}
      </div>
    );
  }

  const hint = t(accepted ? "finding.toEvalHint.accepted" : "finding.toEvalHint.dismissed");
  if (state === "noAgent" || state === "open" || state === "pending") {
    const reason =
      state === "noAgent" ? t("finding.toEvalNoAgent") : state === "open" ? t("finding.toEvalOpen") : hint;
    return (
      <span title={reason} style={s.tooltipWrap}>
        <Button kind="ghost" size="sm" icon="FlaskConical" disabled aria-describedby={descId}>
          {t("finding.toEval")}
        </Button>
        <span id={descId} style={s.visuallyHidden}>
          {reason}
        </span>
      </span>
    );
  }

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        title={hint}
        onClick={() => create.mutate(f.id)}
      >
        {t("finding.toEval")}
      </Button>
      {create.isError && (
        <div role="status" style={s.error}>
          {create.error.message}
        </div>
      )}
    </>
  );
}

/* RunEvalButton — "Run eval (N)" for one agent, shared by the Evals tab and the agent view.
   Disabled with "Running… k/N" while a run of the agent is `running`, and while the agent has
   no case. A failed start shows its message next to the button; a missing provider key adds a
   link to the Settings page for API keys. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useStartEvalRun } from "@/lib/hooks/evals";
import type { EvalSuiteRun } from "@devdigest/shared";
import { runningRun } from "./helpers";
import { s } from "./styles";

type RunProgress = Pick<EvalSuiteRun, "status" | "cases_done" | "cases_total">;

function StartError({ error }: { error: Error }) {
  const t = useTranslations("eval");
  const noKey = error instanceof ApiError && error.code === "eval_unavailable";
  return (
    <p role="alert" style={s.runError}>
      <span>{error.message}</span>
      {noKey && (
        <Link href="/settings/api-keys" style={s.runErrorLink}>
          {t("evalsTab.noKey")}
        </Link>
      )}
    </p>
  );
}

export function RunEvalButton({
  agentId,
  caseCount,
  runs,
  kind,
}: {
  agentId: string;
  caseCount: number;
  runs: readonly RunProgress[];
  kind: "primary" | "secondary";
}) {
  const t = useTranslations("eval");
  const start = useStartEvalRun(agentId);
  const running = runningRun(runs);
  const label = running
    ? t("dashboard.runningProgress", { done: running.cases_done, total: running.cases_total })
    : t("dashboard.runEval", { count: caseCount });

  return (
    <span style={s.runButton}>
      <Button
        kind={kind}
        size="sm"
        icon="Play"
        disabled={running !== null || caseCount === 0 || start.isPending}
        onClick={() => start.mutate()}
      >
        {label}
      </Button>
      {start.isError && <StartError error={start.error} />}
    </span>
  );
}

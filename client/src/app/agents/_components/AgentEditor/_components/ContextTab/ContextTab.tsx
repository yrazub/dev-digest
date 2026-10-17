/* ContextTab — which repository documents this agent attaches, and in what order
   (design N2b). The shared list owns the rows; this tab supplies the agent's paths
   and its save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ContextAttachList } from "@/components/context-attach-list";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/context";

export function ContextTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data, isLoading, isError, refetch } = useAgentContext(agentId);
  const { save } = useSetAgentContext(agentId);
  return (
    <ContextAttachList
      heading={t("context.heading")}
      paths={data?.paths}
      pathsLoading={isLoading}
      pathsError={isError}
      onRetryPaths={() => void refetch()}
      onSave={save}
    />
  );
}

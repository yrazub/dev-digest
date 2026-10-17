/* ContextTab — which repository documents this skill brings along, and in what
   order (design N2c, "Project context to use"). The shared list owns the rows; this
   tab supplies the skill's paths and its save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ContextAttachList } from "@/components/context-attach-list";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/context";

export function ContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillContext(skillId);
  const { save } = useSetSkillContext(skillId);
  return (
    <ContextAttachList
      heading={t("detail.context.heading")}
      paths={data?.paths}
      pathsLoading={isLoading}
      pathsError={isError}
      onRetryPaths={() => void refetch()}
      onSave={save}
      compact
    />
  );
}

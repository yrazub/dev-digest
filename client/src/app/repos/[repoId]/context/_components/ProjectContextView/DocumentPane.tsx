/* DocumentPane — the selected document of the Project Context page: path, kind,
   tokens, "Used by" and the content as safe markdown. View only (R-WEB-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { SafeMarkdown } from "@/components/safe-markdown";
import { kindColor } from "@/lib/context-display";
import { useContextFile } from "@/lib/hooks/context";
import { s } from "./styles";

export function DocumentPane({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextFile(repoId, path);

  if (isError) return <ErrorState body={t("page.fileLoadError")} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div style={s.stack}>
        <Skeleton height={20} width="50%" />
        <Skeleton height={160} />
      </div>
    );
  }

  const { agents_direct, agents_via_skill, skills } = data.used_by;
  const agents = agents_direct + agents_via_skill;
  const usedBy =
    agents_via_skill > 0
      ? t("page.usedByVia", { agents, via: agents_via_skill, skills })
      : t("page.usedBy", { agents, skills });

  let body: React.ReactNode;
  if (data.content !== null) body = <SafeMarkdown>{data.content}</SafeMarkdown>;
  else body = <div style={s.muted}>{data.status === "too_large" ? t("page.tooLarge") : t("page.unreadable")}</div>;

  return (
    <div style={s.pane}>
      <div style={s.paneHeader}>
        <span className="mono" style={s.panePath}>
          {data.path}
        </span>
        <Badge color={kindColor(data.kind)}>{data.kind}</Badge>
        {data.tokens !== null && <span style={s.paneMeta}>{t("page.tokens", { count: data.tokens })}</span>}
      </div>
      <div style={s.paneMeta}>{usedBy}</div>
      <div style={s.content}>{body}</div>
    </div>
  );
}

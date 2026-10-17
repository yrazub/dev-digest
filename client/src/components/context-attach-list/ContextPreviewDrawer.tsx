/* ContextPreviewDrawer — a document's content in the vendored Drawer, with the
   Attach / Attached toggle that saves like the row's checkbox. The Drawer has no
   Esc handling, so this component closes itself on the key. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Skeleton } from "@devdigest/ui";
import { SafeMarkdown } from "@/components/safe-markdown";
import { kindColor } from "@/lib/context-display";
import { useContextFile } from "@/lib/hooks/context";
import type { AttachRow } from "./helpers";
import { s } from "./styles";

export function ContextPreviewDrawer({
  repoId,
  row,
  onToggle,
  onClose,
}: {
  repoId: string;
  row: AttachRow;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextFile(repoId, row.path);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doc = row.doc;
  const blocked = doc !== null && doc.status !== "ok" && !row.attached;

  let usedBy: string | null = null;
  if (data) {
    const { agents_direct, agents_via_skill, skills } = data.used_by;
    const agents = agents_direct + agents_via_skill;
    usedBy =
      agents_via_skill > 0
        ? t("page.usedByVia", { agents, via: agents_via_skill, skills })
        : t("page.usedBy", { agents, skills });
  }

  let body: React.ReactNode;
  if (isError) body = <ErrorState body={t("page.fileLoadError")} onRetry={() => refetch()} />;
  else if (isLoading || !data) body = <Skeleton height={160} />;
  else if (data.content !== null) body = <SafeMarkdown>{data.content}</SafeMarkdown>;
  else body = <div style={s.muted}>{data.status === "too_large" ? t("attach.tooLarge") : t("attach.unreadable")}</div>;

  return (
    <Drawer
      title={
        <span className="mono" style={{ overflowWrap: "anywhere" }}>
          {row.path}
        </span>
      }
      onClose={onClose}
    >
      <div style={s.drawerMeta}>
        {doc && <Badge color={kindColor(doc.kind)}>{doc.kind}</Badge>}
        {doc?.tokens != null && <span style={s.muted}>{t("page.tokens", { count: doc.tokens })}</span>}
        <Button
          size="sm"
          kind={row.attached ? "primary" : "secondary"}
          disabled={blocked}
          onClick={() => onToggle(!row.attached)}
        >
          {row.attached ? t("attach.attached") : t("attach.attach")}
        </Button>
      </div>
      {usedBy && <div style={s.drawerNote}>{usedBy}</div>}
      <div style={s.drawerContent}>{body}</div>
    </Drawer>
  );
}

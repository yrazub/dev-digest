/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional findings: marks and cards of a review, drawn through DiffFindingApi. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingApi } from "../findings";
import { type DiffJumpTarget } from "../helpers";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  defaultOpen,
  target,
  onJumped,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Initial open state of every file card; when absent each card decides by size. */
  defaultOpen?: boolean;
  /** The file (and line) a navigation points at; the card of that file opens and scrolls to it. */
  target?: DiffJumpTarget;
  /** Called by the target card once it has scrolled, so the jump is not repeated. */
  onJumped?: () => void;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard
          key={f.path}
          file={f}
          commenting={commenting}
          findings={findings}
          defaultOpen={defaultOpen}
          jump={target?.path === f.path ? { line: target.line, pending: target.pending } : undefined}
          onJumped={onJumped}
        />
      ))}
    </div>
  );
}

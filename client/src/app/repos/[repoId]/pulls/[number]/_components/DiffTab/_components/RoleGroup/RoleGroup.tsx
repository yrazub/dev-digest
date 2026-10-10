/* RoleGroup — one role's header (a button that collapses it) and its files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { ROLE_META } from "../../constants";
import { groupFindingMark } from "../../helpers";
import { s } from "../../styles";

export function RoleGroup({
  role,
  files,
  commenting,
  findings,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(!meta.startsCollapsed);
  const mark = groupFindingMark(files, findings?.findings ?? []);

  return (
    <div style={s.group}>
      <button
        type="button"
        aria-expanded={open}
        style={s.groupHeader}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.ChevronRight size={13} style={s.groupChevron(open)} />
        <span aria-hidden style={s.roleSquare(meta.color)} />
        <span style={s.groupLabel}>{t(meta.labelKey)}</span>
        <span style={s.groupHint}>{t(meta.hintKey)}</span>
        {mark ? (
          <span
            role="img"
            aria-label={t("smartDiff.filesWithFindings", { count: mark.files })}
            title={t("smartDiff.filesWithFindings", { count: mark.files })}
            style={s.groupMark}
          >
            <span aria-hidden style={s.markDot(SEV[mark.severity].c)} />
            <span aria-hidden>{mark.files}</span>
          </span>
        ) : null}
        <span style={s.groupCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open ? (
        <div style={s.groupBody}>
          <DiffViewer
            files={files}
            commenting={commenting}
            findings={findings}
            defaultOpen={meta.startsCollapsed ? false : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}

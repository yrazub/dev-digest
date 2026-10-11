/* DegradedNote — the mark of an answer that may be incomplete: a title and the sentence of
   the reason. The map, when there is one, stays rendered under it. For the reasons a resync can
   fix it also holds the Resync button (ResyncAction, which owns the wait). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { RESYNC_FIXABLE_REASONS } from "../../constants";
import { s } from "../../styles";
import { ResyncAction } from "./ResyncAction";

interface DegradedNoteProps {
  reason: BlastDegradedReason;
  repoId: string;
  prId: string;
}

export function DegradedNote({ reason, repoId, prId }: DegradedNoteProps) {
  const t = useTranslations("blast");

  const sentence = (
    <>
      <span style={s.noteTitle}>{t("degraded.title")}</span>
      {" "}
      <span>{t(`degraded.reason.${reason}`)}</span>
    </>
  );

  return (
    <div role="note" aria-label={t("degraded.title")} style={s.note}>
      <Icon.AlertTriangle size={14} style={s.noteIcon} />
      {RESYNC_FIXABLE_REASONS.has(reason) ? (
        <ResyncAction repoId={repoId} prId={prId}>
          {sentence}
        </ResyncAction>
      ) : (
        <span>{sentence}</span>
      )}
    </div>
  );
}

/* DegradedNote — the mark of an answer that may be incomplete: a title and the sentence of
   the reason. The map, when there is one, stays rendered under it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { s } from "../../styles";

export function DegradedNote({ reason }: { reason: BlastDegradedReason }) {
  const t = useTranslations("blast");
  return (
    <div role="note" aria-label={t("degraded.title")} style={s.note}>
      <Icon.AlertTriangle size={14} style={s.noteIcon} />
      <span>
        <span style={s.noteTitle}>{t("degraded.title")}</span>
        {" "}
        <span>{t(`degraded.reason.${reason}`)}</span>
      </span>
    </div>
  );
}

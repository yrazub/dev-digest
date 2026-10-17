/* SkippedContextDocs — the project-context documents a run did not send, each with a
   readable reason. Shown under the Project context block, or on its own when the block
   is hidden. Paths and reasons are rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PromptAssembly } from "@devdigest/shared";
import { s } from "../../styles";

export function SkippedContextDocs({
  skipped,
  title,
}: {
  skipped: NonNullable<PromptAssembly["specs_skipped"]>;
  title: string;
}) {
  const t = useTranslations("runs");
  if (skipped.length === 0) return null;

  return (
    <div style={s.specsSkippedWrap}>
      <span style={s.specsSkippedTitle}>{title}</span>
      {skipped.map((doc, i) => (
        <span key={`${doc.origin}:${doc.skill_name ?? ""}:${doc.path}:${i}`} className="mono" style={s.specsSkippedRow}>
          {doc.path} — {t(`trace.prompt.skipReason.${doc.reason}`)}
        </span>
      ))}
    </div>
  );
}

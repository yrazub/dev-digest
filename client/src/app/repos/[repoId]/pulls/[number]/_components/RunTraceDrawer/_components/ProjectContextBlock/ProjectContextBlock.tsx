/* ProjectContextBlock — the Project context segment of Prompt assembly: the whole
   section as sent, one expandable block per inserted document, and the skipped
   documents with a readable reason. Every text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PromptAssembly } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { s } from "../../styles";
import { PromptBlock } from "../PromptBlock";

export function ProjectContextBlock({ assembly }: { assembly: PromptAssembly }) {
  const t = useTranslations("runs");
  const loaded = assembly.specs_loaded ?? [];
  const skipped = assembly.specs_skipped ?? [];
  const tokens = assembly.specs_tokens;
  const calls = assembly.specs_calls;

  let meta: string | undefined;
  if (tokens != null && calls != null && calls > 1) {
    meta = t("trace.prompt.specsPerCall", { tokens, calls });
  } else if (tokens != null) {
    meta = t("trace.prompt.tokens", { count: tokens });
  }

  return (
    <>
      <PromptBlock
        label={t("trace.prompt.specs")}
        text={assembly.specs ?? ""}
        color={PROMPT_COLORS.specs}
        meta={meta}
      />
      {loaded.map((doc, i) => (
        <PromptBlock
          key={`${doc.origin}:${doc.skill_name ?? ""}:${doc.path}:${i}`}
          label={doc.path}
          text={doc.text}
          color={PROMPT_COLORS.specs}
          meta={t("trace.prompt.tokens", { count: doc.tokens })}
        />
      ))}
      {skipped.length > 0 && (
        <div style={s.specsSkippedWrap}>
          <span style={s.specsSkippedTitle}>{t("trace.prompt.specsSkipped")}</span>
          {skipped.map((doc, i) => (
            <span key={`${doc.origin}:${doc.skill_name ?? ""}:${doc.path}:${i}`} className="mono" style={s.specsSkippedRow}>
              {doc.path} — {t(`trace.prompt.skipReason.${doc.reason}`)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

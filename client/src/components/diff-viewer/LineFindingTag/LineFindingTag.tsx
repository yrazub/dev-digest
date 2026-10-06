/* LineFindingTag — the right-edge tag of a line with a counted finding: the
   severity icon and a word. Rendered only when findings are passed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { fs } from "../styles";

export function LineFindingTag({ severity }: { severity: Severity }) {
  const t = useTranslations("prReview");
  const I = Icon[SEV[severity].icon];
  return (
    <span style={{ ...fs.tag, color: SEV[severity].c, background: SEV[severity].bg }}>
      <I size={11} />
      {t(`smartDiff.lineTag.${severity}`)}
    </span>
  );
}

/* FindingDot — the file-card header mark: a dot in the colour of the file's
   most severe counted finding. Rendered only when findings are passed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { fs } from "../styles";

export function FindingDot({ severity }: { severity: Severity }) {
  const t = useTranslations("prReview");
  return (
    <span
      role="img"
      aria-label={t("smartDiff.fileHasFindings")}
      style={{ ...fs.dot, background: SEV[severity].c }}
    />
  );
}

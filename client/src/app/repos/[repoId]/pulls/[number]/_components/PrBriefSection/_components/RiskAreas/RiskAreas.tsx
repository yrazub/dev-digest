/* RiskAreas — the brief's risks as a wrapping row of entries inside the Intent card.
   Titles and file references are model text: plain text nodes, never links or markup. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_KIND_ICON, SEVERITY_COLOR } from "../../constants";
import { s } from "./styles";

export function RiskAreas({ risks }: { risks: Risk[] }) {
  const t = useTranslations("brief");
  return (
    <div>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <div style={s.row}>
          {risks.map((risk, i) => {
            const KindIcon = Icon[RISK_KIND_ICON[risk.kind] ?? "AlertTriangle"];
            return (
              <div key={`${risk.kind}-${i}`} style={s.entry}>
                <span style={s.title}>
                  <KindIcon size={13} style={s.icon(SEVERITY_COLOR[risk.severity])} />
                  <span>{risk.title}</span>
                </span>
                {risk.file_refs.map((ref, j) => (
                  <span key={`${ref}-${j}`} className="mono" style={s.ref}>
                    {ref}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

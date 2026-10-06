/* OrderSwitch — Smart order / Original order, two plain buttons (the kit has no
   segmented control). The active one carries aria-pressed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../../styles";

export type FilesOrder = "smart" | "original";

export function OrderSwitch({
  value,
  onChange,
}: {
  value: FilesOrder;
  onChange: (next: FilesOrder) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.orderSwitch}>
      <button
        type="button"
        aria-pressed={value === "smart"}
        style={s.orderButton(value === "smart")}
        onClick={() => onChange("smart")}
      >
        {t("smartDiff.smartOrder")}
      </button>
      <button
        type="button"
        aria-pressed={value === "original"}
        style={s.orderButton(value === "original")}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </button>
    </div>
  );
}

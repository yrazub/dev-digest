/* RegressionBanner — shown while the latest done run's precision is below the previous done
   run's (R-WEB-54). */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function RegressionBanner({ n, version }: { n: number; version: number }) {
  const t = useTranslations("eval");
  return (
    <div role="status" style={s.banner}>
      <span style={s.bannerIcon}>
        <Icon.AlertTriangle size={16} />
      </span>
      <span style={s.bannerText}>{t("dashboard.regression", { n, version })}</span>
    </div>
  );
}

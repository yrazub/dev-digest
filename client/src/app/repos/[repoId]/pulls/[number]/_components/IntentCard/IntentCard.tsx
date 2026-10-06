/* IntentCard — the PR's derived intent (L03): summary, scope lists, risk areas,
   confidence, sources and any missing context. Sits above the review results on
   the Overview and Agent runs tabs. Model-derived text is rendered as text nodes only. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, Card, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { usePrIntent, useRegenerateIntent } from "@/lib/hooks/intent";
import { CONFIDENCE_STYLE, RISK_ICON } from "./constants";
import { sourceLabel, unreadReferences, type Translate } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId, poll }: { prId: string | null; poll: boolean }) {
  const t = useTranslations("brief");
  const { data, isLoading } = usePrIntent(prId, { poll });
  const regenerate = useRegenerateIntent(prId);
  const record = data?.intent ?? null;
  const rerun = () => {
    if (!regenerate.isPending) regenerate.mutate();
  };

  return (
    <section aria-label={t("block.intent")}>
      <Card>
        {isLoading ? (
          <div style={s.stack}>
            <Skeleton height={14} width={120} />
            <Skeleton height={44} />
          </div>
        ) : record ? (
          <IntentBody record={record} onRerun={rerun} />
        ) : (
          <div style={s.empty}>
            <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
            <p style={s.emptyTitle}>{t("intent.emptyTitle")}</p>
            <p style={s.muted}>{t("intent.emptyHint")}</p>
            <div style={s.emptyAction}>
              <Button kind="primary" size="sm" loading={regenerate.isPending} onClick={rerun}>
                {t("intent.derive")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function IntentBody({ record, onRerun }: { record: PrIntentRecord; onRerun: () => void }) {
  const t = useTranslations("brief");
  const format = useFormatter();
  const conf = CONFIDENCE_STYLE[record.confidence];
  const unread = unreadReferences(record.sources).map((src) => sourceLabel(src, t as Translate));
  const hasMeta = record.model != null || record.cost_usd != null;

  return (
    <div style={s.stack}>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerRight}>
            <Badge dot color={conf.color} bg={conf.bg}>
              {t(`intent.confidence.${record.confidence}`)}
            </Badge>
            <IconBtn icon="RefreshCw" label={t("intent.rerun")} onClick={onRerun} />
          </div>
        }
      >
        {t("block.intent")}
      </SectionLabel>

      <p style={s.quote}>{`“${record.summary}”`}</p>

      {record.missing_context && (
        <p style={s.warning}>
          <Icon.AlertTriangle size={14} style={s.warningIcon} />
          <span>
            {t("intent.missingContext", {
              sources: format.list(unread, { type: "conjunction", style: "long" }),
            })}
          </span>
        </p>
      )}

      {/* A medium tier reached only because linked material was unread is explained by the
          warning above; the generic "inferred" hint would give a second, wrong reason. */}
      {record.confidence !== "high" && !(record.confidence === "medium" && record.missing_context) && (
        <p style={s.muted}>{t(`intent.confidenceHint.${record.confidence}`)}</p>
      )}
      {record.stale && <p style={s.muted}>{t("intent.stale")}</p>}
      {record.injection_suspected && (
        <div style={s.badgeRow}>
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            {t("intent.injectionSuspected")}
          </Badge>
        </div>
      )}

      <div style={s.grid}>
        <ScopeColumn title={t("intent.inScope")} items={record.in_scope} included />
        <ScopeColumn title={t("intent.outOfScope")} items={record.out_of_scope} included={false} />
      </div>

      {record.risk_areas.length > 0 && (
        <div style={{ ...s.divider, ...s.badgeRow }}>
          <span style={s.rowLabel}>{t("intent.riskAreas")}</span>
          {record.risk_areas.map((area, i) => (
            <Badge key={`${area.kind}:${i}`} icon={RISK_ICON[area.kind]}>
              {area.label}
            </Badge>
          ))}
        </div>
      )}

      <div style={s.sourcesRow}>
        <span style={s.rowLabel}>{t("intent.derivedFrom")}</span>
        {record.sources.map((src, i) => {
          const missing = src.status === "unavailable";
          return (
            <Badge
              key={`${src.kind}:${src.ref ?? ""}:${i}`}
              mono
              icon={missing ? "AlertTriangle" : undefined}
              color={missing ? "var(--text-muted)" : undefined}
              style={missing ? s.sourceMuted : undefined}
            >
              <span>{sourceLabel(src, t as Translate)}</span>
              {missing && <span>{t("intent.sourceNotRead")}</span>}
            </Badge>
          );
        })}
        {hasMeta && (
          <span style={s.meta}>
            {record.model != null && <span className="mono">{record.model}</span>}
            <span>{formatCostUsd(record.cost_usd)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function ScopeColumn({
  title,
  items,
  included,
}: {
  title: string;
  items: string[];
  included: boolean;
}) {
  const t = useTranslations("brief");
  const ItemIcon = included ? Icon.Check : Icon.X;
  return (
    <div>
      <div style={s.columnTitle}>{title}</div>
      {items.length === 0 ? (
        <span style={s.none}>{t("intent.noneStated")}</span>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => (
            <li key={i} style={s.item}>
              <ItemIcon size={13} style={s.itemIcon(included ? "var(--ok)" : "var(--text-muted)")} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

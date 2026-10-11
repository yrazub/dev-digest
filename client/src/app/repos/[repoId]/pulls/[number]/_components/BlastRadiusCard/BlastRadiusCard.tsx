/* BlastRadiusCard — the Blast radius block of the Overview tab (L04): the changed symbols, their
   callers and the endpoints and cron jobs in the calling files, read from the repo-intel index.
   The block shows the answer as it comes: nothing is regrouped, reordered or recounted.
   Repository text is rendered as text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { useBlastRadius } from "@/lib/hooks/blast";
import { BLAST_ICON, BLAST_STATS, SKELETON_ROWS } from "./constants";
import { blastBodyMode, symbolLabel } from "./helpers";
import { s } from "./styles";
import { DegradedNote } from "./_components/DegradedNote";
import { SymbolGroup } from "./_components/SymbolGroup";

interface BlastRadiusCardProps {
  prId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const { data, isError, refetch } = useBlastRadius(prId, headSha);
  const mode = blastBodyMode({ data, isError });
  const title = tBrief("block.blast");

  return (
    <section aria-label={title}>
      <Card>
        {mode === "loading" || mode === "error" || !data ? (
          <div style={s.stack}>
            <SectionLabel icon={BLAST_ICON}>{title}</SectionLabel>
            {mode === "error" ? (
              <div>
                <p style={s.errorTitle}>{t("loadFailed")}</p>
                <div style={s.errorAction}>
                  <Button size="sm" onClick={() => void refetch()}>
                    {t("retry")}
                  </Button>
                </div>
              </div>
            ) : (
              SKELETON_ROWS.map((row) => <Skeleton key={row} height={16} />)
            )}
          </div>
        ) : (
          <div style={s.stack}>
            <SectionLabel icon={BLAST_ICON}>{title}</SectionLabel>

            {mode !== "noFiles" && (
              <div style={s.summaryRow}>
                {BLAST_STATS.map(({ key, icon }) => {
                  const StatIcon = Icon[icon];
                  const count = data.totals[key];
                  return (
                    <span key={key} style={s.stat}>
                      <StatIcon size={14} style={s.statIcon} />
                      <span>
                        <strong style={s.statNumber}>{count}</strong> {t(`stat.${key}`, { count })}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}

            {data.degraded && data.reason && <DegradedNote reason={data.reason} />}

            {mode === "noSymbols" && <p style={s.message}>{t("noSymbols")}</p>}
            {mode === "noCallers" && (
              <p style={s.message}>{t("noDownstream", { count: data.totals.symbols })}</p>
            )}
            {mode === "map" && (
              <MapBody data={data} repoFullName={repoFullName} headSha={headSha} />
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

function MapBody({
  data,
  repoFullName,
  headSha,
}: {
  data: BlastRadiusResponse;
  repoFullName: string | null;
  headSha: string | null;
}) {
  const t = useTranslations("blast");
  const withoutCallers = data.changed_symbols.length - data.downstream.length;
  return (
    <div style={s.groups}>
      {data.downstream.map((group) => (
        <SymbolGroup
          key={group.symbol}
          group={group}
          label={symbolLabel(group.symbol, data.changed_symbols)}
          callerLimit={data.caller_limit}
          repoFullName={repoFullName}
          indexedSha={data.indexed_sha}
          headSha={headSha}
        />
      ))}
      {withoutCallers > 0 && <p style={s.muted}>{t("moreWithoutCallers", { count: withoutCallers })}</p>}
    </div>
  );
}

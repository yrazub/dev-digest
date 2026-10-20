/* PrBriefSection — the PR Brief on the Overview tab (L05): the brief's summary, the notes on what
   it was built from, and the Intent | Blast radius grid. Reads with GET on mount; a model call
   only runs from Generate, Regenerate or the stale mark. Model text is rendered as text nodes only. */
"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Card, Icon, IconBtn, SectionLabel } from "@devdigest/ui";
import type { BriefInput, PrBriefRecord } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { IntentCard } from "../IntentCard";
import { ReviewFocus } from "./_components/ReviewFocus";
import { RiskAreas } from "./_components/RiskAreas";
import { briefViewMode, generateErrorKind, inputsLine, shortSha } from "./helpers";
import { useMediaQuery } from "./use-media-query";
import { s } from "./styles";

interface PrBriefSectionProps {
  prId: string;
  headSha: string | null;
  repoId: string;
  repoFullName: string | null;
  poll: boolean;
  /** Opens Files changed at a Review focus item's file and line. */
  onOpenFocus: (file: string, line: number) => void;
}

export function PrBriefSection({
  prId,
  headSha,
  repoId,
  repoFullName,
  poll,
  onOpenFocus,
}: PrBriefSectionProps) {
  const t = useTranslations("brief");
  const narrow = useMediaQuery("(max-width: 899px)");
  const { data, isLoading, isError, refetch } = usePrBrief(prId, headSha);
  const generate = useGenerateBrief(prId, headSha);
  const mode = briefViewMode({ isLoading, isError, data });
  const brief = data?.brief ?? null;
  const run = () => generate.mutate();

  return (
    <section aria-label={t("section")}>
      <SectionLabel
        icon="FileText"
        right={
          generate.isPending ? (
            <Button size="sm" disabled>
              {t("generating")}
            </Button>
          ) : brief ? (
            <IconBtn icon="RefreshCw" label={t("regenerate")} onClick={run} />
          ) : undefined
        }
      >
        {t("section")}
      </SectionLabel>

      <div style={s.body}>
        {generate.isError && <GenerateError error={generate.error} />}
        {mode === "error" && <LoadError onRetry={() => void refetch()} />}
        {mode === "empty" && <EmptyCard pending={generate.isPending} onGenerate={run} />}
        {mode === "brief" && brief && (
          <BriefSummary brief={brief} pending={generate.isPending} onRegenerate={run} />
        )}

        <div style={s.grid(narrow)}>
          <IntentCard
            prId={prId}
            poll={poll}
            hideRiskTags
            footer={brief ? <RiskAreas risks={brief.risks.risks} /> : null}
          />
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
        </div>

        {mode === "brief" && brief && (
          <>
            <ReviewFocus items={brief.review_focus} onOpen={onOpenFocus} />
            <BriefFooter brief={brief} />
          </>
        )}
      </div>
    </section>
  );
}

function GenerateError({ error }: { error: unknown }) {
  const t = useTranslations("brief");
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" style={s.generateError}>
      <span>{message}</span>
      {generateErrorKind(error) === "no_api_key" && (
        <Link href="/settings/api-keys" style={s.link}>
          {t("noApiKey")}
        </Link>
      )}
    </p>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("brief");
  return (
    <Card>
      <div style={s.emptyCard}>
        <p style={s.emptyHint}>{t("loadFailed")}</p>
        <Button size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    </Card>
  );
}

function EmptyCard({ pending, onGenerate }: { pending: boolean; onGenerate: () => void }) {
  const t = useTranslations("brief");
  return (
    <Card>
      <div style={s.emptyCard}>
        <div style={s.emptyIcon}>
          <Icon.FileText size={24} />
        </div>
        <p style={s.emptyTitle}>{t("unavailable")}</p>
        <p style={s.emptyHint}>{t("unavailableHint")}</p>
        <Button kind="primary" icon="FileText" disabled={pending} onClick={onGenerate}>
          {pending ? t("generating") : t("generate")}
        </Button>
      </div>
    </Card>
  );
}

function BriefSummary({
  brief,
  pending,
  onRegenerate,
}: {
  brief: PrBriefRecord;
  pending: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("brief");
  const inputsNote = useInputsNote(brief.inputs);
  return (
    <div style={s.summaryPanel}>
      <p style={s.summary}>{brief.summary}</p>
      {inputsNote && (
        <p style={s.note}>
          <Icon.AlertTriangle size={14} style={s.noteIcon} />
          <span>{inputsNote}</span>
        </p>
      )}
      {brief.stale && (
        <p style={s.note}>
          <Icon.AlertTriangle size={14} style={s.noteIcon} />
          <span>{t("stale", { sha: shortSha(brief.head_sha) })}</span>
          <span style={s.noteAction}>
            <Button size="sm" kind="ghost" disabled={pending} onClick={onRegenerate}>
              {pending ? t("generating") : t("regenerate")}
            </Button>
          </span>
        </p>
      )}
    </div>
  );
}

/** The one line on what the brief was built without, and which inputs were cut to fit. */
function useInputsNote(inputs: BriefInput[]): string | null {
  const t = useTranslations("brief");
  const { missing, trimmed } = inputsLine(inputs);
  const item = (input: BriefInput) => {
    const kind = t(`inputs.kind.${input.kind}`);
    const base = input.reason ? t("inputs.item", { kind, reason: t(`inputs.reason.${input.reason}`) }) : kind;
    return input.omitted != null ? `${base}, ${t("inputs.omitted", { count: input.omitted })}` : base;
  };
  const parts = [
    missing.length > 0 ? t("inputs.without", { list: missing.map(item).join(", ") }) : null,
    trimmed.length > 0 ? t("inputs.trimmed", { list: trimmed.map(item).join(", ") }) : null,
  ].filter((part) => part != null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function BriefFooter({ brief }: { brief: PrBriefRecord }) {
  const t = useTranslations("brief");
  const format = useFormatter();
  const showDropped = brief.dropped.risks > 0 || brief.dropped.review_focus > 0;
  const items = [
    <span key="model" className="mono">
      {brief.model}
    </span>,
    brief.cost_usd != null ? <span key="cost">{formatCostUsd(brief.cost_usd)}</span> : null,
    <span key="generated">
      {t("footer.generated", { time: format.relativeTime(new Date(brief.generated_at)) })}
    </span>,
    brief.input_tokens != null ? (
      <span key="tokens">
        {t("footer.tokens", {
          input: format.number(brief.input_tokens),
          budget: format.number(brief.input_budget_tokens),
        })}
      </span>
    ) : null,
  ].filter((node) => node != null);
  return (
    <div style={s.footer}>
      <div style={s.footerLine}>
        {items.map((node, i) => (
          <React.Fragment key={node.key}>
            {i > 0 && <span>·</span>}
            {node}
          </React.Fragment>
        ))}
      </div>
      {showDropped && (
        <div>{t("dropped", { risks: brief.dropped.risks, focus: brief.dropped.review_focus })}</div>
      )}
    </div>
  );
}

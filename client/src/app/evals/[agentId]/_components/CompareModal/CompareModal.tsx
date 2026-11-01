/* CompareModal — two runs of one agent side by side: Recall / Precision / Citation / Cost tiles
   with signed deltas, the configuration when the model or skills differ, the word-level diff of
   the system prompt, and the cases that changed result. Both runs are read through `useEvalRun`
   (the view has already fetched them, so the cache answers). Every prompt, case and skill text
   is a React text node: no HTML is built from it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, SectionLabel } from "@devdigest/ui";
import { useEvalRun } from "@/lib/hooks/evals";
import { formatCostUsd } from "@/lib/format-cost";
import type { EvalConfigSnapshot, EvalSuiteRunDetail } from "@devdigest/shared";
import { METRIC_COLOR } from "@/components/eval/constants";
import { DeltaLabel } from "@/components/eval/DeltaLabel";
import { deltaPoints, pct } from "@/components/eval/helpers";
import { configDiffers, costDelta, flippedCases, sameConfig } from "./helpers";
import { s } from "./styles";
import { wordDiff } from "./word-diff";

function Tile({
  label,
  oldText,
  newText,
  color,
  delta,
}: {
  label: string;
  oldText: string;
  newText: string;
  color: string;
  delta: React.ReactNode;
}) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileValues}>
        <span style={s.tileOld}>{oldText}</span>
        <span style={s.tileArrow}>
          <Icon.ArrowRight size={13} />
        </span>
        <span style={s.tileNew(color)}>{newText}</span>
        {delta}
      </div>
    </div>
  );
}

function ConfigColumn({ config }: { config: EvalConfigSnapshot }) {
  const t = useTranslations("eval");
  return (
    <div style={s.configCol}>
      <div style={s.configHead}>v{config.agent_version}</div>
      <div className="mono" style={s.configLine} title={config.model}>
        {t("dashboard.compare.model")}: {config.model}
      </div>
      <div className="mono" style={s.configLine}>
        {t("dashboard.compare.skills")}:{" "}
        {config.skills.length === 0
          ? t("dashboard.compare.noSkills")
          : config.skills.map((k) => `${k.name}@v${k.version}`).join(", ")}
      </div>
    </div>
  );
}

function PromptDiff({ oldRun, newRun }: { oldRun: EvalSuiteRunDetail; newRun: EvalSuiteRunDetail }) {
  const t = useTranslations("eval");
  const oldPrompt = oldRun.config.system_prompt;
  const newPrompt = newRun.config.system_prompt;
  // O(n·m) over the prompt's tokens: computed once per pair of prompts, not per render.
  const tokens = React.useMemo(() => wordDiff(oldPrompt, newPrompt), [oldPrompt, newPrompt]);
  return (
    <>
      <SectionLabel icon="FileText">{t("dashboard.compare.promptDiff")}</SectionLabel>
      <div style={s.diffLegend}>
        <span style={s.diffLegendItem}>
          <span style={s.diffSwatch("var(--code-del)")} />
          {t("dashboard.compare.old", { version: `v${oldRun.config.agent_version}` })}
        </span>
        <span style={s.diffLegendItem}>
          <span style={s.diffSwatch("var(--code-add)")} />
          {t("dashboard.compare.new", { version: `v${newRun.config.agent_version}` })}
        </span>
      </div>
      <div className="mono" style={s.diffBox}>
        {tokens.map((tok, i) => (
          <span key={i} style={s.diffToken(tok.type)}>
            {tok.text}
          </span>
        ))}
      </div>
    </>
  );
}

function Flipped({ oldRun, newRun }: { oldRun: EvalSuiteRunDetail; newRun: EvalSuiteRunDetail }) {
  const t = useTranslations("eval");
  const flipped = flippedCases(oldRun, newRun);
  return (
    <>
      <SectionLabel icon="GitMerge">{t("dashboard.compare.flipped")}</SectionLabel>
      {flipped.length === 0 ? (
        <p style={s.noChange}>{t("dashboard.compare.noFlips")}</p>
      ) : (
        <ul style={s.flippedList}>
          {flipped.map((f) => {
            const text = t("dashboard.compare.flippedRow", {
              name: f.name,
              old: t(`runs.outcome.${f.old}`),
              new: t(`runs.outcome.${f.new}`),
            });
            return (
              <li key={f.name} className="mono" style={s.flippedRow} title={text}>
                {text}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function CompareModal({
  oldRunId,
  newRunId,
  onClose,
}: {
  oldRunId: string;
  newRunId: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const oldRun = useEvalRun(oldRunId).data;
  const newRun = useEvalRun(newRunId).data;
  if (!oldRun || !newRun) return null;

  const cost = costDelta(oldRun.cost_usd, newRun.cost_usd);
  const metrics = [
    { key: "recall", old: oldRun.recall, new: newRun.recall, color: METRIC_COLOR.recall },
    { key: "precision", old: oldRun.precision, new: newRun.precision, color: METRIC_COLOR.precision },
    { key: "citation", old: oldRun.citation_accuracy, new: newRun.citation_accuracy, color: METRIC_COLOR.citation },
  ] as const;

  return (
    <Modal
      width={960}
      title={t("dashboard.compare.title", {
        old: `v${oldRun.config.agent_version}`,
        new: `v${newRun.config.agent_version}`,
      })}
      subtitle={t("dashboard.compare.subtitle", { count: newRun.cases_total })}
      onClose={onClose}
      footer={
        <Button kind="ghost" onClick={onClose}>
          {t("dashboard.compare.close")}
        </Button>
      }
    >
      <div style={s.compareBody}>
        <div style={s.tiles}>
          {metrics.map((m) => (
            <Tile
              key={m.key}
              label={t(`dashboard.legend.${m.key}`)}
              oldText={pct(m.old)}
              newText={pct(m.new)}
              color={m.color}
              delta={<DeltaLabel delta={deltaPoints(m.new, m.old)} />}
            />
          ))}
          <Tile
            label={t("dashboard.table.cost")}
            oldText={formatCostUsd(oldRun.cost_usd)}
            newText={formatCostUsd(newRun.cost_usd)}
            color="var(--text-primary)"
            delta={cost && <span style={s.costDelta}>{cost}</span>}
          />
        </div>
        {sameConfig(oldRun.config, newRun.config) ? (
          <p style={s.noChange}>{t("dashboard.compare.noChange")}</p>
        ) : (
          <>
            {configDiffers(oldRun.config, newRun.config) && (
              <>
                <SectionLabel icon="Cpu">{t("dashboard.compare.configuration")}</SectionLabel>
                <div style={s.configGrid}>
                  <ConfigColumn config={oldRun.config} />
                  <ConfigColumn config={newRun.config} />
                </div>
              </>
            )}
            <PromptDiff oldRun={oldRun} newRun={newRun} />
          </>
        )}
        <Flipped oldRun={oldRun} newRun={newRun} />
      </div>
    </Modal>
  );
}

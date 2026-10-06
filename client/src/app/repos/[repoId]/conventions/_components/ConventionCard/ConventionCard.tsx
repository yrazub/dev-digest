/* ConventionCard — one extracted convention (design: Conventions (N7)): the
   rule, its category, the evidence (a link to the cited lines on GitHub and
   the real snippet), confidence, and Accept / Reject / Edit. Edit turns the
   rule and category into fields in place (#49). A rejected card shows Restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { Badge, Button, Icon, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import { CONVENTION_CATEGORIES, CONVENTION_RULE_MAX } from "@/lib/convention-rules";
import { useToast } from "@/lib/toast";
import { confidenceColor, evidenceLabel } from "./helpers";
import { s } from "./styles";

export interface ConventionEdit {
  rule: string;
  category: ConventionCategory;
}

export function ConventionCard({
  candidate,
  onToggleAccept,
  onReject,
  onRestore,
  onSave,
}: {
  candidate: ConventionCandidate;
  onToggleAccept: () => void;
  onReject: () => void;
  onRestore: () => void;
  onSave: (edit: ConventionEdit) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState(candidate.category);

  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const ruleValid = rule.trim().length > 0 && rule.trim().length <= CONVENTION_RULE_MAX;
  const label = evidenceLabel(candidate);

  const startEdit = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(true);
  };
  const save = () => {
    if (!ruleValid) return;
    onSave({ rule: rule.trim(), category });
    setEditing(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(candidate.evidence_snippet);
      toast.success(t("card.copied"));
    } catch {
      /* clipboard unavailable: nothing to report */
    }
  };

  return (
    <div style={s.card(accepted)} data-testid="convention-card">
      <div style={s.main}>
        {editing ? (
          <div style={s.editGrid}>
            <div>
              <Textarea value={rule} onChange={setRule} rows={2} placeholder={t("card.rule")} />
              {!ruleValid && <div style={s.error}>{t("card.ruleRequired")}</div>}
            </div>
            <SelectInput
              value={category}
              onChange={(v) => setCategory(v as ConventionCategory)}
              options={CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
              mono={false}
            />
          </div>
        ) : (
          <div style={s.ruleRow}>
            <Badge>{t(`category.${candidate.category}`)}</Badge>
            <span style={s.rule}>{candidate.rule}</span>
          </div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            {candidate.evidence_url ? (
              <a
                className="mono"
                href={candidate.evidence_url}
                target="_blank"
                rel="noreferrer"
                title={t("card.openEvidence", { path: label })}
                style={s.evidenceLink}
              >
                {label} ↗
              </a>
            ) : (
              <span className="mono" style={s.evidenceLink}>
                {label}
              </span>
            )}
            <button type="button" onClick={copy} title={t("card.copySnippet")} aria-label={t("card.copySnippet")} style={s.iconButton}>
              <Icon.Copy size={13} />
            </button>
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar value={candidate.confidence * 100} color={confidenceColor(candidate.confidence)} height={5} />
          </div>
          <span className="mono tnum">{Math.round(candidate.confidence * 100)}%</span>
        </div>

        {editing && (
          <div style={s.editActions}>
            <Button size="sm" kind="ghost" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
            <Button size="sm" kind="primary" onClick={save} disabled={!ruleValid}>
              {t("card.save")}
            </Button>
          </div>
        )}
      </div>

      <div style={s.actions}>
        {rejected ? (
          <Button size="sm" icon="RefreshCw" onClick={onRestore} full>
            {t("card.restore")}
          </Button>
        ) : (
          <>
            <Button size="sm" kind={accepted ? "primary" : "secondary"} icon="Check" onClick={onToggleAccept} full>
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button size="sm" kind="ghost" icon="X" onClick={onReject} full>
              {t("card.reject")}
            </Button>
            {!editing && (
              <Button size="sm" kind="ghost" icon="Edit" onClick={startEdit} full>
                {t("card.edit")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

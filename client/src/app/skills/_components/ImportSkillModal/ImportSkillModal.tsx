/* ImportSkillModal — "Add Skill → Import", in two steps.
   1. Source: a .md / .zip file (drop or pick) or a public https URL.
   2. Preview (mandatory): the parsed draft rendered as the agent will receive
      it, editable metadata, the archive files that were ignored, and a trust
      notice. Nothing is stored until Save, which creates the skill with the
      draft's source. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SkillImportDraft, SkillType } from "@devdigest/shared";
import { SKILL_TYPES, isValidSkillName } from "@/lib/skill-rules";
import { Button, FormField, Icon, Markdown, Modal, SelectInput, TextInput } from "@devdigest/ui";
import { useCreateSkill, useImportSkillFile, useImportSkillUrl } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ACCEPT } from "./constants";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const fromFile = useImportSkillFile();
  const fromUrl = useImportSkillUrl();
  const create = useCreateSkill();
  const inputId = React.useId();

  const [url, setUrl] = React.useState("");
  const [dragOver, setDragOver] = React.useState(false);
  const [draft, setDraft] = React.useState<SkillImportDraft | null>(null);

  const parsing = fromFile.isPending || fromUrl.isPending;
  const onDraft = { onSuccess: (d: SkillImportDraft) => setDraft(d) };
  const pickFile = (file: File | undefined) => {
    if (file) fromFile.mutate(file, onDraft);
  };

  const save = () => {
    if (!draft) return;
    create.mutate(
      { name: draft.name, description: draft.description, type: draft.type, body: draft.body, source: draft.source },
      {
        onSuccess: (skill) => {
          toast.toast(t("import.saved", { name: skill.name }), "success");
          onClose();
          router.push(`/skills/${skill.id}`);
        },
      },
    );
  };

  const edit = (patch: Partial<SkillImportDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const canSave =
    !!draft && isValidSkillName(draft.name) && draft.description.trim().length > 0;

  return (
    <Modal
      width={780}
      title={t("import.title")}
      subtitle={draft ? t("import.previewSubtitle") : t("import.sourceSubtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
        {draft ? (
          <>
            <Button kind="secondary" onClick={() => setDraft(null)}>
              {t("import.back")}
            </Button>
            <Button kind="primary" onClick={save} disabled={!canSave} loading={create.isPending}>
              {create.isPending ? t("import.saving") : t("import.save")}
            </Button>
          </>
        ) : (
          <Button kind="secondary" onClick={onClose}>
            {t("import.cancel")}
          </Button>
        )}
        </div>
      }
    >
      <div style={s.body}>
        {!draft ? (
          <div style={s.source}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files[0]);
              }}
              style={s.drop(dragOver)}
            >
              <Icon.Upload size={20} />
              <div>
                {t("import.dropHere")}{" "}
                <label htmlFor={inputId} style={s.link}>
                  {t("import.browse")}
                </label>
              </div>
              <input
                id={inputId}
                type="file"
                accept={ACCEPT}
                style={s.fileInput}
                data-testid="skill-file-input"
                onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)}
              />
            </div>
            <div style={s.or}>{t("import.or")}</div>
            <FormField label={t("import.urlLabel")}>
              <div style={s.urlRow}>
                <div style={{ flex: 1 }}>
                  <TextInput value={url} onChange={setUrl} placeholder={t("import.urlPlaceholder")} mono />
                </div>
                <Button
                  kind="secondary"
                  icon="Link"
                  onClick={() => fromUrl.mutate(url, onDraft)}
                  disabled={!url.trim()}
                  loading={fromUrl.isPending}
                >
                  {t("import.fetch")}
                </Button>
              </div>
            </FormField>
            {parsing && <div style={s.muted}>{t("import.parsing")}</div>}
          </div>
        ) : (
          <div style={s.preview}>
            <div style={s.trust}>
              <Icon.Shield size={14} />
              {t("import.trustNotice")}
            </div>
            <div style={s.grid}>
              <FormField label={t("form.name")} hint={t("form.nameHint")} required>
                <TextInput value={draft.name} onChange={(v) => edit({ name: v })} mono />
              </FormField>
              <FormField label={t("form.type")}>
                <SelectInput
                  value={draft.type}
                  onChange={(v) => edit({ type: v as SkillType })}
                  options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
                />
              </FormField>
            </div>
            <FormField label={t("form.description")} hint={t("form.descriptionHint")} required>
              <TextInput value={draft.description} onChange={(v) => edit({ description: v })} />
            </FormField>
            {draft.warnings.length > 0 && (
              <div style={s.box}>
                <div style={s.boxTitle}>{t("import.warnings")}</div>
                <ul style={s.ul}>
                  {draft.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {draft.ignored_files.length > 0 && (
              <div style={s.box}>
                <div style={s.boxTitle}>{t("import.ignoredTitle", { count: draft.ignored_files.length })}</div>
                <div style={s.muted}>{t("import.ignoredHint")}</div>
                <ul style={s.ul} className="mono">
                  {draft.ignored_files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={s.boxTitle}>{t("import.renderedBody")}</div>
            <div className="skill-markdown" style={s.rendered}>
              <Markdown>{draft.body}</Markdown>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

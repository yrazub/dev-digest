/* ConfigTab — edit a skill (design: Skill Editor · Config). A body change is
   saved as a new version with an optional change note; metadata edits are not
   versioned. Delete lives in the danger zone. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill, SkillType, SkillUpdate } from "@devdigest/shared";
import { SKILL_TYPES, isValidSkillName } from "@/lib/skill-rules";
import { Button, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { buildPatch, type SkillForm } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill, onDelete }: { skill: Skill; onDelete: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [form, setForm] = React.useState<SkillForm>({
    name: skill.name,
    description: skill.description,
    type: skill.type,
    enabled: skill.enabled,
    body: skill.body,
  });
  const [note, setNote] = React.useState("");

  const patch: SkillUpdate = buildPatch(skill, form, note);
  const dirty = Object.keys(patch).length > 0;
  const bodyDirty = form.body !== skill.body;
  const valid = isValidSkillName(form.name) && !!form.description.trim() && !!form.body.trim();
  const set = <K extends keyof SkillForm>(k: K, v: SkillForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm({ name: skill.name, description: skill.description, type: skill.type, enabled: skill.enabled, body: skill.body });
    setNote("");
  };
  const save = () =>
    update.mutate(
      { id: skill.id, patch },
      { onSuccess: () => toast.toast(t("config.saved"), "success") },
    );

  return (
    <div style={s.wrap}>
      <div style={s.headRow}>
        <h3 style={s.heading}>{t("config.heading")}</h3>
        <label style={s.enabled}>
          {t("form.enabled")}
          <Toggle on={form.enabled} onChange={(v) => set("enabled", v)} size={14} />
        </label>
      </div>
      <div style={s.grid}>
        <FormField label={t("form.name")} hint={t("form.nameHint")} required>
          <TextInput value={form.name} onChange={(v) => set("name", v)} mono />
        </FormField>
        <FormField label={t("form.type")}>
          <SelectInput
            value={form.type}
            onChange={(v) => set("type", v as SkillType)}
            options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
          />
        </FormField>
      </div>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")} required>
        <TextInput value={form.description} onChange={(v) => set("description", v)} />
      </FormField>
      <FormField label={t("form.body")} required>
        <SkillBodyEditor value={form.body} onChange={(v) => set("body", v)} fileName={form.name} dirty={bodyDirty} />
      </FormField>
      {bodyDirty && (
        <FormField label={t("form.versionNote")}>
          <TextInput value={note} onChange={setNote} placeholder={t("form.versionNotePlaceholder")} />
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" onClick={save} disabled={!dirty || !valid} loading={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" onClick={reset} disabled={!dirty || update.isPending}>
          {t("config.cancel")}
        </Button>
        {bodyDirty && <span style={s.hint}>{t("config.snapshotHint", { version: skill.version + 1 })}</span>}
      </div>

      <div style={s.danger}>
        <div>
          <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
          <div style={s.hint}>{t("config.dangerBody")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={onDelete}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}

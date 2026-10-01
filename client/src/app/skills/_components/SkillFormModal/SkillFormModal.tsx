/* SkillFormModal — "Add Skill → Create": name, directive description, type and
   the markdown body. Saves with source "manual" and opens the new skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES, isValidSkillName } from "@/lib/skill-rules";
import { Button, FormField, Modal, SelectInput, TextInput } from "@devdigest/ui";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function SkillFormModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");

  const nameOk = isValidSkillName(name);
  const valid = nameOk && description.trim().length > 0 && body.trim().length > 0;

  const submit = () =>
    create.mutate(
      { name, description: description.trim(), type, body, source: "manual" },
      {
        onSuccess: (skill) => {
          toast.toast(t("create.created", { name: skill.name }), "success");
          onClose();
          router.push(`/skills/${skill.id}`);
        },
      },
    );

  return (
    <Modal
      width={760}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" onClick={submit} disabled={!valid} loading={create.isPending}>
            {create.isPending ? t("create.submitting") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.grid}>
          <FormField label={t("form.name")} hint={t("form.nameHint")} required>
            <TextInput value={name} onChange={setName} placeholder={t("form.namePlaceholder")} mono />
          </FormField>
          <FormField label={t("form.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
            />
          </FormField>
        </div>
        <FormField label={t("form.description")} hint={t("form.descriptionHint")} required>
          <TextInput value={description} onChange={setDescription} placeholder={t("form.descriptionPlaceholder")} />
        </FormField>
        <FormField label={t("form.body")} required>
          <SkillBodyEditor value={body} onChange={setBody} fileName={name} dirty={body.length > 0} rows={14} />
        </FormField>
      </div>
    </Modal>
  );
}

/* CreateConventionSkillModal — "Create skill" on the Conventions page (design:
   Conventions · Create skill). Opens with the server's merged draft of the
   accepted conventions; name, description, type, enabled and the whole body
   are editable before saving (#41 #51). The skill is saved as v1 and is not
   linked to any agent: that happens on the agent's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionSkillDraft, Skill, SkillType } from "@devdigest/shared";
import { Button, ErrorState, FormField, Icon, Modal, SelectInput, Skeleton, TextInput, Toggle } from "@devdigest/ui";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { ApiError } from "@/lib/api";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { SKILL_TYPES, isValidSkillName } from "@/lib/skill-rules";
import { s } from "./styles";

export function CreateConventionSkillModal({
  repoId,
  repoName,
  candidateIds,
  onCreated,
  onClose,
}: {
  repoId: string;
  repoName: string;
  candidateIds: string[];
  onCreated: (skill: Skill) => void;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const draft = useConventionSkillDraft(repoId);
  const create = useCreateConventionSkill(repoId);
  const [form, setForm] = React.useState<ConventionSkillDraft & { enabled: boolean }>();

  // The selection the modal opened with; later changes on the page do not move it.
  const [ids] = React.useState(candidateIds);
  const { mutate: loadDraft } = draft;
  const fetchDraft = React.useCallback(
    () => loadDraft(ids, { onSuccess: (d) => setForm({ ...d, enabled: true }) }),
    [loadDraft, ids],
  );
  React.useEffect(fetchDraft, [fetchDraft]);

  const set = <K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) =>
    setForm((f) => f && { ...f, [key]: value });

  const nameOk = !!form && isValidSkillName(form.name);
  const valid = nameOk && !!form && form.description.trim().length > 0 && form.body.trim().length > 0;
  const nameTaken = create.error instanceof ApiError && create.error.status === 409;

  const submit = () => {
    if (!form || !valid) return;
    create.mutate(
      {
        candidate_ids: ids,
        name: form.name,
        description: form.description.trim(),
        type: form.type,
        body: form.body,
        enabled: form.enabled,
      },
      { onSuccess: onCreated },
    );
  };

  let content: React.ReactNode;
  if (draft.isError) {
    content = <ErrorState body={t("create.draftError")} onRetry={fetchDraft} />;
  } else if (!form) {
    content = (
      <div style={s.loading}>
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={240} />
      </div>
    );
  } else {
    content = (
      <>
        <div style={s.intro}>
          <Icon.Edit size={14} />
          <span>
            {t.rich("create.intro", {
              count: ids.length,
              repo: repoName,
              strong: (chunks) => <strong>{chunks}</strong>,
              code: (chunks) => <span className="mono" style={s.repo}>{chunks}</span>,
            })}
          </span>
        </div>
        <FormField
          label={t("create.name")}
          hint={nameTaken ? t("create.nameTaken") : t("create.nameHint")}
          required
        >
          <TextInput value={form.name} onChange={(v) => set("name", v)} mono />
        </FormField>
        <FormField label={t("create.description")} required>
          <TextInput value={form.description} onChange={(v) => set("description", v)} />
        </FormField>
        <div style={s.grid}>
          <FormField label={t("create.type")}>
            <SelectInput
              value={form.type}
              onChange={(v) => set("type", v as SkillType)}
              options={SKILL_TYPES.map((v) => ({ value: v, label: v }))}
            />
          </FormField>
          <FormField label={t("create.enabled")} hint={t("create.enabledHint")}>
            <Toggle on={form.enabled} onChange={(v) => set("enabled", v)} />
          </FormField>
        </div>
        <FormField label={t("create.body")} hint={t("create.bodyHint")} required>
          <SkillBodyEditor value={form.body} onChange={(v) => set("body", v)} fileName={form.name} dirty rows={16} />
        </FormField>
      </>
    );
  }

  return (
    <Modal
      width={760}
      title={t("create.title")}
      subtitle={form?.name}
      onClose={create.isPending ? undefined : onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{t("create.footer")}</span>
          <Button kind="secondary" onClick={onClose} disabled={create.isPending}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!valid} loading={create.isPending}>
            {t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{content}</div>
    </Modal>
  );
}

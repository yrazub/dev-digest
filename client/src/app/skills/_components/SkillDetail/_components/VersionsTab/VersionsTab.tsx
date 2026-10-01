/* VersionsTab — body snapshots, newest first (design: Skill Editor · Versions).
   Every older version can be diffed against the current body or restored;
   restore appends a new version, it never rewrites history. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { DiffViewer } from "@/components/diff-viewer";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { versionDiffFile } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [open, setOpen] = React.useState<number | null>(null);
  const [confirming, setConfirming] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !versions) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const doRestore = (v: SkillVersion) =>
    restore.mutate(
      { id: skill.id, version: v.version },
      {
        onSuccess: () => {
          toast.toast(t("versions.restored", { version: v.version }), "success");
          setConfirming(null);
          setOpen(null);
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.headRow}>
        <h3 style={s.heading}>{t("versions.heading")}</h3>
        <span style={s.muted}>{t("versions.count", { count: versions.length })}</span>
      </div>
      <p style={s.muted}>{t("versions.hint")}</p>
      <ul style={s.list}>
        {versions.map((v) => (
          <li key={v.version} style={s.item}>
            <div style={s.row}>
              <span className="mono" style={s.version}>
                v{v.version}
              </span>
              <span style={s.note(!!v.note)}>{v.note ?? t("versions.noNote")}</span>
              <span style={s.date}>{new Date(v.created_at).toLocaleDateString()}</span>
              {v.current ? (
                <Badge color="var(--ok)">{t("versions.current")}</Badge>
              ) : (
                <>
                  <Button size="sm" kind="secondary" onClick={() => setOpen(open === v.version ? null : v.version)}>
                    {open === v.version ? t("versions.hideDiff") : t("versions.diff")}
                  </Button>
                  <Button size="sm" kind="secondary" icon="History" onClick={() => setConfirming(v)}>
                    {t("versions.restore")}
                  </Button>
                </>
              )}
            </div>
            {open === v.version && (
              <div style={s.diff}>
                <DiffViewer files={[versionDiffFile(`${skill.name}.md`, v.body, skill.body)]} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {confirming && (
        <Modal
          width={440}
          title={t("versions.restore")}
          onClose={restore.isPending ? undefined : () => setConfirming(null)}
          footer={
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button kind="secondary" onClick={() => setConfirming(null)} disabled={restore.isPending}>
                {t("versions.cancel")}
              </Button>
              <Button kind="primary" icon="History" onClick={() => doRestore(confirming)} loading={restore.isPending}>
                {t("versions.restore")}
              </Button>
            </div>
          }
        >
          <p style={s.confirm}>{t("versions.restoreConfirm", { version: confirming.version })}</p>
        </Modal>
      )}
    </div>
  );
}

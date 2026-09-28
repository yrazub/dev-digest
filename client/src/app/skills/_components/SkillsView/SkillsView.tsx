/* SkillsView — /skills and /skills/:id (design: Skill Editor). The list column
   holds every skill card, Add Skill (Create / Import) and search; the detail
   pane shows the selected skill. Selecting a card is a client navigation, so
   the list keeps its state and scroll. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { ListDetailLayout } from "@/components/list-detail-layout";
import { useDeleteSkill, useSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { filterSkills } from "@/app/skills/_lib/skill-display";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillFormModal } from "../SkillFormModal";
import { SkillCard } from "../SkillCard";
import { SkillDetail } from "../SkillDetail";
import { toSkillTab, type SkillTab } from "../SkillDetail/constants";
import { s } from "./styles";

type Dialog = "create" | "import" | null;

export function SkillsView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const selected = useSkill(selectedId);
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  const [query, setQuery] = React.useState("");
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [deleting, setDeleting] = React.useState<Skill | null>(null);

  const tab = toSkillTab(search.get("tab"));
  const setTab = (next: SkillTab) => router.replace(`/skills/${selectedId}?tab=${next}`);
  const list = filterSkills(skills ?? [], query);

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.toast(t("delete.deleted", { name: target.name }), "success");
        setDeleting(null);
        if (target.id === selectedId) router.push("/skills");
      },
    });
  };

  const addMenu = (
    <Dropdown
      width={200}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {t("list.addSkill")}
        </Button>
      }
      items={[
        { label: t("list.create"), icon: "Edit", onClick: () => setDialog("create") },
        { label: t("list.import"), icon: "Upload", onClick: () => setDialog("import") },
      ]}
    />
  );

  const column = isLoading ? (
    <div style={s.stack}>
      <Skeleton height={96} />
      <Skeleton height={96} />
    </div>
  ) : isError ? (
    <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />
  ) : list.length === 0 && query ? (
    <div style={s.muted}>{t("list.noMatch", { query })}</div>
  ) : (
    list.map((sk) => (
      <SkillCard
        key={sk.id}
        skill={sk}
        active={sk.id === selectedId}
        onSelect={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
        onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
        onDelete={() => setDeleting(sk)}
      />
    ))
  );

  let detail: React.ReactNode;
  if (!selectedId) {
    detail =
      !isLoading && (skills ?? []).length === 0 ? (
        <EmptyState
          icon="Sparkles"
          title={t("list.emptyTitle")}
          body={t("list.emptyBody")}
          cta={t("list.emptyCta")}
          onCta={() => setDialog("create")}
        />
      ) : (
        <EmptyState icon="Sparkles" title={t("list.selectTitle")} body={t("list.selectBody")} />
      );
  } else if (selected.isLoading) {
    detail = (
      <div style={s.stack}>
        <Skeleton height={24} width={240} />
        <Skeleton height={320} />
      </div>
    );
  } else if (!selected.data) {
    detail = <EmptyState icon="Sparkles" title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;
  } else {
    detail = (
      <SkillDetail skill={selected.data} tab={tab} onTab={setTab} onDelete={() => setDeleting(selected.data!)} />
    );
  }

  return (
    <AppShell
      crumb={[
        { label: t("list.crumbLab") },
        { label: t("list.crumbSkills"), href: "/skills" },
        ...(selected.data ? [{ label: selected.data.name, mono: true }] : []),
      ]}
    >
      <ListDetailLayout
        title={t("list.title")}
        action={addMenu}
        search={query}
        onSearch={setQuery}
        searchPlaceholder={t("list.searchPlaceholder")}
        list={column}
      >
        {detail}
      </ListDetailLayout>

      {dialog === "create" && <SkillFormModal onClose={() => setDialog(null)} />}
      {dialog === "import" && <ImportSkillModal onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDeleteModal
          title={t("delete.title")}
          body={
            <>
              <p>{t("delete.body", { name: deleting.name })}</p>
              {deleting.agent_count > 0 && <p>{t("delete.linked", { count: deleting.agent_count })}</p>}
            </>
          }
          cancelLabel={t("delete.cancel")}
          confirmLabel={remove.isPending ? t("delete.deleting") : t("delete.confirm")}
          pending={remove.isPending}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </AppShell>
  );
}

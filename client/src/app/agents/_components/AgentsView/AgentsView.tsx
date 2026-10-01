/* AgentsView — /agents and /agents/:id (design: Agent Editor). The list column
   holds every agent tile, Add Agent and search; the detail pane is the selected
   agent's editor with exactly two tabs, Config and Skills (#35). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { Badge, Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { ListDetailLayout } from "@/components/list-detail-layout";
import { useAgent, useAgents, useDeleteAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { AgentCard } from "../AgentCard";
import { AgentEditor } from "../AgentEditor";
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { TEMPLATES, toAgentTab, type AgentTab } from "./constants";
import { filterAgents } from "./helpers";
import { s } from "./styles";

export function AgentsView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const selected = useAgent(selectedId);
  const update = useUpdateAgent();
  const remove = useDeleteAgent();
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Agent | null>(null);

  const tab = toAgentTab(search.get("tab"));
  const setTab = (next: string) => router.replace(`/agents/${selectedId}?tab=${next as AgentTab}`);
  const list = filterAgents(agents ?? [], query);

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.toast(t("delete.deleted", { name: target.name }), "success");
        setDeleting(null);
        if (target.id === selectedId) router.push("/agents");
      },
    });
  };

  const addMenu = (
    <Dropdown
      width={220}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {t("list.addAgent")}
        </Button>
      }
      items={[
        { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
        { divider: true },
        ...TEMPLATES.map((tp) => ({ label: tp, icon: "Cpu" as const, muted: true, onClick: () => setCreating(true) })),
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
    list.map((a) => (
      <AgentCard
        key={a.id}
        ag={a}
        active={a.id === selectedId}
        onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
        onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
        onDelete={() => setDeleting(a)}
      />
    ))
  );

  let detail: React.ReactNode;
  if (!selectedId) {
    detail =
      !isLoading && (agents ?? []).length === 0 ? (
        <EmptyState
          icon="Cpu"
          title={t("list.emptyTitle")}
          body={t("list.emptyBody")}
          cta={t("list.emptyCta")}
          onCta={() => setCreating(true)}
        />
      ) : (
        <EmptyState icon="Cpu" title={t("list.selectTitle")} body={t("list.selectBody")} />
      );
  } else if (selected.isLoading) {
    detail = (
      <div style={s.pad}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  } else if (selected.isError || !selected.data) {
    detail = (
      <ErrorState
        title={t("editor.loadErrorTitle")}
        body={t("editor.loadErrorBody")}
        onRetry={() => selected.refetch()}
      />
    );
  } else {
    const agent = selected.data;
    detail = (
      <>
        <div style={s.header}>
          <Icon.Cpu size={18} style={s.icon} />
          <h2 style={s.title}>{agent.name}</h2>
          <Badge color="var(--text-secondary)" mono>
            {agent.provider}/{agent.model}
          </Badge>
          {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
          <div style={s.runButton}>
            <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
              {t("editor.runOnPr")}
            </Button>
          </div>
        </div>
        <div style={s.editor}>
          <AgentEditor agent={agent} tab={tab} onTab={setTab} />
        </div>
      </>
    );
  }

  return (
    <AppShell
      crumb={[
        { label: t("list.breadcrumbLab") },
        { label: t("list.breadcrumb"), href: "/agents" },
        ...(selected.data ? [{ label: selected.data.name }] : []),
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

      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDeleteModal
          title={t("delete.title")}
          body={t("delete.body", { name: deleting.name })}
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

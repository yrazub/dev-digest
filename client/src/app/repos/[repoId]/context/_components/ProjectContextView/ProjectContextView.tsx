/* ProjectContextView — /repos/:repoId/context (design N6). A view-only list of
   the repository's markdown documents with a filter, a preview pane and a
   footer. The selection lives in the URL as ?path=. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatRootList, kindColor } from "@/lib/context-display";
import { useContextFiles } from "@/lib/hooks/context";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { useActiveRepo } from "@/lib/repo-context";
import { DocumentPane } from "./DocumentPane";
import { filterDocuments, viewMode } from "./helpers";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const query = useContextFiles(repoId);
  const resync = useResyncRepoIntel(repoId);
  const [filter, setFilter] = React.useState("");

  const selectedPath = search.get("path");
  const select = (path: string) =>
    router.replace(`/repos/${repoId}/context?${new URLSearchParams({ path }).toString()}`);

  const data = query.data;
  const mode = viewMode(query);
  const repoName = activeRepo?.full_name ?? activeRepo?.name ?? "";
  const crumb = [{ label: t("title") }];

  let list: React.ReactNode;
  if (mode === "loading") {
    list = (
      <div style={s.stack}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  } else if (mode === "error") {
    list = <ErrorState body={t("page.loadError")} onRetry={() => query.refetch()} />;
  } else if (mode === "not_cloned") {
    list = <EmptyState icon="Folder" title={t("page.notCloned")} />;
  } else if (mode === "empty") {
    list = (
      <EmptyState
        icon="Folder"
        title={t("page.empty", {
          roots: formatRootList(data?.roots ?? [], t("page.or")),
          repo: repoName,
        })}
        cta={t("page.resync")}
        onCta={() => resync.mutate()}
        ctaLoading={resync.isPending}
      />
    );
  } else {
    const documents = data?.documents ?? [];
    list = (
      <>
        <input
          type="search"
          style={s.filter}
          value={filter}
          placeholder={t("page.filterPlaceholder")}
          aria-label={t("page.filterPlaceholder")}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div style={s.list}>
          {filterDocuments(documents, filter).map((d) => (
            <button
              key={d.path}
              type="button"
              style={d.path === selectedPath ? { ...s.row, ...s.rowActive } : s.row}
              aria-current={d.path === selectedPath ? "true" : undefined}
              onClick={() => select(d.path)}
            >
              <span className="mono" style={s.rowPath}>
                {d.path}
              </span>
              <span style={s.rowMeta}>
                <Badge color={kindColor(d.kind)}>{d.kind}</Badge>
                {d.tokens !== null && <span>{t("page.tokens", { count: d.tokens })}</span>}
              </span>
            </button>
          ))}
        </div>
        {data?.capped && <div style={s.cap}>{t("page.capped", { cap: data.cap })}</div>}
        <div style={s.footer}>{t("page.footer", { files: documents.length, tokens: data?.total_tokens ?? 0 })}</div>
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.left}>
          <div style={s.header}>
            <h1 style={s.title}>
              {t("title")}
              {repoName && (
                <>
                  {" · "}
                  <span className="mono" style={s.repo}>
                    {repoName}
                  </span>
                </>
              )}
            </h1>
            <Button size="sm" icon="RefreshCw" onClick={() => query.refetch()} loading={query.isFetching}>
              {t("page.refresh")}
            </Button>
          </div>
          {list}
        </div>
        <div style={s.right}>
          {selectedPath ? (
            <DocumentPane key={selectedPath} repoId={repoId} path={selectedPath} />
          ) : (
            mode === "list" && <div style={s.muted}>{t("page.selectPrompt")}</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

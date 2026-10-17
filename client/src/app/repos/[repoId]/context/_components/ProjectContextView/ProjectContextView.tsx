/* ProjectContextView — /repos/:repoId/context (design N6). A view-only list of
   the repository's markdown documents with a filter, a preview pane and a
   footer. The selection lives in the URL as ?path=. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatRootList, kindBg, kindColor } from "@/lib/context-display";
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
  const documents = data?.documents ?? [];

  let left: React.ReactNode = null;
  if (mode === "loading") {
    left = (
      <div style={s.leftStack}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  } else if (mode === "list") {
    left = (
      <>
        <div style={s.list}>
          {filterDocuments(documents, filter).map((d) => {
            const active = d.path === selectedPath;
            return (
              <button
                key={d.path}
                type="button"
                style={s.row(active)}
                aria-current={active ? "true" : undefined}
                onClick={() => select(d.path)}
              >
                <span style={s.rowIcon(active)}>
                  <Icon.FileText size={13} />
                </span>
                <span style={s.rowBody}>
                  <span className="mono" style={s.rowPath}>
                    {d.path}
                  </span>
                  <span style={s.rowMeta}>
                    <Badge color={kindColor(d.kind)} bg={kindBg(d.kind)} style={s.kindBadge}>
                      {d.kind}
                    </Badge>
                    {d.tokens !== null && <span>{t("page.tokens", { count: d.tokens })}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {data?.capped && <div style={s.cap}>{t("page.capped", { cap: data.cap })}</div>}
        <div style={s.footer}>{t("page.footer", { files: documents.length, tokens: data?.total_tokens ?? 0 })}</div>
      </>
    );
  }

  let right: React.ReactNode = null;
  if (mode === "error") {
    right = (
      <div style={s.centered}>
        <ErrorState body={t("page.loadError")} onRetry={() => query.refetch()} />
      </div>
    );
  } else if (mode === "not_cloned") {
    right = (
      <div style={s.centered}>
        <EmptyState icon="Folder" title={t("page.notCloned")} />
      </div>
    );
  } else if (mode === "empty") {
    right = (
      <div style={s.centered}>
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
      </div>
    );
  } else if (selectedPath) {
    right = <DocumentPane key={selectedPath} repoId={repoId} path={selectedPath} />;
  } else if (mode === "list") {
    right = (
      <div style={s.centered}>
        <EmptyState icon="FileText" title={t("page.selectPrompt")} />
      </div>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.left}>
          <div style={s.header}>
            <div style={s.headerTop}>
              <div style={s.headerText}>
                <h1 style={s.label}>{t("title")}</h1>
                {repoName && (
                  <div className="mono" style={s.repo}>
                    {repoName}
                  </div>
                )}
              </div>
              <Button
                kind="tertiary"
                size="sm"
                icon="RefreshCw"
                loading={query.isFetching}
                aria-label={t("page.refresh")}
                title={t("page.refresh")}
                onClick={() => query.refetch()}
              />
            </div>
            {mode === "list" && (
              <label style={s.filterWrap}>
                <Icon.Search size={13} />
                <input
                  type="search"
                  style={s.filter}
                  value={filter}
                  placeholder={t("page.filterPlaceholder")}
                  aria-label={t("page.filterPlaceholder")}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
            )}
          </div>
          {left}
        </div>
        <div style={s.right}>{right}</div>
      </div>
    </AppShell>
  );
}

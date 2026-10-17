/* ContextAttachList — which repository documents an agent or a skill attaches,
   and in what order (design N2b / N2c). Owner-agnostic: the owner's paths and its
   save come in as props. Lists every document of the active repository: attached
   ones first in stored order, then the rest by path. The total and the 4K / 16K
   warnings are the server's token counts, summed here. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { useContextFiles } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { ContextPreviewDrawer } from "./ContextPreviewDrawer";
import { ContextRow } from "./ContextRow";
import { attachMode, attachedTotal, filterRows, movePath, orderRows, runCapSkips, togglePath } from "./helpers";
import { s } from "./styles";

export function ContextAttachList({
  heading,
  paths,
  pathsLoading,
  pathsError,
  onRetryPaths,
  onSave,
}: {
  heading: string;
  paths: string[] | undefined;
  pathsLoading: boolean;
  pathsError: boolean;
  onRetryPaths: () => void;
  onSave: (paths: string[]) => void;
}) {
  const t = useTranslations("context");
  const { repoId, activeRepo } = useActiveRepo();
  const files = useContextFiles(repoId);
  const [query, setQuery] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const mode = attachMode({ hasRepo: !!repoId, paths, pathsLoading, pathsError, files });
  const list = files.data;

  if (mode === "no_repo") {
    return (
      <div style={s.wrap}>
        <Link href="/onboarding">{t("attach.noRepo")}</Link>
      </div>
    );
  }
  if (mode === "loading") {
    return (
      <div style={s.stack}>
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }
  if (mode === "error") {
    const retry = () => {
      onRetryPaths();
      void files.refetch();
    };
    return <ErrorState body={t("attach.loadError")} onRetry={retry} />;
  }
  if (mode === "not_cloned" || !list || !paths) return <div style={s.muted}>{t("attach.notCloned")}</div>;

  const repoName = activeRepo?.full_name ?? activeRepo?.name ?? "";
  const rows = orderRows(list.documents, paths);
  const filtering = query.trim().length > 0;
  const visible = filterRows(rows, query);
  const attachedRows = visible.filter((r) => r.attached);
  const restRows = visible.filter((r) => !r.attached);
  const total = attachedTotal(rows);
  const skips = total > list.run_cap_tokens ? runCapSkips(rows, list.run_cap_tokens) : [];
  const previewRow = previewPath === null ? null : (rows.find((r) => r.path === previewPath) ?? null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onSave(movePath(paths, String(active.id), String(over.id)));
  };
  const toggle = (path: string, on: boolean) => onSave(togglePath(paths, path, on));
  return (
    <div style={s.wrap}>
      <div style={s.headRow}>
        <h3 style={s.heading}>{heading}</h3>
        <input
          type="search"
          style={s.filter}
          value={query}
          placeholder={t("attach.filterPlaceholder")}
          aria-label={t("attach.filterPlaceholder")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p style={s.hint}>{filtering ? t("attach.dragDisabled") : t("attach.orderHint")}</p>

      {visible.length === 0 ? (
        <p style={s.hint}>{t("attach.noMatch", { query })}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={attachedRows.map((r) => r.path)} strategy={verticalListSortingStrategy}>
            <ul style={s.list}>
              {attachedRows.map((r) => (
                <ContextRow
                  key={r.path}
                  row={r}
                  repoName={repoName}
                  draggable={!filtering}
                  onToggle={(on) => toggle(r.path, on)}
                  onPreview={() => setPreviewPath(r.path)}
                />
              ))}
            </ul>
          </SortableContext>
          {attachedRows.length > 0 && restRows.length > 0 && <div style={s.divider} />}
          <ul style={s.list}>
            {restRows.map((r) => (
              <ContextRow
                key={r.path}
                row={r}
                repoName={repoName}
                draggable={false}
                onToggle={(on) => toggle(r.path, on)}
                onPreview={() => setPreviewPath(r.path)}
              />
            ))}
          </ul>
        </DndContext>
      )}

      <div style={s.totalRow}>
        <span style={s.total(total > list.soft_cap_tokens)}>{t("attach.total", { count: total })}</span>
        {total > list.soft_cap_tokens && <Badge color="var(--crit)">{t("attach.softCap")}</Badge>}
      </div>
      {skips.length > 0 && <p style={s.runCap}>{t("attach.runCap", { paths: skips.join(", ") })}</p>}

      {previewRow && repoId && (
        <ContextPreviewDrawer
          repoId={repoId}
          row={previewRow}
          onToggle={(on) => toggle(previewRow.path, on)}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

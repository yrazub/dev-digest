/* FileCard — one collapsible file in the diff: header (path, finding dot, +/- stat,
   comment count) and, when open, its parsed lines plus any outdated comments and
   findings outside the diff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, JUMP_PULSE_MS } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import {
  findingsForFile,
  isCounted,
  mostSevere,
  partitionFindings,
  type DiffFindingApi,
} from "../findings";
import { s, chevronFor, fileCardFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { FindingDot } from "../FindingDot";
import { OutdatedComments } from "../OutdatedComments";
import { UnanchoredFindings } from "../UnanchoredFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line (new side only). */
function findingsForLine(ln: Line, anchored: Map<string, FindingRecord[]>): FindingRecord[] {
  if (anchored.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = anchored.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  defaultOpen,
  jump,
  onJumped,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Initial open state; when absent the AUTO_EXPAND_MAX_LINES rule decides. */
  defaultOpen?: boolean;
  /** Set when a navigation points at this file: the card starts open and scrolls to `line` (or its header). */
  jump?: { line: number | null; pending: boolean };
  /** Called once the card has scrolled, so the parent does not jump again. */
  onJumped?: () => void;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    jump !== undefined ||
      (defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES)
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  // The rendered line the jump lands on: the one whose new-side number is `jump.line`.
  const targetIndex = React.useMemo(
    () => (jump?.line == null ? -1 : lines.findIndex((ln) => ln.kind !== "hunk" && ln.newNo === jump.line)),
    [lines, jump?.line]
  );
  const headerRef = React.useRef<HTMLDivElement>(null);
  const lineRef = React.useRef<HTMLDivElement>(null);
  const pulseTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pulsing, setPulsing] = React.useState(false);

  const pending = jump?.pending === true;
  // DOM sync for the jump: scroll the target line (or the header when no line is
  // rendered) into view and start the line pulse. The pulse timer is cleared on
  // unmount only, so a re-render after the jump does not cut the pulse short.
  React.useEffect(() => {
    if (!pending) return;
    const hasLine = targetIndex >= 0;
    (hasLine ? lineRef.current : headerRef.current)?.scrollIntoView({ block: "start" });
    if (hasLine) {
      setPulsing(true);
      clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulsing(false), JUMP_PULSE_MS);
    }
    onJumped?.();
  }, [pending, targetIndex, onJumped]);
  React.useEffect(() => () => clearTimeout(pulseTimer.current), []);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same split for this file's findings: anchored to a rendered line vs. outside the diff.
  const allFindings = findings?.findings;
  const { fileFindings, anchoredFindings, unanchoredFindings } = React.useMemo(() => {
    if (!allFindings) {
      return {
        fileFindings: [] as FindingRecord[],
        anchoredFindings: new Map<string, FindingRecord[]>(),
        unanchoredFindings: [] as FindingRecord[],
      };
    }
    const forFile = findingsForFile(allFindings, file.path);
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    const { anchored, unanchored } = partitionFindings(forFile, renderedKeys);
    return { fileFindings: forFile, anchoredFindings: anchored, unanchoredFindings: unanchored };
  }, [allFindings, file.path, lines]);
  const fileSeverity = mostSevere(fileFindings.filter(isCounted));

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={fileCardFor(jump !== undefined)} data-jump-target={jump ? "file" : undefined}>
      <div
        ref={headerRef}
        onClick={() => setOpen((o) => !o)}
        style={jump ? { ...s.fileHeader, ...s.jumpHeader } : s.fileHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {fileSeverity && <FindingDot severity={fileSeverity} />}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            title={t("diffViewer.githubComments", { count: commentCount })}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                lineFindings={findingsForLine(ln, anchoredFindings)}
                findings={findings}
                jumpMark={i === targetIndex ? { pulse: pulsing } : undefined}
                ref={i === targetIndex ? lineRef : undefined}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.showFindings && (
            <UnanchoredFindings findings={unanchoredFindings} renderFinding={findings.renderFinding} />
          )}
        </div>
      )}
    </div>
  );
}

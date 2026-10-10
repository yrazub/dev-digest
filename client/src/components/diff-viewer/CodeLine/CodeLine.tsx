/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, a finding stripe and tag, any anchored findings and
   comment threads, and an inline composer. */
"use client";

import React from "react";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { isCounted, mostSevere, sortBySeverity, type DiffFindingApi } from "../findings";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { LineFindingTag } from "../LineFindingTag";

const NO_FINDINGS: FindingRecord[] = [];

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  lineFindings = NO_FINDINGS,
  findings,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line, dismissed ones included. */
  lineFindings?: FindingRecord[];
  findings?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  // Stripe and tag follow the most severe counted finding, whether or not cards are shown.
  const severity = mostSevere(lineFindings.filter(isCounted));

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind, severity ? SEV[severity].c : undefined)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {severity && <LineFindingTag severity={severity} />}
      </div>

      {findings && findings.showFindings && lineFindings.length > 0 && (
        <div style={cs.thread}>
          {sortBySeverity(lineFindings).map((f) => (
            <div key={f.id}>{findings.renderFinding(f)}</div>
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

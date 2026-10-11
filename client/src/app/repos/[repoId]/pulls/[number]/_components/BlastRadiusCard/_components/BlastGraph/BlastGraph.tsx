/* BlastGraph — the Graph view of the Blast radius block: changed symbols, callers, and endpoints
   and cron jobs as three columns of nodes joined by curved edges, drawn as inline SVG from
   `graphLayout`. A caller node links to GitHub like its tree line. The graph scrolls sideways
   inside the block. Repository text is rendered as text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { GRAPH_SIZES } from "../../constants";
import { callerHref, graphLayout, type GraphNode } from "../../helpers";
import { s } from "../../styles";

interface BlastGraphProps {
  downstream: DownstreamImpact[];
  repoFullName: string | null;
  indexedSha: string | null;
  headSha: string | null;
}

const LEGEND = ["symbol", "caller", "endpoint"] as const;

/** Horizontal gap between a node's left edge and its label. */
const LABEL_INSET = 10;

export function BlastGraph({ downstream, repoFullName, indexedSha, headSha }: BlastGraphProps) {
  const t = useTranslations("blast");
  const layout = React.useMemo(
    () =>
      graphLayout(downstream, GRAPH_SIZES, (file, line) =>
        callerHref(repoFullName, indexedSha, headSha, file, line),
      ),
    [downstream, repoFullName, indexedSha, headSha],
  );

  return (
    <div style={s.stack}>
      <div style={s.graphScroll}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={s.graphSvg}
        >
          <g>
            {layout.edges.map((edge) => (
              <path key={edge.id} d={edge.path} style={s.graphEdge} />
            ))}
          </g>
          {layout.nodes.map((node) => (
            <GraphNodeShape key={node.id} node={node} />
          ))}
        </svg>
      </div>

      <div style={s.legend}>
        {LEGEND.map((kind) => (
          <span key={kind} style={s.legendItem}>
            <span aria-hidden="true" style={s.legendDot(kind)} />
            {t(`graph.legend.${kind}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function GraphNodeShape({ node }: { node: GraphNode }) {
  const body = (
    <>
      <title>{node.title}</title>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={6}
        style={s.graphNode(node.kind)}
      />
      <text
        className="mono"
        x={node.x + LABEL_INSET}
        y={node.y + node.height / 2}
        style={s.graphLabel}
      >
        {node.text}
      </text>
    </>
  );

  if (node.kind === "caller" && node.href) {
    return (
      <a href={node.href} target="_blank" rel="noopener noreferrer" style={s.graphLink}>
        {body}
      </a>
    );
  }
  return <g>{body}</g>;
}

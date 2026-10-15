import type { BlastRadiusResponse, ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CALLABLE_KINDS, type GraphSizes } from "./constants";

export type BlastBodyMode = "loading" | "error" | "noFiles" | "noSymbols" | "noCallers" | "map";

/**
 * The one body the block renders. A failed background refetch keeps the data, so the mode of
 * the data wins over `isError`; the error mode is only for a request that never produced data.
 */
export function blastBodyMode({
  data,
  isError,
}: {
  data: BlastRadiusResponse | undefined;
  isError: boolean;
}): BlastBodyMode {
  if (!data) return isError ? "error" : "loading";
  if (data.reason === "pr_files_missing") return "noFiles";
  if (data.totals.symbols === 0) return "noSymbols";
  if (data.downstream.length === 0) return "noCallers";
  return "map";
}

/**
 * GitHub blob URL of a caller line, pinned to the indexed commit (the one the line numbers
 * refer to) or, when the response carries none, to the PR's head. `null` while the repository
 * name or both commits are unknown: the caller is then plain text.
 */
export function callerHref(
  repoFullName: string | null | undefined,
  indexedSha: string | null,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | null {
  const sha = indexedSha ?? headSha;
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, file, line);
}

/** A group at the server's per-symbol limit may have more callers than it lists. */
export function groupIsCut(group: DownstreamImpact, callerLimit: number): boolean {
  return group.callers.length >= callerLimit;
}

/** Symbol name for display: `()` after a function or method, by the kind of the first entry of that name. */
export function symbolLabel(name: string, changedSymbols: ChangedSymbol[]): string {
  const kind = changedSymbols.find((c) => c.name === name)?.kind;
  return kind !== undefined && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  /** Stable key, unique across the graph. */
  id: string;
  kind: GraphNodeKind;
  /** The full value. */
  label: string;
  /** The label as drawn: cut with an ellipsis when longer than `labelMax`. */
  text: string;
  /** Hover text with the full value. */
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Callers only: the GitHub URL of the caller's first line, `null` when it cannot be built. */
  href: string | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** SVG path data of a smooth curve: from a caller's left side to a symbol's right side, or from a symbol's right side to a fact's left side. */
  path: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/** A label longer than `max` characters is cut to `max` and ends with an ellipsis. */
function cutLabel(label: string, max: number): string {
  const chars = Array.from(label);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : label;
}

/**
 * Nodes, edges and canvas size of the Graph view. Three columns, left to right: changed symbols,
 * callers, endpoints and crons. Two kinds of edge only: a caller to each changed symbol it reaches,
 * and a changed symbol to each endpoint and cron of its group; no caller is joined to an endpoint
 * (the response attributes endpoints to the symbol's group, not to one caller). A symbol-to-fact edge
 * passes behind the caller column; its control points sit in the gap between columns so the curve
 * leaves and arrives horizontally and crosses the callers on the diagonal. A caller is one node
 * per `file` + `name`, a fact one node per distinct value; each column is centred on the tallest.
 * `hrefFor` builds the link of a caller's first line.
 */
export function graphLayout(
  downstream: DownstreamImpact[],
  sizes: GraphSizes,
  hrefFor: (file: string, line: number) => string | null = () => null,
): GraphLayout {
  type Draft = Omit<GraphNode, "x" | "y" | "width" | "height" | "text">;
  const symbols = new Map<string, Draft>();
  const callers = new Map<string, Draft>();
  const facts = new Map<string, Draft>();
  const edges = new Map<string, [string, string]>();

  const add = (column: Map<string, Draft>, node: Draft) => {
    if (!column.has(node.id)) column.set(node.id, node);
    return node.id;
  };

  for (const group of downstream) {
    const symbolId = add(symbols, {
      id: `symbol:${group.symbol}`,
      kind: "symbol",
      label: group.symbol,
      title: group.symbol,
      href: null,
    });
    for (const caller of group.callers) {
      const callerId = add(callers, {
        id: `caller:${JSON.stringify([caller.file, caller.name])}`,
        kind: "caller",
        label: caller.name,
        title: `${caller.name} (${caller.file}:${caller.line})`,
        href: hrefFor(caller.file, caller.line),
      });
      edges.set(`${callerId}>${symbolId}`, [callerId, symbolId]);
    }
    const factKinds = [
      ["endpoint", group.endpoints_affected],
      ["cron", group.crons_affected],
    ] as const;
    for (const [kind, values] of factKinds) {
      for (const value of values) {
        const factId = add(facts, { id: `${kind}:${value}`, kind, label: value, title: value, href: null });
        edges.set(`${symbolId}>${factId}`, [symbolId, factId]);
      }
    }
  }

  const { nodeWidth: width, nodeHeight: height, nodeGap, padding, labelMax } = sizes;
  const step = height + nodeGap;
  // Space between the symbol and caller columns: how far a control point leaves its node.
  const columnGap = sizes.columnX.caller - sizes.columnX.symbol - width;
  const columns: Array<[Map<string, Draft>, number]> = [
    [symbols, sizes.columnX.symbol],
    [callers, sizes.columnX.caller],
    [facts, sizes.columnX.fact],
  ];
  const tallest = Math.max(...columns.map(([column]) => column.size), 0);
  const nodes: GraphNode[] = [];
  for (const [column, x] of columns) {
    const offset = ((tallest - column.size) * step) / 2;
    [...column.values()].forEach((draft, index) => {
      nodes.push({
        ...draft,
        text: cutLabel(draft.label, labelMax),
        x,
        y: padding + offset + index * step,
        width,
        height,
      });
    });
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edgeList: GraphEdge[] = [];
  for (const [id, [fromId, toId]] of edges) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) continue;
    // A caller's edge leaves its left side and enters the symbol's right side; the others leave a right side and enter a left side.
    const x1 = from.kind === "caller" ? from.x : from.x + from.width;
    const x2 = from.kind === "caller" ? to.x + to.width : to.x;
    const y1 = from.y + from.height / 2;
    const y2 = to.y + to.height / 2;
    const reach = Math.min(Math.abs(x2 - x1) / 2, columnGap);
    const c1 = x1 + Math.sign(x2 - x1) * reach;
    const c2 = x2 - Math.sign(x2 - x1) * reach;
    edgeList.push({ id, from: fromId, to: toId, path: `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}` });
  }

  const empty = nodes.length === 0;
  return {
    nodes,
    edges: edgeList,
    width: empty ? 0 : sizes.columnX.fact + width + padding,
    height: empty ? 0 : padding * 2 + tallest * step - nodeGap,
  };
}

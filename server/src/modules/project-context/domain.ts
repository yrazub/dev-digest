import { ContextDocPath } from '@devdigest/shared';
import { MAX_CONTEXT_DOCS } from './constants.js';

/** A raw file the clone walk found: relative `/`-separated path, size in bytes. */
export interface RawEntry {
  path: string;
  size: number;
}

export interface DocumentEntry {
  path: string;
  kind: string;
  size: number;
}

export interface EffectivePath {
  path: string;
  origin: 'agent' | 'skill';
  skill_name: string | null;
}

/** True when `path` is a valid relative markdown path (R-SRV-7, `.md` in any case). */
export function isDocumentPath(path: string): boolean {
  return ContextDocPath.safeParse(path).success;
}

/**
 * The deepest directory segment of `path` (the file name excluded) that equals
 * a search root, or `null` when none does (R-SRV-6). Roots match exactly.
 */
export function kindOf(path: string, roots: readonly string[]): string | null {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const dir = dirs[i]!;
    if (roots.includes(dir)) return dir;
  }
  return null;
}

/**
 * Picks the documents out of raw walk entries: a valid markdown path under a
 * search-root folder. Sorted by code-unit order and cut to `MAX_CONTEXT_DOCS`
 * (R-SRV-1, R-SRV-10).
 */
export function selectDocuments(
  entries: readonly RawEntry[],
  roots: readonly string[],
): { documents: DocumentEntry[]; capped: boolean } {
  const found: DocumentEntry[] = [];
  for (const e of entries) {
    if (!isDocumentPath(e.path)) continue;
    const kind = kindOf(e.path, roots);
    if (kind === null) continue;
    found.push({ path: e.path, kind, size: e.size });
  }
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    documents: found.slice(0, MAX_CONTEXT_DOCS),
    capped: found.length > MAX_CONTEXT_DOCS,
  };
}

/**
 * The effective document list of a run: the agent's paths in order, then each
 * skill's paths in the given order; the first occurrence of a path wins (R-SRV-22).
 */
export function mergeEffective(
  agentPaths: readonly string[],
  skills: readonly { name: string; paths: readonly string[] }[],
): EffectivePath[] {
  const seen = new Set<string>();
  const out: EffectivePath[] = [];
  for (const path of agentPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, origin: 'agent', skill_name: null });
  }
  for (const skill of skills) {
    for (const path of skill.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, origin: 'skill', skill_name: skill.name });
    }
  }
  return out;
}

/**
 * The workspace-level document list (R-SRV-24): agents sorted by name in code-unit order,
 * each agent's effective paths (`mergeEffective`), every path kept once at its first position
 * across all agents. The sort is stable, so equal names keep the order they came in.
 */
export function mergeWorkspace(
  agents: readonly {
    agentName: string;
    agentPaths: readonly string[];
    skills: readonly { name: string; paths: readonly string[] }[];
  }[],
): string[] {
  const sorted = [...agents].sort((a, b) =>
    a.agentName < b.agentName ? -1 : a.agentName > b.agentName ? 1 : 0,
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const agent of sorted) {
    for (const { path } of mergeEffective(agent.agentPaths, agent.skills)) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Applies the run's token cap in order: the first document that would push the
 * sum past `cap`, and every later one, goes to `overCap` (R-SRV-27).
 */
export function applyRunCap<T extends { tokens: number }>(
  docs: readonly T[],
  cap: number,
): { inserted: T[]; overCap: T[] } {
  const inserted: T[] = [];
  const overCap: T[] = [];
  let sum = 0;
  let closed = false;
  for (const doc of docs) {
    if (!closed && sum + doc.tokens > cap) closed = true;
    if (closed) {
      overCap.push(doc);
    } else {
      sum += doc.tokens;
      inserted.push(doc);
    }
  }
  return { inserted, overCap };
}

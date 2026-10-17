/* context-display.ts — pure display rules for project context documents. */

const KIND_COLORS: Record<string, string> = {
  specs: "var(--accent)",
  docs: "#10b981",
  insights: "#f59e0b",
};

/** Badge colour of a document's `kind`; any custom search root gets the neutral one. */
export function kindColor(kind: string): string {
  return Object.hasOwn(KIND_COLORS, kind) ? KIND_COLORS[kind]! : "var(--text-secondary)";
}

const KIND_BACKGROUNDS: Record<string, string> = {
  specs: "var(--accent-bg)",
  docs: "#10b9811a",
  insights: "#f59e0b1a",
};

/** Badge background of a document's `kind`; any custom search root gets the vendored `Badge` default. */
export function kindBg(kind: string): string {
  return Object.hasOwn(KIND_BACKGROUNDS, kind) ? KIND_BACKGROUNDS[kind]! : "var(--bg-hover)";
}

/** "specs/, docs/ or insights/" for three roots, "adr/" for one. */
export function formatRootList(roots: readonly string[], orWord: string): string {
  const folders = roots.map((r) => `${r}/`);
  if (folders.length <= 1) return folders.join("");
  return `${folders.slice(0, -1).join(", ")} ${orWord} ${folders[folders.length - 1]}`;
}

/** Code-unit order (`a < b`), the order the server lists documents in. */
export function compareByPath(a: { path: string }, b: { path: string }): number {
  if (a.path < b.path) return -1;
  return a.path > b.path ? 1 : 0;
}

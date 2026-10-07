/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component, the DiffCommentApi and DiffFindingApi contracts, and
   the finding rules (`isCounted`, `mostSevere`) so a screen around the viewer counts the same way. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi } from "./findings";
export { isCounted, mostSevere } from "./findings";

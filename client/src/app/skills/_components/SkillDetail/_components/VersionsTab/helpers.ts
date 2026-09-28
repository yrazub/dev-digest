import { createTwoFilesPatch } from "diff";
import type { PrFile } from "@devdigest/shared";

/**
 * A version-vs-current diff as a one-file PrFile, so the shared DiffViewer can
 * render it. The patch keeps only the hunks (DiffViewer reads from `@@`).
 */
export function versionDiffFile(fileName: string, oldBody: string, currentBody: string): PrFile {
  const patch = createTwoFilesPatch(fileName, fileName, ensureNewline(oldBody), ensureNewline(currentBody), "", "", {
    context: 3,
  });
  const hunks = patch.slice(patch.indexOf("@@") >= 0 ? patch.indexOf("@@") : patch.length).trimEnd();
  let additions = 0;
  let deletions = 0;
  for (const line of hunks.split("\n")) {
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { path: fileName, additions, deletions, patch: hunks || null };
}

function ensureNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

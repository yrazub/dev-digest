/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** How long the target line of a jump stays highlighted, in milliseconds. */
export const JUMP_PULSE_MS = 1700;

/**
 * CSS custom property a screen sets, on an ancestor of the viewer, to the height in px of a
 * sticky header that covers the top of the scroll container. A jump target is scrolled to
 * sit below it, so it does not land underneath the header. Absent means no sticky header.
 */
export const STICKY_OFFSET_VAR = "--diff-sticky-offset";

/**
 * Pure plain-text rules shared by the modules that read author text (a pull request's title,
 * description and linked documents): sanitising and word-boundary capping. No DB / network /
 * framework; every function returns a value and never throws. Moved out of `intent/domain.ts`,
 * which re-exports them, so `brief` can use the same rules without importing `intent`.
 */

// ---------------------------------------------------------------- sanitising

// U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF, U+E0000–U+E007F
const INVISIBLE_RE = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}]/gu;
// Group 1 is set for a closed comment only; an opener with no `-->` after it matches through
// to the end of the text (see "Scanning cost" below).
const HTML_COMMENT_RE = /<!--[\s\S]*?(?:(-->)|$)/g;
const UNTERMINATED_COMMENT_RE = /<!--[\s\S]*$/;

export interface SanitizeResult {
  text: string;
  removed: { html_comments: number; invisible_chars: number };
}

/**
 * Remove HTML comments (an unterminated one runs to the end of the text) and invisible /
 * bidirectional characters, normalise line endings and collapse blank-line runs. Runs
 * before capping so a cap cannot cut a comment in half and leave its tail behind.
 */
export function sanitizeText(raw: string): SanitizeResult {
  let htmlComments = 0;
  let text = raw.replace(HTML_COMMENT_RE, (all: string, closed: string | undefined) => {
    if (closed === undefined) return all;
    htmlComments += 1;
    return '';
  });
  text = text.replace(UNTERMINATED_COMMENT_RE, () => {
    htmlComments += 1;
    return '';
  });
  let invisible = 0;
  text = text.replace(INVISIBLE_RE, () => {
    invisible += 1;
    return '';
  });
  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, removed: { html_comments: htmlComments, invisible_chars: invisible } };
}

/**
 * Cap text that a person reads (the classifier's output): cut at the last word boundary that
 * fits and end with an ellipsis, so a label never stops in the middle of a word. The result is
 * at most `max` characters. A text with no usable boundary is cut hard, like `capText`.
 */
export function capWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  // `room` already ends on a whole word when the next character is a space.
  const endsOnWord = /\s/.test(text.charAt(max - 1));
  const boundary = endsOnWord ? room.length : room.search(/\s\S*$/);
  const kept = boundary >= Math.floor(max / 2) ? room.slice(0, boundary) : room;
  return `${kept.replace(/[\s,;:.([{\-–—]+$/, '')}…`;
}

// Scanning cost. `sanitizeText` reads author text before any cap, so its scan is linear in that
// text: a failed attempt at one position never re-reads text that the attempts at the following
// positions would read again. The replacement is the old rule plus a skip of attempts that fail
// anyway, so what is detected does not change.
//  1. HTML_COMMENT_RE also matches an opener with no `-->` (through to the end, left as it
//     is): no `-->` after one opener means none after any later opener.

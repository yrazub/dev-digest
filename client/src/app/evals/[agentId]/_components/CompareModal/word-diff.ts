/* Word-level diff of two prompts (R-WEB-36). Tokens are the words and the whitespace runs
   between them, so joining every token of a result rebuilds the new text (same + add) or the
   old text (same + del) exactly, newlines included. Pure: no React, no DOM. */

export type DiffToken = { type: "same" | "add" | "del"; text: string };

const tokenize = (text: string): string[] => text.split(/(\s+)/).filter((t) => t !== "");

/** Adjacent tokens of one type become one token. */
function merge(tokens: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const tok of tokens) {
    const last = out[out.length - 1];
    if (last && last.type === tok.type) last.text += tok.text;
    else out.push({ ...tok });
  }
  return out;
}

export function wordDiff(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);

  // The common head and tail never need the O(n·m) table.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;

  // lcs[i][j] = length of the longest common subsequence of midA[i..] and midB[j..].
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const tokens: DiffToken[] = a.slice(0, head).map((text) => ({ type: "same", text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      tokens.push({ type: "same", text: midA[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      tokens.push({ type: "del", text: midA[i++]! });
    } else {
      tokens.push({ type: "add", text: midB[j++]! });
    }
  }
  while (i < n) tokens.push({ type: "del", text: midA[i++]! });
  while (j < m) tokens.push({ type: "add", text: midB[j++]! });
  for (const text of a.slice(a.length - tail)) tokens.push({ type: "same", text });

  return merge(tokens);
}

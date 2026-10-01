/** Approximate token count — characters ÷ 4 — for the editor header. The run
    trace shows the exact tokenizer count once the skill is used in a review. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

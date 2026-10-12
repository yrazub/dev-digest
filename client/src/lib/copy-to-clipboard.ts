/**
 * Copy text to the system clipboard. Resolves to whether it worked, so the
 * caller only shows "copied" feedback when the text actually landed there.
 * The Clipboard API is missing on insecure origins and can reject when the
 * page has no focus or permission; both resolve to `false`.
 */
export function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) return Promise.resolve(false);
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

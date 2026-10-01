/** The first 7 characters of a commit sha, as git prints it. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

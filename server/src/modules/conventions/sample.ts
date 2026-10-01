/**
 * L02 — conventions step 1: what to sample. Pure; the service does the reads.
 * No model is involved in choosing files (criterion #39).
 */

/** Top-ranked code files taken from repo-intel. */
export const SAMPLE_CODE_FILES = 12;
export const CODE_FILE_MAX_LINES = 400;
export const CONFIG_FILE_MAX_BYTES = 12 * 1024;

/** Lint, type-check and format configs whose settings describe the house style. */
export const CONFIG_FILE_NAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
  '.editorconfig',
  'biome.json',
  'biome.jsonc',
] as const;

export interface SampledFile {
  path: string;
  kind: 'config' | 'code';
  content: string;
}

/**
 * Config paths to try: the root, plus every top-level folder the code sample
 * lives in (`server/`, `client/`, …), so a multi-package repo's own configs count.
 */
export function configCandidates(codePaths: string[]): string[] {
  const dirs = new Set<string>(['']);
  for (const p of codePaths) {
    const slash = p.indexOf('/');
    if (slash > 0) dirs.add(p.slice(0, slash + 1));
  }
  return [...dirs].flatMap((dir) => CONFIG_FILE_NAMES.map((name) => `${dir}${name}`));
}

/** Keep the head of a code file; line numbers stay those of the real file. */
export function capCode(content: string): string {
  const lines = content.split('\n');
  return lines.length <= CODE_FILE_MAX_LINES ? content : lines.slice(0, CODE_FILE_MAX_LINES).join('\n');
}

/** Keep whole lines up to the config byte budget. */
export function capConfig(content: string): string {
  if (Buffer.byteLength(content, 'utf8') <= CONFIG_FILE_MAX_BYTES) return content;
  const out: string[] = [];
  let bytes = 0;
  for (const line of content.split('\n')) {
    bytes += Buffer.byteLength(line, 'utf8') + 1;
    if (bytes > CONFIG_FILE_MAX_BYTES) break;
    out.push(line);
  }
  return out.join('\n');
}

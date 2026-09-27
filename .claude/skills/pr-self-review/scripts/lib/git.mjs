// Reads the branch's changes from git. Two modes:
//   working   — merge-base → working tree, including staged, unstaged and untracked files
//               (what /pr-self-review reviews);
//   committed — merge-base → HEAD (what a PR opened now would contain; used by the gate).
// Both produce the same diff_hash for the same content, so a review of uncommitted work stays
// valid once exactly that work is committed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { matchesAny } from './glob.mjs';

const MAX_BUFFER = 256 * 1024 * 1024;

export function git(args, { cwd, allowExitCodes = [0] } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (allowExitCodes.includes(err.status)) return err.stdout;
    const stderr = String(err.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || err.message}`);
  }
}

export function repoRoot(cwd = process.cwd()) {
  return git(['rev-parse', '--show-toplevel'], { cwd }).trim();
}

export const isExcluded = (file, patterns) => matchesAny(file, patterns);

function splitZ(out) {
  return out.split('\0').filter(Boolean);
}

function parseNameStatus(out) {
  const parts = splitZ(out);
  const files = [];
  for (let i = 0; i < parts.length; i += 2) files.push({ path: parts[i + 1], status: parts[i][0], untracked: false });
  return files;
}

// `@@ -a,b +c,d @@` → the new-file line ranges [c, c+d-1] that the change added or rewrote.
export function parseChangedLines(unifiedDiff) {
  const byFile = {};
  let current = null;
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4);
      current = target === '/dev/null' ? null : target.replace(/^b\//, '');
      if (current) byFile[current] ??= [];
      continue;
    }
    const m = current && line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) byFile[current].push([start, start + count - 1]);
  }
  return byFile;
}

function countLines(root, file) {
  const text = readFileSync(path.join(root, file), 'utf8');
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function blobIds(root, files, mode, headRef = 'HEAD') {
  const live = files.filter((f) => f.status !== 'D').map((f) => f.path);
  const ids = {};
  if (live.length === 0) return ids;
  if (mode === 'working') {
    const out = git(['hash-object', '--', ...live], { cwd: root }).trim().split('\n');
    live.forEach((p, i) => { ids[p] = out[i]; });
  } else {
    for (const entry of splitZ(git(['ls-tree', '-z', headRef, '--', ...live], { cwd: root }))) {
      const [meta, p] = entry.split('\t');
      ids[p] = meta.split(' ')[2];
    }
  }
  return ids;
}

export function diffHash(files, ids) {
  const lines = files
    .map((f) => `${f.path}\t${f.status === 'D' ? 'deleted' : ids[f.path]}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Collects the reviewable changes between `base` and the working tree (or a commit).
 * Excluded paths are listed separately and do not count towards the hash.
 * `headRef` (committed mode only) is the commit to judge; the pre-push hook passes the pushed
 * commit, which need not be the checked-out one.
 */
export function collectChanges({ root, base, exclude, mode = 'working', withLines = true, headRef = 'HEAD' }) {
  if (mode === 'working') headRef = 'HEAD';
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, headRef], { cwd: root }).trim();
  } catch {
    throw new Error(`No merge-base between "${base}" and ${headRef}. Fetch it (git fetch origin) or pass --base <ref>.`);
  }
  const head = git(['rev-parse', headRef], { cwd: root }).trim();
  const range = mode === 'working' ? [mergeBase] : [mergeBase, head];

  let all = parseNameStatus(git(['diff', '--name-status', '--no-renames', '-z', ...range], { cwd: root }));
  if (mode === 'working') {
    const untracked = splitZ(git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }));
    all = all.concat(untracked.map((p) => ({ path: p, status: 'A', untracked: true })));
  }

  const files = all.filter((f) => !isExcluded(f.path, exclude));
  const excluded = all.filter((f) => isExcluded(f.path, exclude)).map((f) => f.path);
  const ids = blobIds(root, files, mode, head);
  const result = { base, merge_base: mergeBase, head, mode, diff_hash: diffHash(files, ids), files, excluded };

  if (withLines) {
    const tracked = files.filter((f) => !f.untracked && f.status !== 'D').map((f) => f.path);
    const ranges = tracked.length
      ? parseChangedLines(git(['diff', '-U0', '--no-color', '--no-renames', ...range, '--', ...tracked], { cwd: root }))
      : {};
    for (const f of files) {
      if (f.status === 'D') f.changed_lines = [];
      else if (f.untracked) f.changed_lines = [[1, Math.max(1, countLines(root, f.path))]];
      else f.changed_lines = ranges[f.path] ?? [];
    }
  }
  return result;
}

/** A unified diff (3 lines of context) of the given files against the merge-base. */
export function patchFor({ root, mergeBase, files }) {
  const tracked = files.filter((f) => !f.untracked).map((f) => f.path);
  let patch = tracked.length
    ? git(['diff', '-U3', '--no-color', '--no-renames', mergeBase, '--', ...tracked], { cwd: root })
    : '';
  for (const f of files.filter((x) => x.untracked)) {
    patch += git(['diff', '--no-index', '--no-color', '--', '/dev/null', f.path], { cwd: root, allowExitCodes: [0, 1] });
  }
  return patch;
}

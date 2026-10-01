// The one decision both gates make: may these commits be published?
//
// Used by `gate.mjs` (the Claude Code PreToolUse hook) and `pre-push.mjs` (the git hook), so
// the two can never disagree. The check is on content, not on the SHA: it hashes
// merge-base → commit and looks for a verdict with that hash. Rewording a commit keeps the
// verdict valid; any change to the reviewed files makes it stale.
import path from 'node:path';
import { collectChanges } from './git.mjs';
import { loadManifest, readJson, stateDir } from './run.mjs';

/**
 * @param {{ root: string, headRef?: string, what?: string }} args
 *   `headRef` is the commit being published (default HEAD); `what` names it in messages.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkPublish({ root, headRef = 'HEAD', what = 'the committed changes' }) {
  const manifest = loadManifest();
  const base = readJson(path.join(stateDir(root), 'latest.json'))?.base ?? manifest.defaults.base;
  const now = collectChanges({ root, base, exclude: manifest.exclude, mode: 'committed', withLines: false, headRef });
  if (now.files.length === 0) return { ok: true };

  const verdict = readJson(path.join(stateDir(root), 'verdicts', `${now.diff_hash}.json`));
  if (!verdict) {
    return {
      ok: false,
      message: `${what} against ${base} have not been reviewed (or changed since the last review). ` +
        'Run /pr-self-review, then push or open the PR.',
    };
  }
  if (verdict.verdict !== 'pass') {
    const open = verdict.findings.filter((f) => f.severity === 'CRITICAL' && !f.waived)
      .map((f) => `  ${f.id} ${f.file}${f.line ? `:${f.line}` : ''} ${f.rule_id}: ${f.title}`);
    const failed = verdict.failed_tasks.map((t) => `  incomplete: ${t.id} (${t.reason})`);
    return {
      ok: false,
      message: `the last review of ${what} is BLOCKED (${verdict.run_dir}/report.md):\n` +
        `${[...open, ...failed].join('\n')}\nFix these and run /pr-self-review again. Do not push or open the PR.`,
    };
  }
  return { ok: true };
}

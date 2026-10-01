#!/usr/bin/env node
// git pre-push hook body (called from .githooks/pre-push). Denies a push unless every branch
// being pushed has a passing /pr-self-review verdict — so pushes from a terminal or an IDE are
// gated too, not only the ones Claude Code runs.
//
// git passes the remote name and URL as arguments, and one line per ref on stdin:
//   <local ref> <local sha> <remote ref> <remote sha>
// A local sha of all zeros is a branch deletion, which publishes no code. Tags are skipped.
// Exit non-zero cancels the whole push. `git push --no-verify` bypasses this, as with any hook.
import { readFileSync } from 'node:fs';
import { repoRoot } from './lib/git.mjs';
import { checkPublish } from './lib/verdict-check.mjs';

const ZERO = /^0+$/;
const deny = (msg) => { process.stderr.write(`pr-self-review pre-push: ${msg}\n`); process.exit(1); };

try {
  const root = repoRoot(process.cwd());
  const lines = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [localRef, localSha] = line.split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue;
    if (localRef.startsWith('refs/tags/')) continue;
    const branch = localRef.replace(/^refs\/heads\//, '');
    const result = checkPublish({ root, headRef: localSha, what: `the commits on ${branch}` });
    if (!result.ok) deny(result.message);
  }
  process.exit(0);
} catch (err) {
  deny(`could not verify the review: ${err.message}`);
}

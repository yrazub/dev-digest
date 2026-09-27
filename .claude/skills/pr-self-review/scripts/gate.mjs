#!/usr/bin/env node
// PreToolUse hook on Bash: denies `git push` and `gh pr create` unless the commits they would
// publish have a passing /pr-self-review verdict. Exit 2 blocks the tool call and shows stderr to Claude.
//
// The decision itself lives in lib/verdict-check.mjs, shared with the git pre-push hook
// (pre-push.mjs), so the two gates always agree.
import { readFileSync } from 'node:fs';
import { isGatedCommand } from './lib/command.mjs';
import { repoRoot } from './lib/git.mjs';
import { checkPublish } from './lib/verdict-check.mjs';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const command = input?.tool_input?.command ?? '';
if (!isGatedCommand(command)) process.exit(0);

const deny = (msg) => { process.stderr.write(`pr-self-review gate: ${msg}\n`); process.exit(2); };

try {
  const result = checkPublish({ root: repoRoot(input.cwd || process.cwd()) });
  if (!result.ok) deny(result.message);
  process.exit(0);
} catch (err) {
  deny(`could not verify the review: ${err.message}`);
}

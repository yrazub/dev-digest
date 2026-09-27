// Which command lines the gate treats as a push / PR creation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGatedCommand } from '../lib/command.mjs';

const GATED = [
  'git push',
  'git push origin main',
  'git push --force-with-lease origin feature/x',
  'cd repo && git push -f',
  'git status; git push',
  'npm test || git push',
  'GIT_SSH_COMMAND="ssh -i key" git push',
  'env FOO=1 git push',
  'git -C server push',
  'git -c user.name=x push origin HEAD',
  'git --no-pager push',
  '/usr/bin/git push',
  '(cd server && git push)',
  'echo $(git push)',
  'echo "result: $(git push)"',
  'bash -c "git push origin main"',
  'git \\\n  push',
  'gh pr create --fill',
  'gh pr create --title "x" --body "y"',
];

const ALLOWED = [
  '',
  'git status',
  'git pull',
  'git log --oneline',
  'echo "git push"',
  "echo 'run git push later'",
  'grep -rn "git push" docs',
  'git commit -m "gate git push too"',
  'git commit -m "docs: explain gh pr create"',
  'rg "gh pr create" .claude',
  'gh pr view 12',
  'gh pr list',
  'node gate.mjs <<EOF\n{"tool_input":{"command":"git push"}}\nEOF',
  "python3 - <<'PY'\nprint('git push')\nPY\necho done",
  'git stash push -m wip',
];

for (const cmd of GATED) {
  test(`gated: ${JSON.stringify(cmd)}`, () => assert.equal(isGatedCommand(cmd), true));
}
for (const cmd of ALLOWED) {
  test(`allowed: ${JSON.stringify(cmd)}`, () => assert.equal(isGatedCommand(cmd), false));
}

#!/usr/bin/env node
// PreToolUse guard for the `spec-creator` agent (wired in .claude/agents/spec-creator.md).
// Allows Write/Edit only on Markdown files under the spec folders; blocks everything else
// with exit code 2, which Claude Code reports back to the agent as the reason.
// Fails closed: input it cannot parse is blocked too.
import { realpathSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const SPEC_DIRS = ['specs', 'server/specs', 'client/specs', 'reviewer-core/specs', 'mcp/specs'];

function block(reason) {
  process.stderr.write(
    `specs-only-guard: ${reason} spec-creator may write only *.md files under ${SPEC_DIRS.map((d) => `${d}/`).join(', ')}.\n`,
  );
  process.exit(2);
}

// Resolves symlinks in the deepest existing ancestor, so a link inside specs/ cannot point out.
function realpathLoose(p) {
  let dir = p;
  const tail = [];
  while (!existsSync(dir)) {
    tail.unshift(dir.slice(dirname(dir).length + 1));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(realpathSync(dir), ...tail);
}

let input;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
} catch {
  block('could not parse the hook input.');
}

const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (typeof filePath !== 'string' || filePath.length === 0) block(`${input?.tool_name ?? 'tool'} has no file path.`);

const root = realpathLoose(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const target = realpathLoose(isAbsolute(filePath) ? filePath : resolve(input.cwd || root, filePath));
const rel = relative(root, target).split(sep).join('/');

if (rel.startsWith('../') || isAbsolute(rel)) block(`${filePath} is outside the repository.`);
if (!rel.endsWith('.md')) block(`${rel} is not a Markdown file.`);
if (!SPEC_DIRS.some((d) => rel.startsWith(`${d}/`))) block(`${rel} is not in a spec folder.`);

process.exit(0);

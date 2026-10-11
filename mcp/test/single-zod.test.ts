import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Severity } from '@devdigest/shared';
import { z } from 'zod';
import { SERVER_INSTRUCTIONS, SEVERITY_ORDER } from '../src/constants.js';
import { assertSingleZod } from '../src/single-zod.js';

const MCP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MCP_DIR, '..');
const LAUNCHER = path.join(MCP_DIR, 'bin', 'devdigest-mcp.mjs');

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'devdigest-mcp-test-'));
  tempDirs.push(dir);
  return dir;
}

function runNode(args: string[], cwd: string) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 25_000 });
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('one Zod for the contracts and this package', () => {
  it('assertSingleZod() does not throw under vitest', () => {
    expect(() => assertSingleZod()).not.toThrow();
  });

  it('a shared contract is an instance of the package z.ZodEnum', () => {
    expect(Severity).toBeInstanceOf(z.ZodEnum);
  });

  it('SEVERITY_ORDER is most severe first', () => {
    expect([...SEVERITY_ORDER]).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
  });
});

describe('the launcher', () => {
  const cases: Array<{ name: string; cwd: () => string; script: string }> = [
    { name: 'from the repository root', cwd: () => REPO_ROOT, script: 'mcp/bin/devdigest-mcp.mjs' },
    { name: 'from mcp/', cwd: () => MCP_DIR, script: 'bin/devdigest-mcp.mjs' },
    { name: 'by absolute path from the temporary directory', cwd: () => tmpdir(), script: LAUNCHER },
  ];

  for (const c of cases) {
    it(`exits 0 with empty stdout ${c.name}`, () => {
      const result = runNode([c.script], c.cwd());

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain('resolve different copies of zod');
      expect(result.stderr).not.toContain('dependencies are not installed');
    });
  }

  it('exits 1 with empty stdout and names `cd mcp && npm ci` when dependencies are missing', () => {
    const dir = makeTempDir();
    const copy = path.join(dir, 'devdigest-mcp.mjs');
    copyFileSync(LAUNCHER, copy);

    const result = runNode([copy], dir);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('cd mcp && npm ci');
  });
});

describe('the server instructions', () => {
  it('fit in 500 characters', () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(500);
  });

  it('name the tools to call and say when to call list_agents', () => {
    expect(SERVER_INSTRUCTIONS).toContain('run_agent_on_pr');
    expect(SERVER_INSTRUCTIONS).toContain('list_agents');
    expect(SERVER_INSTRUCTIONS).toContain('get_findings');
    expect(SERVER_INSTRUCTIONS).toContain('only when');
  });
});

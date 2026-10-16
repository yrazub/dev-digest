import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The checks of D12 that apply so far (specs/plans/L04-devdigest-mcp.md): a source scan, because
// an import graph cannot see a stdout write.

const MCP_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(MCP_DIR, 'src');
const BIN_DIR = path.join(MCP_DIR, 'bin');
const MAIN = path.join(SRC_DIR, 'main.ts');
const LAUNCHER = path.join(BIN_DIR, 'devdigest-mcp.mjs');
const API_CLIENT = path.join(SRC_DIR, 'api-client.ts');

function listFiles(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, extensions));
    else if (extensions.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out.sort();
}

const srcFiles = listFiles(SRC_DIR, ['.ts']);
const binFiles = listFiles(BIN_DIR, ['.mjs', '.js', '.ts']);

const rel = (file: string): string => path.relative(MCP_DIR, file).split(path.sep).join('/');

/** Code with comments removed, so a word in a comment cannot trip a check. Strings are kept. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Every module specifier written as a string literal: static, side-effect, re-export, dynamic, require. */
export function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) if (match[1]) found.push(match[1]);
  }
  return found;
}

function offenders(files: string[], pattern: RegExp, except: string[] = []): string[] {
  return files
    .filter((file) => !except.includes(file))
    .filter((file) => pattern.test(code(file)))
    .map(rel);
}

describe('the scanner itself', () => {
  it('finds the files it is meant to check', () => {
    expect(srcFiles.map(rel)).toEqual(expect.arrayContaining(['src/main.ts', 'src/server.ts', 'src/tool.ts']));
    expect(binFiles.map(rel)).toEqual(['bin/devdigest-mcp.mjs']);
  });

  it('reads every import form', () => {
    const sample = [
      "import { a } from 'one';",
      "import type { B } from \"two\";",
      "import 'three';",
      "export * from 'four';",
      "const m = await import('five');",
      "const r = require('six');",
      "import {\n  c,\n  d,\n} from 'seven';",
    ].join('\n');

    expect(importSpecifiers(sample).sort()).toEqual(['five', 'four', 'one', 'seven', 'six', 'three', 'two']);
  });
});

describe('imports under src/', () => {
  it('are a relative path inside src/, @devdigest/shared, zod or @modelcontextprotocol/sdk/*', () => {
    const bad: string[] = [];
    for (const file of srcFiles) {
      for (const spec of importSpecifiers(code(file))) {
        const relativeInside =
          spec.startsWith('.') && path.resolve(path.dirname(file), spec).startsWith(SRC_DIR + path.sep);
        const allowed =
          relativeInside ||
          spec === '@devdigest/shared' ||
          spec === 'zod' ||
          spec.startsWith('@modelcontextprotocol/sdk/');
        if (!allowed) bad.push(`${rel(file)} imports "${spec}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('include no node: builtin', () => {
    const bad: string[] = [];
    for (const file of srcFiles) {
      for (const spec of importSpecifiers(code(file))) {
        if (spec.startsWith('node:')) bad.push(`${rel(file)} imports "${spec}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('stdout is the protocol', () => {
  it('no console. call anywhere under src/ or bin/', () => {
    expect(offenders([...srcFiles, ...binFiles], /\bconsole\s*\./)).toEqual([]);
  });

  it('no process.stdout anywhere under src/ or bin/', () => {
    expect(offenders([...srcFiles, ...binFiles], /\bprocess\s*\.\s*stdout\b/)).toEqual([]);
  });

  it('process. is used only in src/main.ts and the launcher', () => {
    expect(offenders([...srcFiles, ...binFiles], /\bprocess\s*\./, [MAIN, LAUNCHER])).toEqual([]);
  });

  it('fetch( is called only in src/api-client.ts', () => {
    expect(offenders([...srcFiles, ...binFiles], /\bfetch\s*\(/, [API_CLIENT])).toEqual([]);
  });
});

describe('the API port', () => {
  it('imports of ./mocks appear only in tests: no file under src/ imports it', () => {
    const importers: string[] = [];
    for (const file of srcFiles) {
      for (const spec of importSpecifiers(code(file))) {
        if (/(^|\/)mocks(\.js|\.ts)?$/.test(spec)) importers.push(`${rel(file)} imports "${spec}"`);
      }
    }
    expect(importers).toEqual([]);
  });

  it('main.ts, server.ts and the tool files do not import ./mocks', () => {
    const entry = srcFiles.filter(
      (file) => file === MAIN || file === path.join(SRC_DIR, 'server.ts') || file.startsWith(path.join(SRC_DIR, 'tools') + path.sep),
    );
    expect(entry.length).toBeGreaterThanOrEqual(3);
    expect(offenders(entry, /\bmocks\b/)).toEqual([]);
  });

  it('the HTTP adapter and the mock both declare implements DevDigestApi', () => {
    expect(code(API_CLIENT)).toMatch(/class\s+HttpDevDigestApi\s+implements\s+DevDigestApi\b/);
    expect(code(path.join(SRC_DIR, 'mocks.ts'))).toMatch(/class\s+MockDevDigestApi\s+implements\s+DevDigestApi\b/);
  });

  it('ports.ts and api-client.ts declare no object schema of their own (views are .pick() / .extend())', () => {
    expect(offenders([path.join(SRC_DIR, 'ports.ts'), API_CLIENT], /\bz\s*\.\s*object\s*\(/)).toEqual([]);
  });
});

describe('the composition root', () => {
  const NEW_CLIENT = /\bnew\s+HttpDevDigestApi\b/;
  const NEW_TRANSPORT = /\bnew\s+StdioServerTransport\b/;

  it('src/main.ts constructs both the HTTP client and the stdio transport (the scan below is not vacuous)', () => {
    expect(code(MAIN)).toMatch(NEW_CLIENT);
    expect(code(MAIN)).toMatch(NEW_TRANSPORT);
  });

  it('new HttpDevDigestApi appears only in src/main.ts', () => {
    expect(offenders(srcFiles, NEW_CLIENT, [MAIN])).toEqual([]);
  });

  it('new StdioServerTransport appears only in src/main.ts', () => {
    expect(offenders(srcFiles, NEW_TRANSPORT, [MAIN])).toEqual([]);
  });

  it('the scan sees a construction in a file other than main.ts', () => {
    expect(NEW_CLIENT.test('const a = new HttpDevDigestApi({ baseUrl })')).toBe(true);
    expect(NEW_TRANSPORT.test('const t = new StdioServerTransport()')).toBe(true);
  });
});

describe('the launcher', () => {
  it('imports nothing but node: builtins and tsx', () => {
    const specs = importSpecifiers(code(LAUNCHER));

    expect(specs.length).toBeGreaterThan(0);
    const bad = specs.filter((spec) => !(spec.startsWith('node:') || spec === 'tsx' || spec.startsWith('tsx/')));
    expect(bad).toEqual([]);
  });
});

describe('package configuration', () => {
  it('tsconfig paths are exactly @devdigest/shared, @devdigest/shared/* and zod', () => {
    const tsconfig = JSON.parse(readFileSync(path.join(MCP_DIR, 'tsconfig.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, string[]> };
    };

    expect(Object.keys(tsconfig.compilerOptions.paths).sort()).toEqual(['@devdigest/shared', '@devdigest/shared/*', 'zod']);
  });

  const pkg = JSON.parse(readFileSync(path.join(MCP_DIR, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  };

  it('dependencies are exactly @modelcontextprotocol/sdk, tsx and zod', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@modelcontextprotocol/sdk', 'tsx', 'zod']);
  });

  it('has no start script', () => {
    expect(pkg.scripts).not.toHaveProperty('start');
  });
});

/**
 * Pure Project Context rules (`modules/project-context/domain.ts`) and the search-root
 * setting (`platform/config.ts`). No doubles: values in, values out.
 * Spec: `server/specs/L05-project-context.md` (R-SRV-2, R-SRV-6, R-SRV-7, R-SRV-10,
 * R-SRV-22, R-SRV-27; `mergeWorkspace`: `server/specs/L05-pr-brief.md` R-SRV-24).
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_CONTEXT_ROOTS,
  loadConfig,
  parseProjectContextRoots,
} from '../src/platform/config.js';
import {
  applyRunCap,
  isDocumentPath,
  kindOf,
  mergeEffective,
  mergeWorkspace,
  selectDocuments,
} from '../src/modules/project-context/domain.js';
import { MAX_CONTEXT_DOCS } from '../src/modules/project-context/constants.js';

const ROOTS = ['specs', 'docs', 'insights'];

describe('parseProjectContextRoots (R-SRV-2, AC-2, AC-3)', () => {
  it('falls back to specs, docs, insights when unset, empty or left with nothing usable', () => {
    const defaults = ['specs', 'docs', 'insights'];
    expect(DEFAULT_PROJECT_CONTEXT_ROOTS).toEqual(defaults);
    expect(parseProjectContextRoots(undefined)).toEqual(defaults);
    expect(parseProjectContextRoots('')).toEqual(defaults);
    expect(parseProjectContextRoots(' , /x ')).toEqual(defaults);
  });

  it('uses the named folders, trimmed', () => {
    expect(parseProjectContextRoots('adr, rfc ')).toEqual(['adr', 'rfc']);
  });

  it('drops an entry that holds a slash and keeps the rest', () => {
    expect(parseProjectContextRoots('adr,a/b,,rfc')).toEqual(['adr', 'rfc']);
  });

  it('does not hand out the exported defaults array itself', () => {
    const a = parseProjectContextRoots(undefined);
    a.push('mutated');
    expect(parseProjectContextRoots(undefined)).toEqual(['specs', 'docs', 'insights']);
    expect(DEFAULT_PROJECT_CONTEXT_ROOTS).toEqual(['specs', 'docs', 'insights']);
  });

  it('reaches AppConfig.projectContextRoots through loadConfig', () => {
    const base = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;
    expect(loadConfig({ ...base, PROJECT_CONTEXT_ROOTS: 'adr,rfc' }).projectContextRoots).toEqual([
      'adr',
      'rfc',
    ]);
    expect(loadConfig({ ...base, PROJECT_CONTEXT_ROOTS: '' }).projectContextRoots).toEqual(
      ROOTS,
    );
  });
});

describe('kindOf (R-SRV-6, AC-7)', () => {
  it('is the root folder the file sits under', () => {
    expect(kindOf('docs/README.md', ROOTS)).toBe('docs');
  });

  it('is the nearest (deepest) root when roots are nested', () => {
    expect(kindOf('docs/specs/a.md', ROOTS)).toBe('specs');
    expect(kindOf('specs/docs/a.md', ROOTS)).toBe('docs');
  });

  it('finds a root at any depth', () => {
    expect(kindOf('packages/api/insights/deep/er/a.md', ROOTS)).toBe('insights');
  });

  it('is null when no ancestor folder is a root', () => {
    expect(kindOf('a/b.md', ROOTS)).toBeNull();
    expect(kindOf('README.md', ROOTS)).toBeNull();
  });

  it('never takes the file name for a root, and matches case-sensitively', () => {
    expect(kindOf('src/docs', ROOTS)).toBeNull();
    expect(kindOf('Docs/a.md', ROOTS)).toBeNull();
  });
});

describe('isDocumentPath (R-SRV-7, AC-9)', () => {
  it('accepts .md in any case', () => {
    expect(isDocumentPath('docs/a.md')).toBe(true);
    expect(isDocumentPath('docs/README.MD')).toBe(true);
  });

  it.each([
    ['not markdown', 'docs/a.txt'],
    ['a quote', 'docs/a"b.md'],
    ['an angle bracket', 'docs/<a>.md'],
    ['a backslash', 'docs\\a.md'],
    ['a control character', 'docs/a\u0007.md'],
    ['an absolute path', '/docs/a.md'],
    ['a dot-dot segment', 'docs/../a.md'],
  ])('rejects %s', (_label, path) => {
    expect(isDocumentPath(path)).toBe(false);
  });

  it('allows 512 characters and rejects 513', () => {
    const pad = (n: number) => `docs/${'a'.repeat(n - 'docs/.md'.length)}.md`;
    expect(pad(512)).toHaveLength(512);
    expect(isDocumentPath(pad(512))).toBe(true);
    expect(pad(513)).toHaveLength(513);
    expect(isDocumentPath(pad(513))).toBe(false);
  });
});

describe('selectDocuments (R-SRV-1, R-SRV-6, R-SRV-7, R-SRV-10; AC-9, AC-12)', () => {
  it('keeps docs/README.MD and drops what is not a document under a root', () => {
    const long = `docs/${'a'.repeat(513 - 'docs/.md'.length)}.md`;
    expect(long).toHaveLength(513);
    const { documents, capped } = selectDocuments(
      [
        { path: 'docs/README.MD', size: 10 },
        { path: 'src/a.md', size: 20 },
        { path: 'docs/a"b.md', size: 30 },
        { path: long, size: 40 },
        { path: 'docs/notes.txt', size: 50 },
      ],
      ROOTS,
    );
    expect(documents).toEqual([{ path: 'docs/README.MD', kind: 'docs', size: 10 }]);
    expect(capped).toBe(false);
  });

  it('returns each document with its nearest-root kind and its size', () => {
    const { documents } = selectDocuments(
      [
        { path: 'docs/specs/a.md', size: 7 },
        { path: 'insights/b.md', size: 9 },
      ],
      ROOTS,
    );
    expect(documents).toEqual([
      { path: 'docs/specs/a.md', kind: 'specs', size: 7 },
      { path: 'insights/b.md', kind: 'insights', size: 9 },
    ]);
  });

  it('honours configured roots instead of the defaults', () => {
    const entries = [
      { path: 'adr/1.md', size: 1 },
      { path: 'docs/2.md', size: 2 },
    ];
    expect(selectDocuments(entries, ['adr']).documents.map((d) => d.path)).toEqual(['adr/1.md']);
  });

  it('sorts in code-unit order (upper case before lower case), not by locale', () => {
    const { documents } = selectDocuments(
      [
        { path: 'docs/a.md', size: 1 },
        { path: 'docs/B.md', size: 1 },
        { path: 'docs/_c.md', size: 1 },
        { path: 'docs/Z/x.md', size: 1 },
      ],
      ROOTS,
    );
    expect(documents.map((d) => d.path)).toEqual([
      'docs/B.md',
      'docs/Z/x.md',
      'docs/_c.md',
      'docs/a.md',
    ]);
  });

  it('returns 1,000 of 1,001 in code-unit order with capped: true', () => {
    const entries = Array.from({ length: MAX_CONTEXT_DOCS + 1 }, (_, i) => ({
      path: `docs/d${String(i).padStart(4, '0')}.md`,
      size: i,
    })).reverse();
    expect(entries).toHaveLength(1001);
    const { documents, capped } = selectDocuments(entries, ROOTS);
    expect(capped).toBe(true);
    expect(documents).toHaveLength(1000);
    expect(documents[0]!.path).toBe('docs/d0000.md');
    expect(documents[999]!.path).toBe('docs/d0999.md');
    expect(documents.map((d) => d.path)).toEqual(documents.map((d) => d.path).sort());
  });

  it('is not capped at exactly 1,000', () => {
    const entries = Array.from({ length: MAX_CONTEXT_DOCS }, (_, i) => ({
      path: `docs/d${String(i).padStart(4, '0')}.md`,
      size: 1,
    }));
    const { documents, capped } = selectDocuments(entries, ROOTS);
    expect(documents).toHaveLength(1000);
    expect(capped).toBe(false);
  });

  it('answers an empty list for no entries', () => {
    expect(selectDocuments([], ROOTS)).toEqual({ documents: [], capped: false });
  });
});

describe('mergeEffective (R-SRV-22, AC-62..AC-65)', () => {
  it('lists the agent paths first, then each skill in order, keeping the first occurrence', () => {
    const merged = mergeEffective(
      ['docs/a.md', 'docs/b.md', 'docs/c.md'],
      [
        { name: 'sk-one', paths: ['docs/d.md', 'docs/b.md', 'docs/e.md'] },
        { name: 'sk-two', paths: ['docs/c.md', 'docs/e.md', 'docs/f.md'] },
      ],
    );
    expect(merged).toEqual([
      { path: 'docs/a.md', origin: 'agent', skill_name: null },
      { path: 'docs/b.md', origin: 'agent', skill_name: null },
      { path: 'docs/c.md', origin: 'agent', skill_name: null },
      { path: 'docs/d.md', origin: 'skill', skill_name: 'sk-one' },
      { path: 'docs/e.md', origin: 'skill', skill_name: 'sk-one' },
      { path: 'docs/f.md', origin: 'skill', skill_name: 'sk-two' },
    ]);
  });

  it('credits a path shared by two skills to the first skill', () => {
    const merged = mergeEffective(
      [],
      [
        { name: 'first', paths: ['docs/x.md', 'docs/y.md', 'docs/z.md'] },
        { name: 'second', paths: ['docs/z.md', 'docs/y.md', 'docs/w.md'] },
      ],
    );
    expect(merged.map((m) => [m.path, m.skill_name])).toEqual([
      ['docs/x.md', 'first'],
      ['docs/y.md', 'first'],
      ['docs/z.md', 'first'],
      ['docs/w.md', 'second'],
    ]);
  });

  it('keeps a skill-only order when the agent has no paths, and is empty for nothing', () => {
    expect(mergeEffective([], [])).toEqual([]);
    expect(mergeEffective([], [{ name: 's', paths: [] }])).toEqual([]);
  });
});

describe('applyRunCap (R-SRV-27, AC-73)', () => {
  const doc = (path: string, tokens: number) => ({ path, tokens });

  it('skips the crossing document and every later one, even a smaller later one', () => {
    const { inserted, overCap } = applyRunCap(
      [doc('a', 9000), doc('b', 6000), doc('c', 2000), doc('d', 100), doc('e', 50)],
      16_000,
    );
    expect(inserted.map((d) => d.path)).toEqual(['a', 'b']);
    expect(overCap.map((d) => d.path)).toEqual(['c', 'd', 'e']);
  });

  it('inserts a document that brings the sum exactly to the cap', () => {
    const { inserted, overCap } = applyRunCap(
      [doc('a', 8000), doc('b', 8000), doc('c', 1)],
      16_000,
    );
    expect(inserted.map((d) => d.path)).toEqual(['a', 'b']);
    expect(overCap.map((d) => d.path)).toEqual(['c']);
  });

  it('puts a single document larger than the cap over the cap, with the rest behind it', () => {
    const { inserted, overCap } = applyRunCap([doc('a', 16_001), doc('b', 1)], 16_000);
    expect(inserted).toEqual([]);
    expect(overCap.map((d) => d.path)).toEqual(['a', 'b']);
  });

  it('inserts everything below the cap, in the given order, and keeps extra fields', () => {
    const input = [
      { path: 'a', tokens: 10, text: 'A' },
      { path: 'b', tokens: 20, text: 'B' },
    ];
    const { inserted, overCap } = applyRunCap(input, 16_000);
    expect(inserted).toEqual(input);
    expect(overCap).toEqual([]);
  });
});

describe('mergeWorkspace (R-SRV-24, AC-66)', () => {
  const agent = (agentName: string, agentPaths: string[], skills: { name: string; paths: string[] }[] = []) => ({
    agentName,
    agentPaths,
    skills,
  });

  it('orders the agents by name in code-unit order, whatever order they come in', () => {
    const merged = mergeWorkspace([
      agent('beta', ['docs/beta.md']),
      agent('Zulu', ['docs/zulu.md']),
      agent('alpha', ['docs/alpha.md']),
    ]);
    // code-unit order: an upper-case name sorts before every lower-case one
    expect(merged).toEqual(['docs/zulu.md', 'docs/alpha.md', 'docs/beta.md']);
  });

  it('puts each agent paths first, then its skills in the given order, before the next agent', () => {
    const merged = mergeWorkspace([
      agent('b', ['docs/b.md']),
      agent('a', ['docs/a2.md', 'docs/a1.md'], [
        { name: 's1', paths: ['docs/s1.md'] },
        { name: 's2', paths: ['docs/s2.md'] },
      ]),
    ]);
    expect(merged).toEqual(['docs/a2.md', 'docs/a1.md', 'docs/s1.md', 'docs/s2.md', 'docs/b.md']);
  });

  it('keeps a path once, at its first position across agents and skills', () => {
    const merged = mergeWorkspace([
      agent('b', ['docs/shared.md', 'docs/b.md']),
      agent('a', ['docs/a.md'], [{ name: 's', paths: ['docs/shared.md', 'docs/s.md', 'docs/a.md'] }]),
    ]);
    expect(merged).toEqual(['docs/a.md', 'docs/shared.md', 'docs/s.md', 'docs/b.md']);
  });

  it('answers an empty list for no agents and for agents that attach nothing', () => {
    expect(mergeWorkspace([])).toEqual([]);
    expect(mergeWorkspace([agent('a', []), agent('b', [], [{ name: 's', paths: [] }])])).toEqual([]);
  });

  it('does not change its input', () => {
    const input = [agent('b', ['docs/b.md']), agent('a', ['docs/a.md'])];
    mergeWorkspace(input);
    expect(input.map((a) => a.agentName)).toEqual(['b', 'a']);
  });

  it('keeps the incoming order for agents that share a name', () => {
    const merged = mergeWorkspace([agent('same', ['docs/one.md']), agent('same', ['docs/two.md'])]);
    expect(merged).toEqual(['docs/one.md', 'docs/two.md']);
  });
});

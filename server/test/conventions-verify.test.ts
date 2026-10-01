import { describe, it, expect } from 'vitest';
import { verifyCandidates } from '../src/modules/conventions/verify.js';
import { evidenceUrl, normalizeRule } from '../src/modules/conventions/domain.js';
import { capCode, configCandidates } from '../src/modules/conventions/sample.js';
import type { ConventionLlmCandidate } from '../src/modules/conventions/llm-schema.js';
import type { SampledFile } from '../src/modules/conventions/sample.js';

const SERVICE = [
  "import { NotFoundError } from '../errors.js';", // 1
  '', // 2
  'export class UserService {', // 3
  '  async get(id: string) {', // 4
  '    const user = await this.repo.find(id);', // 5
  "    if (!user) throw new NotFoundError('User not found');", // 6
  '', // 7
  '    return user;', // 8
  '  }', // 9
  '}', // 10
].join('\n');

const files: SampledFile[] = [
  { path: 'src/users/service.ts', kind: 'code', content: SERVICE },
  { path: 'tsconfig.json', kind: 'config', content: '{ "compilerOptions": { "strict": true } }' },
];

function candidate(over: Partial<ConventionLlmCandidate> & { evidence?: Partial<ConventionLlmCandidate['evidence']> }): ConventionLlmCandidate {
  return {
    category: 'error-handling',
    rule: 'Throw NotFoundError when a lookup misses.',
    confidence: 0.9,
    ...over,
    evidence: {
      path: 'src/users/service.ts',
      line: 6,
      snippet: "if (!user) throw new NotFoundError('User not found');",
      ...over.evidence,
    },
  };
}

describe('conventions verify', () => {
  it('keeps a snippet found on the cited line and stores the file text', () => {
    const { verified, dropped } = verifyCandidates([candidate({})], files);
    expect(dropped).toBe(0);
    expect(verified[0]).toMatchObject({ evidenceLineStart: 6, evidenceLineEnd: 6 });
    expect(verified[0]!.evidenceSnippet).toBe("    if (!user) throw new NotFoundError('User not found');");
  });

  it('corrects a nearby line number to the real one', () => {
    const { verified } = verifyCandidates([candidate({ evidence: { line: 9 } })], files);
    expect(verified[0]!.evidenceLineStart).toBe(6);
  });

  it('finds the snippet elsewhere in the file when the line is far off', () => {
    const { verified } = verifyCandidates([candidate({ evidence: { line: 400 } })], files);
    expect(verified[0]!.evidenceLineStart).toBe(6);
  });

  it('matches a multi-line snippet across a blank line and sets the range', () => {
    const snippet = "if (!user) throw new NotFoundError('User not found');\nreturn user;";
    const { verified } = verifyCandidates([candidate({ evidence: { line: 6, snippet } })], files);
    expect(verified[0]).toMatchObject({ evidenceLineStart: 6, evidenceLineEnd: 8 });
  });

  it('ignores a copied "N| " line-number prefix', () => {
    const snippet = "6| if (!user) throw new NotFoundError('User not found');";
    expect(verifyCandidates([candidate({ evidence: { snippet } })], files).verified).toHaveLength(1);
  });

  it('drops a snippet that is not in the file', () => {
    const snippet = 'if (!user) return null;';
    expect(verifyCandidates([candidate({ evidence: { snippet } })], files)).toEqual({ verified: [], dropped: 1 });
  });

  it('drops a short fragment that only appears inside a longer line', () => {
    expect(verifyCandidates([candidate({ evidence: { snippet: 'user' } })], files).verified).toHaveLength(0);
  });

  it('drops evidence outside the sampled code files, including configs', () => {
    const outside = candidate({ evidence: { path: 'src/other.ts' } });
    const config = candidate({ evidence: { path: 'tsconfig.json', line: 1, snippet: '{ "compilerOptions": { "strict": true } }' } });
    expect(verifyCandidates([outside, config], files)).toEqual({ verified: [], dropped: 2 });
  });

  it('accepts a ./-prefixed path', () => {
    const c = candidate({ evidence: { path: './src/users/service.ts' } });
    expect(verifyCandidates([c], files).verified[0]!.evidencePath).toBe('src/users/service.ts');
  });

  it('drops duplicates by normalized rule and clamps confidence', () => {
    const { verified, dropped } = verifyCandidates(
      [candidate({ confidence: 1.4 }), candidate({ rule: '  throw NotFoundError when a lookup MISSES ' })],
      files,
    );
    expect(verified).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(verified[0]!.confidence).toBe(1);
  });
});

describe('conventions domain and sampling', () => {
  it('normalizeRule ignores case, spacing and trailing punctuation', () => {
    expect(normalizeRule('  Use  async/await. ')).toBe(normalizeRule('use async/await'));
  });

  it('evidenceUrl pins the indexed sha and anchors a range or a single line', () => {
    const repo = { owner: 'acme', name: 'api', sha: 'abc123' };
    expect(evidenceUrl(repo, 'src/a b.ts', 3, 7)).toBe('https://github.com/acme/api/blob/abc123/src/a%20b.ts#L3-L7');
    expect(evidenceUrl(repo, 'src/a.ts', 3, 3)).toBe('https://github.com/acme/api/blob/abc123/src/a.ts#L3');
    expect(evidenceUrl({ ...repo, sha: null }, 'src/a.ts', 3, 3)).toBeNull();
  });

  it('configCandidates looks at the root and the code sample top-level folders', () => {
    const paths = configCandidates(['server/src/app.ts', 'client/src/page.tsx', 'index.ts']);
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('server/tsconfig.json');
    expect(paths).toContain('client/.prettierrc');
    expect(paths.filter((p) => p.endsWith('/tsconfig.json'))).toHaveLength(2);
  });

  it('capCode keeps the head of the file', () => {
    const long = Array.from({ length: 450 }, (_, i) => `line ${i + 1}`).join('\n');
    const capped = capCode(long).split('\n');
    expect(capped).toHaveLength(400);
    expect(capped[399]).toBe('line 400');
  });
});

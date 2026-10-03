import { describe, it, expect } from 'vitest';
import { buildSkillDraft, draftSkillName, evidenceFiles, ruleSlug } from '../src/modules/conventions/draft.js';
import type { ConventionRecord } from '../src/modules/conventions/domain.js';

function record(over: Partial<ConventionRecord>): ConventionRecord {
  return {
    id: 'c1',
    category: 'naming',
    rule: 'Name React components in PascalCase.',
    evidencePath: 'src/components/UserCard.tsx',
    evidenceLineStart: 3,
    evidenceLineEnd: 3,
    evidenceSnippet: 'export function UserCard() {',
    confidence: 0.8,
    status: 'accepted',
    ...over,
  };
}

describe('conventions skill draft', () => {
  const accepted = [
    record({ id: 'a', category: 'error-handling', rule: 'Throw AppError subclasses from services.', confidence: 0.7, evidencePath: 'src/svc.ts', evidenceLineStart: 10, evidenceLineEnd: 12, evidenceSnippet: 'if (!x) {\n  throw new NotFoundError();\n}' }),
    record({ id: 'b', category: 'naming', rule: 'Use kebab-case file names.', confidence: 0.6 }),
    record({ id: 'c', category: 'naming', rule: 'Name React components in PascalCase.', confidence: 0.9 }),
  ];

  it('groups by category in enum order, then by confidence', () => {
    const { body } = buildSkillDraft('repo-conventions', 'acme/web', accepted);
    const order = [
      body.indexOf('## Naming'),
      body.indexOf('### name-react-components-in'),
      body.indexOf('### use-kebab-case-file'),
      body.indexOf('## Error handling'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('cites the evidence range and fences the real snippet', () => {
    const { body } = buildSkillDraft('repo-conventions', 'acme/web', accepted);
    expect(body).toContain('Detected in `src/svc.ts:10-12`:\n\n```\nif (!x) {\n  throw new NotFoundError();\n}\n```');
    expect(body).toContain('Detected in `src/components/UserCard.tsx:3`:');
    expect(body.startsWith('# repo-conventions\n\nHouse conventions for `acme/web`.')).toBe(true);
  });

  it('uses a longer fence when the snippet contains backticks', () => {
    const { body } = buildSkillDraft('repo-conventions', 'acme/web', [
      record({ evidenceSnippet: 'const s = ```not a fence```;' }),
    ]);
    expect(body).toContain('````\nconst s = ```not a fence```;\n````');
  });

  it('fills name, description and type', () => {
    const draft = buildSkillDraft('repo-conventions', 'acme/web', accepted);
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', description: '3 house conventions extracted from acme/web' });
    expect(buildSkillDraft('x', 'acme/web', [accepted[0]!]).description).toBe('1 house convention extracted from acme/web');
  });

  it('falls back to <repo>-conventions when repo-conventions is taken', () => {
    expect(draftSkillName('Web_App', () => false)).toBe('repo-conventions');
    expect(draftSkillName('Web_App', (n) => n === 'repo-conventions')).toBe('web-app-conventions');
  });

  it('ruleSlug takes the first four words', () => {
    expect(ruleSlug('Use async/await, never .then() chains')).toBe('use-async-await-never');
    expect(ruleSlug('!!!')).toBe('rule');
  });

  it('evidenceFiles lists each path once', () => {
    expect(evidenceFiles(accepted)).toEqual(['src/svc.ts', 'src/components/UserCard.tsx']);
  });
});

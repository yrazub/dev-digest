import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { confidenceLevel } from '../src/modules/conventions/confidence.js';
import { buildSkillDraft } from '../src/modules/conventions/draft.js';

const cases = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'conventions-confidence.json'), 'utf8')) as {
  confidence: number;
  level: string;
}[];

describe('convention confidence level', () => {
  it.each(cases)('$confidence → $level', ({ confidence, level }) => {
    expect(confidenceLevel(confidence)).toBe(level);
  });

  it('rejects a confidence outside 0–1', () => {
    expect(() => confidenceLevel(1.2)).toThrow('between 0 and 1');
    expect(() => confidenceLevel(Number.NaN)).toThrow();
  });

  it('the skill draft states each rule’s confidence level', () => {
    const { body } = buildSkillDraft('repo-conventions', 'acme/api', [
      {
        id: 'c1',
        category: 'naming',
        rule: 'Name React components in PascalCase.',
        evidencePath: 'src/A.tsx',
        evidenceLineStart: 1,
        evidenceLineEnd: 1,
        evidenceSnippet: 'export function A() {',
        confidence: 0.91,
        status: 'accepted',
      },
    ]);
    expect(body).toContain('Name React components in PascalCase.\n\nConfidence: high.');
  });
});

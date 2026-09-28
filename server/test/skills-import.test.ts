import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseFrontmatter, parseSkillMarkdown, parseSkillZip } from '../src/modules/skills/import/parse.js';
import { resolveSkillUrl } from '../src/modules/skills/import/url.js';
import { planSkillUpdate, toSkillSlug } from '../src/modules/skills/domain.js';
import { isPrivateAddress } from '../src/adapters/http-fetch/index.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { MockHttpFetcher } from '../src/adapters/mocks.js';
import type { SkillStore, SkillsUnitOfWork } from '../src/modules/skills/ports.js';

const SKILL_MD = `---
name: breaking-change
description: Flag any removed or renamed field in a public response.
type: rubric
---

# Breaking change

Flag it.
`;

describe('skill markdown import', () => {
  it('reads name, description and type from frontmatter', () => {
    const d = parseSkillMarkdown(SKILL_MD, 'fallback');
    expect(d).toMatchObject({
      name: 'breaking-change',
      description: 'Flag any removed or renamed field in a public response.',
      type: 'rubric',
      warnings: [],
    });
    expect(d.body.startsWith('# Breaking change')).toBe(true);
  });

  it('falls back to the file name and first paragraph, with a warning', () => {
    const d = parseSkillMarkdown('# Title\n\nCheck every branch.\n\nMore.', 'Edge Cases');
    expect(d.name).toBe('edge-cases');
    expect(d.description).toBe('Check every branch.');
    expect(d.type).toBe('custom');
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it('normalises an invalid name and an unknown type', () => {
    const d = parseSkillMarkdown('---\nname: My Skill\ndescription: d\ntype: weird\n---\nbody', 'x');
    expect(d.name).toBe('my-skill');
    expect(d.type).toBe('custom');
    expect(d.warnings).toHaveLength(2);
  });

  it('supports folded block scalars in frontmatter', () => {
    const { data } = parseFrontmatter('---\ndescription: >\n  line one\n  line two\nname: a\n---\nb');
    expect(data).toEqual({ description: 'line one line two', name: 'a' });
  });

  it('rejects an empty body', () => {
    expect(() => parseSkillMarkdown('---\nname: a\n---\n  ', 'a')).toThrow(/no body/);
  });
});

describe('skill zip import', () => {
  it('reads SKILL.md one folder deep and lists everything else as ignored', () => {
    const zip = zipSync({
      'breaking-change/SKILL.md': strToU8(SKILL_MD),
      'breaking-change/scripts/run.sh': strToU8('rm -rf /'),
      'breaking-change/references/notes.md': strToU8('notes'),
      '__MACOSX/breaking-change/._SKILL.md': strToU8('junk'),
    });
    const d = parseSkillZip(zip, 'bundle.zip');
    expect(d.name).toBe('breaking-change');
    expect(d.ignored_files).toEqual(['breaking-change/scripts/run.sh', 'breaking-change/references/notes.md']);
    expect(d.body).not.toContain('rm -rf');
  });

  it('uses the archive name when SKILL.md has no frontmatter name at the root', () => {
    const d = parseSkillZip(zipSync({ 'SKILL.md': strToU8('Just a rule.') }), 'Edge Cases.zip');
    expect(d.name).toBe('edge-cases');
  });

  it('rejects archives without exactly one SKILL.md', () => {
    expect(() => parseSkillZip(zipSync({ 'README.md': strToU8('x') }), 'a.zip')).toThrow(/no SKILL.md/);
    expect(() =>
      parseSkillZip(zipSync({ 'a/SKILL.md': strToU8('x'), 'b/SKILL.md': strToU8('y') }), 'a.zip'),
    ).toThrow(/more than one/);
    expect(() => parseSkillZip(zipSync({ 'a/b/SKILL.md': strToU8('x') }), 'a.zip')).toThrow(/no SKILL.md/);
  });

  it('rejects unsafe paths and non-zip data', () => {
    const evil = zipSync({ 'SKILL.md': strToU8('x'), '../evil.sh': strToU8('y') });
    expect(() => parseSkillZip(evil, 'a.zip')).toThrow(/unsafe path/);
    expect(() => parseSkillZip(strToU8('not a zip'), 'a.zip')).toThrow(/readable/);
  });

  it('rejects too many entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': strToU8('x') };
    for (let i = 0; i < 200; i++) files[`f${i}.txt`] = strToU8('');
    expect(() => parseSkillZip(zipSync(files), 'a.zip')).toThrow(/more than 200/);
  });
});

describe('skill URL import', () => {
  it('rewrites a GitHub blob link to raw and names SKILL.md after its folder', () => {
    expect(resolveSkillUrl('https://github.com/o/r/blob/main/skills/semver/SKILL.md')).toEqual({
      fetchUrl: 'https://raw.githubusercontent.com/o/r/main/skills/semver/SKILL.md',
      fallbackName: 'semver',
    });
  });

  it('accepts other https .md URLs and rejects http and non-.md', () => {
    expect(resolveSkillUrl('https://example.com/rules/edge-cases.md').fallbackName).toBe('edge-cases');
    expect(() => resolveSkillUrl('http://example.com/a.md')).toThrow(/https/);
    expect(() => resolveSkillUrl('https://example.com/a.txt')).toThrow(/\.md/);
    expect(() => resolveSkillUrl('not a url')).toThrow(/valid URL/);
  });

  it('classifies private and public addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['185.199.108.133', '8.8.8.8', '2606:50c0:8000::154']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('service fetches the resolved URL and returns an imported_url draft', async () => {
    const http = new MockHttpFetcher({
      'https://raw.githubusercontent.com/o/r/main/breaking-change.md': SKILL_MD,
    });
    const unused = {} as SkillStore;
    const service = new SkillsService({ store: unused, uow: {} as SkillsUnitOfWork, http });
    const draft = await service.importUrl('https://github.com/o/r/blob/main/breaking-change.md');
    expect(draft.source).toBe('imported_url');
    expect(draft.name).toBe('breaking-change');
    expect(http.requested).toEqual(['https://raw.githubusercontent.com/o/r/main/breaking-change.md']);
  });
});

describe('skill domain rules', () => {
  it('a body change bumps the version and snapshots it with the note', () => {
    const plan = planSkillUpdate({ body: 'a', version: 3 }, { body: 'b', version_note: ' tighter ' });
    expect(plan.changes).toMatchObject({ body: 'b', version: 4 });
    expect(plan.snapshot).toEqual({ version: 4, body: 'b', note: 'tighter' });
  });

  it('metadata-only or same-body edits do not version', () => {
    expect(planSkillUpdate({ body: 'a', version: 1 }, { enabled: false }).snapshot).toBeUndefined();
    const same = planSkillUpdate({ body: 'a', version: 1 }, { body: 'a', name: 'x' });
    expect(same.snapshot).toBeUndefined();
    expect(same.changes).toEqual({ name: 'x' });
  });

  it('slugifies names', () => {
    expect(toSkillSlug('  API Contract / Breaking!  ')).toBe('api-contract-breaking');
  });
});

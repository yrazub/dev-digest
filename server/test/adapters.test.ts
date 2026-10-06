import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('MockGitHubClient.getFileContent', () => {
  const repo = { owner: 'a', name: 'b' };

  it('returns { file } for a configured "<ref>:<path>" and { not_found } for any other key', async () => {
    const gh = new MockGitHubClient({ files: { 'a1b2c3d4:docs/spec.md': '# Spec\n' } });
    expect(await gh.getFileContent(repo, 'docs/spec.md', 'a1b2c3d4')).toEqual({
      file: { path: 'docs/spec.md', ref: 'a1b2c3d4', content: '# Spec\n', size: 7 },
    });
    // same path, other ref; same ref, other path
    expect(await gh.getFileContent(repo, 'docs/spec.md', 'main')).toEqual({ file: null, reason: 'not_found' });
    expect(await gh.getFileContent(repo, 'docs/other.md', 'a1b2c3d4')).toEqual({ file: null, reason: 'not_found' });
  });

  it('records each request in fileRequests, in call order, hit or miss', async () => {
    const gh = new MockGitHubClient({ files: { 'abc:a.md': 'x' } });
    await gh.getFileContent(repo, 'a.md', 'abc');
    await gh.getFileContent(repo, 'b.md', 'abc');
    await gh.getFileContent(repo, 'a.md', 'main');
    expect(gh.fileRequests).toEqual(['abc:a.md', 'abc:b.md', 'main:a.md']);
  });

  it('fileMisses with a reason resolves { file: null, reason }, ahead of a configured file', async () => {
    const gh = new MockGitHubClient({
      files: { 'abc:a.md': 'content' },
      fileMisses: { 'abc:a.md': 'not_a_file', 'abc:b.md': 'too_large' },
    });
    expect(await gh.getFileContent(repo, 'a.md', 'abc')).toEqual({ file: null, reason: 'not_a_file' });
    expect(await gh.getFileContent(repo, 'b.md', 'abc')).toEqual({ file: null, reason: 'too_large' });
  });

  it('fileMisses with an Error rejects with it, and the request is still recorded', async () => {
    const boom = new Error('github down');
    const gh = new MockGitHubClient({ fileMisses: { 'abc:a.md': boom } });
    await expect(gh.getFileContent(repo, 'a.md', 'abc')).rejects.toBe(boom);
    expect(gh.fileRequests).toEqual(['abc:a.md']);
  });

  it('resolves too_large for content above maxBytes, counted in UTF-8 bytes', async () => {
    const gh = new MockGitHubClient({ files: { 'r:a.md': 'abcdef', 'r:b.md': 'abcde', 'r:c.md': 'ééé' } });
    expect(await gh.getFileContent(repo, 'a.md', 'r', { maxBytes: 5 })).toEqual({ file: null, reason: 'too_large' });
    expect(await gh.getFileContent(repo, 'b.md', 'r', { maxBytes: 5 })).toMatchObject({ file: { size: 5 } });
    // 3 characters, 6 bytes
    expect(await gh.getFileContent(repo, 'c.md', 'r', { maxBytes: 5 })).toEqual({ file: null, reason: 'too_large' });
  });

  it("resolves empty for configured content ''", async () => {
    const gh = new MockGitHubClient({ files: { 'r:a.md': '' } });
    expect(await gh.getFileContent(repo, 'a.md', 'r')).toEqual({ file: null, reason: 'empty' });
  });
});

describe('MockGitHubClient.getIssue', () => {
  const repo = { owner: 'a', name: 'b' };

  it('resolves null for `issues: { 7: null }`', async () => {
    const gh = new MockGitHubClient({ issues: { 7: null } });
    expect(await gh.getIssue(repo, 7)).toBeNull();
  });

  it('rejects with an Error entry', async () => {
    const boom = new Error('github down');
    const gh = new MockGitHubClient({ issues: { 8: boom } });
    await expect(gh.getIssue(repo, 8)).rejects.toBe(boom);
  });

  it('resolves a configured issue as given, and the canned issue for an unset number', async () => {
    const issue = { number: 9, title: 'Real', body: 'text', state: 'closed' as const };
    const gh = new MockGitHubClient({ issues: { 9: issue } });
    expect(await gh.getIssue(repo, 9)).toEqual(issue);
    expect(await gh.getIssue(repo, 10)).toEqual({ number: 10, title: 'Issue #10', body: 'mock issue', state: 'open' });
  });

  it('records every call in issueRequests, in call order', async () => {
    const gh = new MockGitHubClient({ issues: { 7: null, 8: new Error('x') } });
    await gh.getIssue(repo, 7);
    await gh.getIssue(repo, 8).catch(() => undefined);
    await gh.getIssue(repo, 9);
    expect(gh.issueRequests).toEqual([7, 8, 9]);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    // Current Claude ids as the Anthropic API lists them (dashes, not OpenRouter's dots).
    expect(estimateCost('claude-sonnet-5', 14_144, 1_607)).toBeCloseTo(0.044358, 6);
    expect(estimateCost('claude-haiku-4-5-20251001', 1_000_000, 0)).toBeCloseTo(1.0, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});

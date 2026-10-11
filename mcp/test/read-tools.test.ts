import { describe, expect, it, vi } from 'vitest';
import { MAX_AGENT_NAME, MAX_DESCRIPTION, MAX_ID, MAX_MODEL, MAX_PATH, MAX_REPO, MAX_RULE } from '../src/constants.js';
import { MockDevDigestApi, type MockDevDigestApiOptions, type MockDevDigestApiState } from '../src/mocks.js';
import {
  ApiError,
  type ApiAgent,
  type ApiConvention,
  type ApiFinding,
  type ApiReview,
  type ApiRun,
} from '../src/ports.js';
import { executeTool, type ToolDef, type ToolDeps } from '../src/tool.js';
import { getConventions } from '../src/tools/get-conventions.js';
import { getFindings } from '../src/tools/get-findings.js';
import { listAgents } from '../src/tools/list-agents.js';

// The three read tools through `executeTool`, the one path every tool takes, against the in-memory API.

const REPO = { id: 'repo-1', full_name: 'acme/payments-api' };
const PR = { id: 'pr-482', number: 482 };

function setup(state: Partial<MockDevDigestApiState> = {}, opts: MockDevDigestApiOptions = {}) {
  const api = new MockDevDigestApi(state, opts);
  const deps: ToolDeps & { log: ReturnType<typeof vi.fn> } = {
    api,
    config: { apiUrl: 'http://127.0.0.1:3001', waitMs: 120_000 },
    log: vi.fn(),
  };
  return { api, deps };
}

/** A repo with one imported PR, plus whatever the case adds. */
function withPr(extra: Partial<MockDevDigestApiState> = {}): Partial<MockDevDigestApiState> {
  return { repos: [REPO], pulls: { [REPO.id]: [PR] }, ...extra };
}

async function call(def: ToolDef, args: unknown, state: Partial<MockDevDigestApiState>, opts?: MockDevDigestApiOptions) {
  const { api, deps } = setup(state, opts);
  const result = await executeTool(def, args, deps);
  const content = result.content as Array<{ type: string; text: string }>;
  expect(content).toHaveLength(1);
  expect(content[0]?.type).toBe('text');
  const text = content[0]?.text ?? '';
  return { api, result, text, isError: result.isError === true };
}

const asDef = (def: unknown) => def as ToolDef;
const json = (text: string) => JSON.parse(text) as Record<string, any>;

function agent(over: Partial<ApiAgent> = {}): ApiAgent {
  return {
    id: 'agent-1',
    name: 'Security Reviewer',
    description: 'Flags secrets.',
    provider: 'openai',
    model: 'gpt-4.1',
    enabled: true,
    ...over,
  };
}

function convention(over: Partial<ApiConvention> = {}): ApiConvention {
  return {
    category: 'naming',
    rule: 'Name route modules after the resource.',
    evidence_path: 'src/api/users.ts',
    evidence_line_start: 3,
    evidence_line_end: 3,
    status: 'accepted',
    ...over,
  };
}

function finding(over: Partial<ApiFinding> = {}): ApiFinding {
  return {
    severity: 'WARNING',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'Because.',
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ApiReview> = {}): ApiReview {
  return {
    run_id: 'run-1',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'A summary.',
    score: 65,
    created_at: '2026-10-10T09:00:00.000Z',
    findings: [finding()],
    ...over,
  };
}

function run(over: Partial<ApiRun> = {}): ApiRun {
  return { run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security Reviewer', status: 'done', error: null, ...over };
}

/** Every case below ends here: a read tool never starts or waits on a run (L3). */
function expectNoWrite(api: MockDevDigestApi) {
  const methods = api.calls.map((c) => c.method);
  expect(methods).not.toContain('startReview');
  expect(methods).not.toContain('waitForRun');
}

describe('list_agents', () => {
  it('sorts by name and writes model as provider/model, with only the five fields', async () => {
    const { api, text, isError } = await call(asDef(listAgents), {}, {
      agents: [
        agent({ id: 'a-sec', name: 'Security Reviewer', provider: 'anthropic', model: 'claude-sonnet' }),
        agent({ id: 'a-gen', name: 'General Reviewer', enabled: false }),
        agent({ id: 'a-perf', name: 'Performance Reviewer', provider: 'openrouter', model: 'x/y' }),
      ],
    });

    expect(isError).toBe(false);
    const { agents } = json(text);
    expect(agents.map((a: { name: string }) => a.name)).toEqual(['General Reviewer', 'Performance Reviewer', 'Security Reviewer']);
    expect(agents[0]).toEqual({
      id: 'a-gen',
      name: 'General Reviewer',
      description: 'Flags secrets.',
      model: 'openai/gpt-4.1',
      enabled: false,
    });
    expect(agents[2].model).toBe('anthropic/claude-sonnet');
    expect(agents[1].model).toBe('openrouter/x/y');
    expect(json(text)).not.toHaveProperty('note');
    expectNoWrite(api);
  });

  it('never returns a system prompt, even when the API row carries one', async () => {
    const withPrompt = { ...agent(), system_prompt: 'You are a ruthless security reviewer.' } as ApiAgent;

    const { text } = await call(asDef(listAgents), {}, { agents: [withPrompt] });

    expect(text).not.toContain('You are');
    expect(text).not.toContain('system_prompt');
  });

  it('cuts a 400-character description at 200 characters with an ellipsis', async () => {
    const { text } = await call(asDef(listAgents), {}, { agents: [agent({ description: 'D'.repeat(400) })] });

    const description = json(text).agents[0].description as string;
    expect(description).toHaveLength(200);
    expect(description.endsWith('…')).toBe(true);
  });

  it('masks a token-like string in the description and collapses its lines to one', async () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz012345';

    const { text } = await call(asDef(listAgents), {}, {
      agents: [agent({ description: `Flags ${secret}\n\n  and similar.\r\n\tSecond line.` })],
    });

    expect(text).not.toContain(secret);
    expect(json(text).agents[0].description).toBe('Flags *** and similar. Second line.');
  });

  it('masks before it cuts a long description: 200 characters, an ellipsis, no token start left', async () => {
    const { text } = await call(asDef(listAgents), {}, {
      agents: [agent({ description: `sk_live_AbCdEfGhIjKlMnOp1234 ${'word '.repeat(100)}` })],
    });

    const description = json(text).agents[0].description as string;
    expect(description).toHaveLength(MAX_DESCRIPTION);
    expect(description.startsWith('*** word')).toBe(true);
    expect(description.endsWith('…')).toBe(true);
    expect(text).not.toContain('sk_live');
  });

  it('does not mask id, name or model: they stay on the plain cut', async () => {
    const token = 'sk_live_AbCdEfGhIjKlMnOp1234';

    const { text } = await call(asDef(listAgents), {}, {
      agents: [agent({ id: token, name: token, provider: 'openai', model: token })],
    });

    expect(json(text).agents[0]).toMatchObject({ id: token, name: token, model: `openai/${token}` });
  });

  it('cuts name at MAX_AGENT_NAME and id at MAX_ID, each ending with an ellipsis', async () => {
    const { text } = await call(asDef(listAgents), {}, {
      agents: [agent({ id: 'i'.repeat(500), name: 'N'.repeat(500) })],
    });

    const [listed] = json(text).agents;
    expect(listed.id).toHaveLength(MAX_ID);
    expect(listed.id.endsWith('…')).toBe(true);
    expect(listed.name).toHaveLength(MAX_AGENT_NAME);
    expect(listed.name.endsWith('…')).toBe(true);
  });

  it('cuts the provider/model string at MAX_MODEL, ending with an ellipsis', async () => {
    const { text } = await call(asDef(listAgents), {}, {
      agents: [agent({ provider: 'openrouter', model: 'm'.repeat(500) })],
    });

    const model = json(text).agents[0].model as string;
    expect(model).toHaveLength(MAX_MODEL);
    expect(model.startsWith('openrouter/mmm')).toBe(true);
    expect(model.endsWith('…')).toBe(true);
  });

  it('leaves an id, a name and a model that are exactly at their caps alone, and a uuid untouched', async () => {
    const uuid = '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c';
    const exactName = 'N'.repeat(MAX_AGENT_NAME);
    const provider = 'openai';
    const exactModel = 'm'.repeat(MAX_MODEL - provider.length - 1);
    const { text } = await call(asDef(listAgents), {}, {
      agents: [
        agent({ id: uuid, name: exactName, provider, model: exactModel }),
        agent({ id: 'j'.repeat(MAX_ID), name: 'Other' }),
      ],
    });

    const { agents } = json(text);
    const first = agents.find((a: { name: string }) => a.name === exactName);
    expect(first.id).toBe(uuid);
    expect(first.model).toBe(`${provider}/${exactModel}`);
    expect(first.model).toHaveLength(MAX_MODEL);
    expect(agents.find((a: { name: string }) => a.name === 'Other').id).toBe('j'.repeat(MAX_ID));
  });

  it('answers an empty list with agents: [] and the note that names where to create one', async () => {
    const { text, isError } = await call(asDef(listAgents), {}, {});

    expect(isError).toBe(false);
    expect(json(text)).toEqual({
      agents: [],
      note: 'No agents are configured. Create one in the DevDigest UI (Agents).',
    });
  });

  it('cuts more than 50 agents and says so', async () => {
    const many = Array.from({ length: 51 }, (_, i) => agent({ id: `a-${i}`, name: `Agent ${String(i).padStart(2, '0')}` }));

    const { text } = await call(asDef(listAgents), {}, { agents: many });

    expect(json(text).agents).toHaveLength(50);
    expect(json(text).note).toBe('Showing the first 50 of 51 agents, sorted by name.');
  });

  it('answers an unknown argument with E-ARGS', async () => {
    const { text, isError, api } = await call(asDef(listAgents), { name: 'x' }, { agents: [agent()] });

    expect(isError).toBe(true);
    expect(text).toContain('Invalid arguments for list_agents');
    expect(api.calls).toEqual([]);
  });
});

describe('get_conventions', () => {
  const conventions = (candidates: ApiConvention[], last_scan_at: string | null = '2026-10-01T00:00:00.000Z') => ({
    conventions: { [REPO.id]: { scan: { last_scan_at, sampled_files: 12 }, candidates } },
  });
  const state = (candidates: ApiConvention[], last = '2026-10-01T00:00:00.000Z' as string | null) => ({
    repos: [REPO],
    ...conventions(candidates, last),
  });

  it('returns only accepted conventions by default, with the repository name, the status and the scan time', async () => {
    const { text, isError, api } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ rule: 'accepted rule', status: 'accepted' }),
      convention({ rule: 'pending rule', status: 'pending' }),
      convention({ rule: 'rejected rule', status: 'rejected' }),
    ]));

    expect(isError).toBe(false);
    const body = json(text);
    expect(body.repo).toBe('acme/payments-api');
    expect(body.status).toBe('accepted');
    expect(body.last_scan_at).toBe('2026-10-01T00:00:00.000Z');
    expect(body.conventions).toEqual([
      { category: 'naming', rule: 'accepted rule', evidence: 'src/api/users.ts:3' },
    ]);
    expect(body).not.toHaveProperty('note');
    expectNoWrite(api);
  });

  it('cuts repo at MAX_REPO and last_scan_at at MAX_ID, each ending with an ellipsis', async () => {
    const longRepo = { id: 'repo-long', full_name: `acme/${'r'.repeat(300)}` };
    const { text, isError } = await call(asDef(getConventions), { repo: longRepo.full_name }, {
      repos: [longRepo],
      conventions: {
        [longRepo.id]: { scan: { last_scan_at: 'T'.repeat(300), sampled_files: 3 }, candidates: [convention()] },
      },
    });

    expect(isError).toBe(false);
    const body = json(text);
    expect(body.repo).toHaveLength(MAX_REPO);
    expect(body.repo.startsWith('acme/rrr')).toBe(true);
    expect(body.repo.endsWith('…')).toBe(true);
    expect(body.last_scan_at).toHaveLength(MAX_ID);
    expect(body.last_scan_at.endsWith('…')).toBe(true);
  });

  it('keeps a null last_scan_at null', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([], null));

    expect(json(text).last_scan_at).toBeNull();
  });

  it('returns only pending conventions for status "pending"', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api', status: 'pending' }, state([
      convention({ rule: 'accepted rule', status: 'accepted' }),
      convention({ rule: 'pending rule', status: 'pending' }),
    ]));

    const body = json(text);
    expect(body.status).toBe('pending');
    expect(body.conventions.map((c: { rule: string }) => c.rule)).toEqual(['pending rule']);
  });

  it('writes evidence as path:start for one line and path:start-end for a range', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ evidence_path: 'src/one.ts', evidence_line_start: 3, evidence_line_end: 3 }),
      convention({ evidence_path: 'src/range.ts', evidence_line_start: 3, evidence_line_end: 9 }),
    ]));

    expect(json(text).conventions.map((c: { evidence: string }) => c.evidence)).toEqual(['src/one.ts:3', 'src/range.ts:3-9']);
  });

  it('cuts a rule longer than MAX_RULE to MAX_RULE characters ending with an ellipsis', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ rule: 'r'.repeat(MAX_RULE + 100) }),
    ]));

    const rule = json(text).conventions[0].rule as string;
    expect(rule).toHaveLength(MAX_RULE);
    expect(rule.endsWith('…')).toBe(true);
  });

  it('leaves a rule that is exactly MAX_RULE characters alone', async () => {
    const exact = 'r'.repeat(MAX_RULE);

    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([convention({ rule: exact })]));

    expect(json(text).conventions[0].rule).toBe(exact);
  });

  it('collapses whitespace and newlines in a rule to single spaces', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ rule: '  Use\n\n  kebab-case\t\tfor\r\nfiles.  ' }),
    ]));

    expect(json(text).conventions[0].rule).toBe('Use kebab-case for files.');
  });

  it('masks a token-like string in a rule', async () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';

    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ rule: `Never commit ${secret} to git.` }),
    ]));

    expect(text).not.toContain(secret);
    expect(json(text).conventions[0].rule).toBe('Never commit *** to git.');
  });

  it.each([
    ['one line', 3, 3, ':3'],
    ['a range', 3, 9, ':3-9'],
  ])('cuts a long evidence path but keeps the line numbers of %s whole at the end', async (_label, start, end, suffix) => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ evidence_path: `${'d/'.repeat(MAX_PATH)}x.ts`, evidence_line_start: start, evidence_line_end: end }),
    ]));

    const evidence = json(text).conventions[0].evidence as string;
    expect(evidence.endsWith(`…${suffix}`)).toBe(true);
    expect(evidence).toHaveLength(MAX_PATH + suffix.length);
  });

  it('collapses whitespace and masks a token-like string in an evidence path', async () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz012345';

    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ evidence_path: `src/\n${secret}.ts`, evidence_line_start: 1, evidence_line_end: 1 }),
    ]));

    expect(text).not.toContain(secret);
    expect(json(text).conventions[0].evidence).toBe('src/ ***.ts:1');
  });

  it('keeps the API order and drops the ids, snippets, urls and confidence', async () => {
    const fat = {
      ...convention({ rule: 'first' }),
      id: 'conv-id',
      evidence_snippet: 'const secret = 1;',
      evidence_url: 'https://github.com/acme/payments-api/blob/abc/x.ts',
      confidence: 0.9,
    } as ApiConvention;

    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([fat, convention({ rule: 'second' })]));

    const body = json(text);
    expect(body.conventions.map((c: { rule: string }) => c.rule)).toEqual(['first', 'second']);
    expect(Object.keys(body.conventions[0]).sort()).toEqual(['category', 'evidence', 'rule']);
    for (const dropped of ['conv-id', 'const secret', 'https://github.com', '0.9']) expect(text).not.toContain(dropped);
  });

  it('explains none accepted with two pending: the count and how to read them', async () => {
    const { text, isError } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([
      convention({ status: 'pending' }),
      convention({ status: 'pending' }),
    ]));

    expect(isError).toBe(false);
    const body = json(text);
    expect(body.conventions).toEqual([]);
    expect(body.note).toContain('No accepted conventions yet; 2 candidates are pending review in DevDigest (Skills Lab → Conventions).');
    expect(body.note).toContain('Call get_conventions with status "pending"');
  });

  it('explains no candidates and no scan: the repository has not been scanned', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([], null));

    const body = json(text);
    expect(body.conventions).toEqual([]);
    expect(body.last_scan_at).toBeNull();
    expect(body.note).toContain('This repository has not been scanned for conventions.');
    expect(body.note).toContain('Skills Lab → Conventions');
    expect(body.note).toContain('call get_conventions again');
  });

  it('explains a scanned repository with nothing to accept and nothing pending', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state([], '2026-10-01T00:00:00.000Z'));

    // Not in the plan's catalogue: pin what matters (it says nothing is accepted, names where to review, and
    // does not invent pending candidates) and leave the exact wording to the implementation.
    const note = json(text).note as string;
    expect(note).toContain('No accepted conventions');
    expect(note).toContain('Skills Lab → Conventions');
    expect(note).not.toContain('pending review');
    expect(note).not.toContain('not been scanned');
  });

  it('explains status "pending" with nothing pending', async () => {
    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api', status: 'pending' }, state([
      convention({ status: 'accepted' }),
    ]));

    expect(json(text).note).toBe(
      'No pending conventions for this repository. Review the extracted rules in DevDigest (Skills Lab → Conventions).',
    );
  });

  it('cuts more than 50 conventions at 50 and says so', async () => {
    const many = Array.from({ length: 51 }, (_, i) => convention({ rule: `rule ${i}` }));

    const { text } = await call(asDef(getConventions), { repo: 'acme/payments-api' }, state(many));

    const body = json(text);
    expect(body.conventions).toHaveLength(50);
    expect(body.conventions[49].rule).toBe('rule 49');
    expect(body.note).toBe('Showing the first 50 of 51 conventions.');
  });

  it('refuses status "rejected": the schema offers accepted and pending only', async () => {
    const { text, isError, api } = await call(asDef(getConventions), { repo: 'acme/payments-api', status: 'rejected' }, state([]));

    expect(isError).toBe(true);
    expect(text).toContain('Invalid arguments for get_conventions');
    expect(text).toContain('status');
    expect(api.calls).toEqual([]);
  });
});

describe('get_findings — selection', () => {
  const newest = review({ run_id: 'run-new', findings: [finding({ title: 'from the newest' })] });
  const older = review({ run_id: 'run-old', findings: [finding({ title: 'from the older' })] });

  const stateWithReviews = (reviews: ApiReview[], runs: ApiRun[] = []) =>
    withPr({ reviews: { [PR.id]: reviews }, runs: { [PR.id]: runs } });

  it('without run_id returns the newest review', async () => {
    const { text, isError, api } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, stateWithReviews([newest, older]));

    expect(isError).toBe(false);
    const body = json(text);
    expect(body.status).toBe('done');
    expect(body.run_id).toBe('run-new');
    expect(body.agent).toBe('Security Reviewer');
    expect(body.findings[0].title).toBe('from the newest');
    expectNoWrite(api);
  });

  it('shows a token-like string in a finding as *** and a multi-line rationale as one line, end to end', async () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz012345';
    const leaky = review({
      summary: `Summary mentions ${secret}.\nSecond line.`,
      findings: [
        finding({
          title: `Token ${secret} committed`,
          file: 'src/config.ts',
          rationale: `The diff adds\n\n  ${secret}\nto the config.`,
        }),
      ],
    });

    const { text, isError } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, stateWithReviews([leaky]));

    expect(isError).toBe(false);
    expect(text).not.toContain(secret);
    const body = json(text);
    expect(body.findings[0].title).toBe('Token *** committed');
    expect(body.findings[0].rationale).toBe('The diff adds *** to the config.');
    expect(body.summary).toBe('Summary mentions ***. Second line.');
  });

  it('with run_id returns the review of that run', async () => {
    const { text } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482, run_id: 'run-old' }, stateWithReviews([newest, older]));

    const body = json(text);
    expect(body.run_id).toBe('run-old');
    expect(body.findings[0].title).toBe('from the older');
  });

  it('ignores kind: "summary" reviews', async () => {
    const summary = review({ run_id: null, kind: 'summary', findings: [finding({ title: 'overview finding' })] });

    const { text } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, stateWithReviews([summary, older]));

    expect(json(text).run_id).toBe('run-old');
    expect(text).not.toContain('overview finding');
  });

  it('applies min_severity and limit while the counts still cover every finding', async () => {
    const mixed = review({
      findings: [
        finding({ severity: 'CRITICAL', start_line: 1 }),
        finding({ severity: 'WARNING', start_line: 2 }),
        finding({ severity: 'SUGGESTION', start_line: 3 }),
      ],
    });

    const { text } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482, min_severity: 'CRITICAL' }, stateWithReviews([mixed]));

    const body = json(text);
    expect(body.findings).toHaveLength(1);
    expect(body.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
  });

  it('accepts pr as a numeric string ("482")', async () => {
    const { text, isError } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: '482' }, stateWithReviews([newest]));

    expect(isError).toBe(false);
    expect(json(text).run_id).toBe('run-new');
  });

  it.each([
    ['pr 0', { pr: 0 }],
    ['a non-numeric pr', { pr: 'abc' }],
    ['limit 0', { pr: 482, limit: 0 }],
    ['limit 51', { pr: 482, limit: 51 }],
    ['an unknown min_severity', { pr: 482, min_severity: 'HIGH' }],
  ])('answers %s with E-ARGS and no API call', async (_label, extra) => {
    const { text, isError, api } = await call(asDef(getFindings), { repo: 'acme/payments-api', ...extra }, stateWithReviews([newest]));

    expect(isError).toBe(true);
    expect(text).toContain('Invalid arguments for get_findings');
    expect(api.calls).toEqual([]);
  });
});

describe('get_findings — no review to show', () => {
  const args = { repo: 'acme/payments-api', pr: 482 };
  const noReviews = (runs: ApiRun[]) => withPr({ reviews: { [PR.id]: [] }, runs: { [PR.id]: runs } });

  it('E-NO-REVIEW: no review and no run points to list_agents and run_agent_on_pr', async () => {
    const { text, isError, api } = await call(asDef(getFindings), args, noReviews([]));

    expect(isError).toBe(true);
    expect(text).toContain('acme/payments-api#482 has no finished review.');
    expect(text).toContain('list_agents');
    expect(text).toContain('run_agent_on_pr');
    expectNoWrite(api);
  });

  it('E-NO-REVIEW: a pull request with only a summary review has no finished review either', async () => {
    const summaryOnly = withPr({ reviews: { [PR.id]: [review({ kind: 'summary', run_id: null })] } });

    const { text, isError } = await call(asDef(getFindings), args, summaryOnly);

    expect(isError).toBe(true);
    expect(text).toContain('acme/payments-api#482 has no finished review.');
  });

  it('E-RUN-RUNNING: the newest run is still going; wait and do not start another', async () => {
    const { text, isError, api } = await call(asDef(getFindings), args, noReviews([run({ run_id: 'run-9', status: 'running' })]));

    expect(isError).toBe(true);
    expect(text).toContain('Run run-9 (Security Reviewer) on acme/payments-api#482 is still running.');
    expect(text).toContain('get_findings');
    expect(text).toContain('about 30 seconds');
    expect(text).toContain('Do not start another run.');
    expectNoWrite(api);
  });

  it('E-RUN-FAILED: quotes the run error and says to call run_agent_on_pr after fixing the cause', async () => {
    const { text, isError } = await call(asDef(getFindings), args, noReviews([run({ run_id: 'run-9', status: 'failed', error: 'OpenAI 401: bad key' })]));

    expect(isError).toBe(true);
    expect(text).toContain('Run run-9 (Security Reviewer) failed: OpenAI 401: bad key.');
    expect(text).toContain('Provider keys are set in DevDigest → Settings.');
    expect(text).toContain('run_agent_on_pr');
  });

  it('E-RUN-FAILED: with a null error says that none was recorded', async () => {
    const { text } = await call(asDef(getFindings), args, noReviews([run({ status: 'failed', error: null })]));

    expect(text).toContain('failed: no error was recorded; the API may have restarted during the run.');
  });

  it('E-RUN-FAILED: masks a token-like string in the run error', async () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';

    const { text } = await call(asDef(getFindings), args, noReviews([run({ status: 'failed', error: `401 for key ${secret}` })]));

    expect(text).not.toContain(secret);
    expect(text).toContain('***');
  });

  it('E-RUN-CANCELLED: names the run and says to start a new one', async () => {
    const { text, isError } = await call(asDef(getFindings), args, noReviews([run({ run_id: 'run-9', status: 'cancelled' })]));

    expect(isError).toBe(true);
    expect(text).toContain('Run run-9 (Security Reviewer) was cancelled in DevDigest.');
    expect(text).toContain('run_agent_on_pr');
  });

  it('E-RUN-NO-REVIEW: a done run whose review is not stored', async () => {
    const { text, isError } = await call(asDef(getFindings), args, noReviews([run({ run_id: 'run-9', status: 'done' })]));

    expect(isError).toBe(true);
    expect(text).toContain('Run run-9 finished but its review is no longer stored');
    expect(text).toContain('run_agent_on_pr');
  });

  it('with a run_id: reads that run, not the newest one', async () => {
    const state = noReviews([
      run({ run_id: 'run-new', status: 'done' }),
      run({ run_id: 'run-failing', status: 'failed', error: 'boom' }),
    ]);

    const { text } = await call(asDef(getFindings), { ...args, run_id: 'run-failing' }, state);

    expect(text).toContain('Run run-failing (Security Reviewer) failed: boom.');
  });

  it('with a run_id: E-RUN-UNKNOWN when the run is not one of this pull request\'s', async () => {
    const { text, isError } = await call(asDef(getFindings), { ...args, run_id: 'run-elsewhere' }, noReviews([run({ run_id: 'run-1' })]));

    expect(isError).toBe(true);
    expect(text).toContain('Run run-elsewhere does not belong to acme/payments-api#482.');
    expect(text).toContain('Omit run_id');
  });

  it('cuts the repository named in an error at MAX_REPO, before "#<pr>"', async () => {
    const longRepo = { id: 'repo-long', full_name: `acme/${'r'.repeat(300)}` };
    const state = { repos: [longRepo], pulls: { [longRepo.id]: [PR] } };

    const { text, isError } = await call(asDef(getFindings), { repo: longRepo.full_name, pr: 482 }, state);

    expect(isError).toBe(true);
    expect(text).toContain(`${'acme/' + 'r'.repeat(MAX_REPO - 'acme/'.length - 1)}…#482`);
    expect(text).not.toContain('r'.repeat(MAX_REPO));
  });

  it('with a run_id: a review of another run does not satisfy it', async () => {
    const state = withPr({
      reviews: { [PR.id]: [review({ run_id: 'run-1' })] },
      runs: { [PR.id]: [run({ run_id: 'run-1' })] },
    });

    const { text, isError } = await call(asDef(getFindings), { ...args, run_id: 'run-2' }, state);

    expect(isError).toBe(true);
    expect(text).toContain('Run run-2 does not belong to');
  });
});

describe('lookups (repo and pull request)', () => {
  const reviews = { reviews: { [PR.id]: [review()] } };

  it('resolves HTTPS://github.com/Acme/Payments-API.git to acme/payments-api, ignoring case', async () => {
    const { text, isError } = await call(asDef(getFindings), { repo: 'HTTPS://github.com/Acme/Payments-API.git', pr: 482 }, withPr(reviews));

    expect(isError).toBe(false);
    expect(json(text).status).toBe('done');
  });

  it('also trims whitespace and a trailing slash', async () => {
    const { isError } = await call(asDef(getConventions), { repo: '  acme/payments-api/  ' }, { repos: [REPO] });

    expect(isError).toBe(false);
  });

  it.each([
    ['one segment', 'payments-api'],
    ['an empty name', 'acme/'],
    ['an empty owner', '/payments-api'],
    ['three segments', 'a/b/c'],
    ['an empty string', ''],
  ])('E-REPO-FORMAT for %s, quoting the input and showing the format, with no lookup', async (_label, input) => {
    const { text, isError, api } = await call(asDef(getFindings), { repo: input, pr: 482 }, withPr(reviews));

    expect(isError).toBe(true);
    expect(text).toContain('repo must be "owner/name"');
    expect(text).toContain('acme/payments-api');
    expect(text).toContain(`Got "${input}".`);
    expect(api.calls).toEqual([]);
  });

  it('E-REPO-UNKNOWN lists the imported repositories, sorted, at most ten', async () => {
    const repos = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, full_name: `org/repo-${String(11 - i).padStart(2, '0')}` }));

    const { text, isError } = await call(asDef(getConventions), { repo: 'acme/missing' }, { repos });

    expect(isError).toBe(true);
    expect(text).toContain('Repository "acme/missing" is not imported into DevDigest.');
    expect(text).toContain('Imported repositories: org/repo-00, org/repo-01');
    expect(text).toContain('org/repo-09.');
    expect(text).not.toContain('org/repo-10');
    expect(text).not.toContain('org/repo-11');
    expect(text).toContain('add the repository in the DevDigest UI');
  });

  it('E-REPO-UNKNOWN with no repository at all gives its own text', async () => {
    const { text, isError } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, {});

    expect(isError).toBe(true);
    expect(text).toBe('No repository is imported into DevDigest yet. Add one in the DevDigest UI, then retry.');
  });

  it('E-PR-UNKNOWN names the number and lists the imported ones, highest first, at most ten', async () => {
    const pulls = Array.from({ length: 12 }, (_, i) => ({ id: `pr-${i + 1}`, number: i + 1 }));

    const { text, isError } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 9999 }, { repos: [REPO], pulls: { [REPO.id]: pulls } });

    expect(isError).toBe(true);
    expect(text).toContain('Pull request #9999 is not imported for acme/payments-api.');
    expect(text).toContain('Imported pull requests: #12, #11, #10, #9, #8, #7, #6, #5, #4, #3.');
    expect(text).not.toContain('#2,');
    expect(text).not.toContain('#1.');
    expect(text).toContain('open acme/payments-api in the DevDigest UI');
  });

  it('E-PR-UNKNOWN quotes the repository name through the mask and the cap', async () => {
    const token = 'ghp_abcdefghijklmnop1234';
    const odd = { id: 'repo-odd', full_name: `acme/${token}` };
    const long = { id: 'repo-long', full_name: `acme/${'r'.repeat(500)}` };

    const masked = await call(asDef(getFindings), { repo: odd.full_name, pr: 9 }, { repos: [odd], pulls: { [odd.id]: [PR] } });
    const capped = await call(asDef(getFindings), { repo: long.full_name, pr: 9 }, { repos: [long], pulls: { [long.id]: [PR] } });

    expect(masked.isError).toBe(true);
    expect(masked.text).toContain('Pull request #9 is not imported for acme/***.');
    expect(masked.text).not.toContain(token);
    expect(capped.isError).toBe(true);
    expect(capped.text).not.toContain('r'.repeat(300));
    expect(capped.text).toContain('…');
  });

  it('E-PR-UNKNOWN with no stored pull request says none is imported yet', async () => {
    const { text, isError } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, { repos: [REPO] });

    expect(isError).toBe(true);
    expect(text).toContain('Pull request #482 is not imported for acme/payments-api.');
    expect(text).toContain('No pull requests are imported for it yet.');
  });

  it('ignores a pull request without an id: it cannot be addressed', async () => {
    const { text, isError } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, {
      repos: [REPO],
      pulls: { [REPO.id]: [{ id: null, number: 482 }, { id: 'pr-481', number: 481 }] },
    });

    expect(isError).toBe(true);
    expect(text).toContain('Pull request #482 is not imported');
    expect(text).toContain('#481');
  });

  it('masks a token-like string that came from the caller before quoting it', async () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz012345';

    const { text } = await call(asDef(getFindings), { repo: `acme/${secret}`, pr: 482 }, withPr());

    expect(text).not.toContain(secret);
    expect(text).toContain('***');
  });
});

describe('API failures', () => {
  it.each([
    ['list_agents', asDef(listAgents), {}, 'listAgents'],
    ['get_conventions', asDef(getConventions), { repo: 'acme/payments-api' }, 'listRepos'],
    ['get_findings', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, 'listRepos'],
  ] as const)('%s: an ApiError("unreachable") becomes E-API-UNREACHABLE naming the API url and ./scripts/dev.sh', async (_name, def, args, method) => {
    const failure = new ApiError('unreachable', 'GET /repos');
    const { text, isError } = await call(def, args, withPr(), { fail: { [method]: failure } });

    expect(isError).toBe(true);
    expect(text).toContain('not reachable at http://127.0.0.1:3001');
    expect(text).toContain('./scripts/dev.sh');
  });

  it('an unexpected error becomes E-INTERNAL without its message, which goes to the log only', async () => {
    const { api, deps } = setup(withPr(), { fail: { listReviews: new Error('db password is hunter2') } });

    const result = await executeTool(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, deps);

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('unexpected error in get_findings');
    expect(text).not.toContain('hunter2');
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('hunter2'));
    expectNoWrite(api);
  });
});

describe('L3 — the read tools never start or wait on a run', () => {
  const reviews = { reviews: { [PR.id]: [review({ run_id: 'run-new' })] } };
  const runsOnly = (runs: ApiRun[]) => withPr({ runs: { [PR.id]: runs } });

  const cases: Array<[string, ToolDef, unknown, Partial<MockDevDigestApiState>]> = [
    ['list_agents', asDef(listAgents), {}, { agents: [agent()] }],
    ['list_agents (empty)', asDef(listAgents), {}, {}],
    ['get_conventions', asDef(getConventions), { repo: 'acme/payments-api' }, { repos: [REPO] }],
    ['get_conventions (unknown repo)', asDef(getConventions), { repo: 'nope/nope' }, { repos: [REPO] }],
    ['get_findings (review)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, withPr(reviews)],
    ['get_findings (run_id)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482, run_id: 'run-new' }, withPr(reviews)],
    ['get_findings (no review)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, withPr()],
    ['get_findings (running)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, runsOnly([run({ status: 'running' })])],
    ['get_findings (failed)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, runsOnly([run({ status: 'failed' })])],
    ['get_findings (cancelled)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, runsOnly([run({ status: 'cancelled' })])],
    ['get_findings (done, no review)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, runsOnly([run({ status: 'done' })])],
    ['get_findings (unknown run)', asDef(getFindings), { repo: 'acme/payments-api', pr: 482, run_id: 'zzz' }, withPr()],
    ['get_findings (unknown pr)', asDef(getFindings), { repo: 'acme/payments-api', pr: 1 }, withPr()],
    ['get_findings (bad arguments)', asDef(getFindings), { repo: 'acme/payments-api', pr: 0 }, withPr()],
  ];

  it.each(cases)('%s calls neither startReview nor waitForRun', async (_name, def, args, state) => {
    const { api } = await call(def, args, state);

    expectNoWrite(api);
  });

  it('reads, in order, only list calls: repos, pulls, reviews', async () => {
    const { api } = await call(asDef(getFindings), { repo: 'acme/payments-api', pr: 482 }, withPr(reviews));

    expect(api.calls.map((c) => c.method)).toEqual(['listRepos', 'listPulls', 'listReviews']);
    expect(api.calls[1]?.args).toEqual([REPO.id]);
    expect(api.calls[2]?.args).toEqual([PR.id]);
  });
});

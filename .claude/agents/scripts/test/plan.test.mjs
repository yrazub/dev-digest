import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parsePlan, slicePhase, phaseBody, REPO_ROOT, sddDir } from '../lib/plan.mjs';

const PLAN = `# Implementation Plan: demo

**Goal:** g · **Packages:** server · **Execution mode:** single-agent

## Constraints
- keep it

## Phases

Shared note for every phase.

### 1 · Contracts — server

| File | Change |
|---|---|
| a.ts | x |

\`\`\`markdown
### 9 · not a phase, inside a fence
## Not a section either
\`\`\`

### 2 · Client

#### Detail of phase 2

### Closing steps — not a phase

## Out of scope
- nothing
`;

test('phases are the numbered ### headings under ## Phases, fences ignored', () => {
  const p = parsePlan(PLAN);
  assert.equal(p.title, 'Implementation Plan: demo');
  assert.equal(p.mode, 'single-agent');
  assert.deepEqual(p.phases, [
    { n: 1, title: 'Contracts — server' },
    { n: 2, title: 'Client' },
  ]);
});

test('a slice keeps the shared sections and drops the other phases', () => {
  const s = slicePhase(PLAN, 2);
  for (const kept of ['## Constraints', 'Shared note for every phase.', '### 2 · Client', '#### Detail of phase 2', '### Closing steps', '## Out of scope']) {
    assert.ok(s.includes(kept), kept);
  }
  for (const dropped of ['### 1 · Contracts', '| a.ts | x |', 'not a phase, inside a fence']) assert.ok(!s.includes(dropped), dropped);
});

test('the fenced block stays with the phase it is in', () => {
  assert.ok(phaseBody(PLAN, 1).includes('### 9 · not a phase, inside a fence'));
  assert.ok(!phaseBody(PLAN, 1).includes('### 2 · Client'));
});

test('an unknown phase names the phases that exist', () => {
  assert.throws(() => slicePhase(PLAN, 7), /Phase 7 not found\. Phases in this plan: 1, 2\./);
});

test('a plan with no execution mode line reads as null', () => {
  assert.equal(parsePlan('# P\n\n## Phases\n\n### 1 · A\n').mode, null);
});

test('every saved plan has phases numbered 1..n and each slices', () => {
  const dir = path.join(REPO_ROOT, 'specs', 'plans');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(path.join(dir, f), 'utf8');
    const ns = parsePlan(text).phases.map((p) => p.n);
    assert.ok(ns.length > 0, `${f} has no phases`);
    assert.deepEqual(ns, ns.map((_, i) => i + 1), `${f} phases ${ns}`);
    for (const n of ns) assert.ok(slicePhase(text, n).length < text.length || ns.length === 1, `${f} phase ${n}`);
  }
});

test('the CLI writes the slice under .devdigest/sdd/<feature>/', () => {
  const plan = path.join(REPO_ROOT, 'specs', 'plans', 'L02-skills.md');
  const out = execFileSync('node', [path.join(REPO_ROOT, '.claude/agents/scripts/plan-phase.mjs'), plan, '3'], { encoding: 'utf8' });
  assert.match(out, /^\.devdigest\/sdd\/L02-skills\/phase-3\.md \(\d+ lines, \d+ KB\)\n$/);
  const file = path.join(sddDir('L02-skills'), 'phase-3.md');
  assert.ok(readFileSync(file, 'utf8').includes('### 3 · Server — agents, injection, seed'));
  rmSync(file);
  if (existsSync(sddDir('L02-skills')) && readdirSync(sddDir('L02-skills')).length === 0) rmSync(sddDir('L02-skills'), { recursive: true });
});

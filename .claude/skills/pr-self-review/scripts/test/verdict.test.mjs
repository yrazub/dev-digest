import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVerdict, evidenceInPatch, patchCorpus } from '../lib/verdict.mjs';

const PATCH = `diff --git a/server/src/modules/pulls/routes.ts b/server/src/modules/pulls/routes.ts
--- a/server/src/modules/pulls/routes.ts
+++ b/server/src/modules/pulls/routes.ts
@@ -40,2 +40,3 @@ export async function routes(app) {
   app.get('/pulls', async () => {
+    const rows = await db.select().from(t.pullRequests);
     return rows;
`;

const onion = {
  id: 'onion-architecture-1',
  skill: 'onion-architecture',
  can_block: true,
  critical_rules: ['db-only-in-repository'],
  files: ['server/src/modules/pulls/routes.ts'],
};
const next = { id: 'next-best-practices-1', skill: 'next-best-practices', can_block: false, critical_rules: [], files: ['client/src/app/page.tsx'] };

const diff = {
  files: [
    { path: 'server/src/modules/pulls/routes.ts', status: 'M', changed_lines: [[41, 41]] },
    { path: 'client/src/app/page.tsx', status: 'A', untracked: true, changed_lines: [[1, 20]] },
  ],
};

const finding = (over = {}) => ({
  rule_id: 'db-only-in-repository',
  severity: 'CRITICAL',
  file: 'server/src/modules/pulls/routes.ts',
  line: 41,
  title: 'Route queries the database directly',
  evidence: 'const rows = await db.select().from(t.pullRequests);',
  suggestion: 'Move it to the repository.',
  ...over,
});

const run = ({ tasks = [onion], outputs, patches = { [onion.id]: PATCH }, arch = null, archCheck = false, waivers } = {}) =>
  buildVerdict({ plan: { tasks, arch_check: archCheck }, diff, outputs, patches, arch, waivers });

const out = (...findings) => JSON.stringify({ findings });

test('a listed CRITICAL on a changed line blocks', () => {
  const v = run({ outputs: { [onion.id]: out(finding()) } });
  assert.equal(v.verdict, 'blocked');
  assert.deepEqual(v.reasons, ['critical']);
  assert.equal(v.counts.CRITICAL, 1);
});

test('no findings passes', () => {
  const v = run({ outputs: { [onion.id]: out() } });
  assert.equal(v.verdict, 'pass');
});

test('a CRITICAL with an unlisted rule is clamped to WARNING', () => {
  const v = run({ outputs: { [onion.id]: out(finding({ rule_id: 'dep-proportionate' })) } });
  assert.equal(v.verdict, 'pass');
  assert.equal(v.findings[0].severity, 'WARNING');
  assert.match(v.findings[0].notes[0], /clamped/);
});

test('a skill that cannot block never produces a CRITICAL', () => {
  const patch = '+++ b/client/src/app/page.tsx\n@@ -0,0 +1,2 @@\n+export default function Page() {}\n';
  const f = finding({ file: 'client/src/app/page.tsx', line: 1, rule_id: 'x', evidence: 'export default function Page() {}' });
  const v = run({ tasks: [next], outputs: { [next.id]: out(f) }, patches: { [next.id]: patch } });
  assert.equal(v.findings[0].severity, 'WARNING');
  assert.equal(v.verdict, 'pass');
});

test('a finding outside the changed lines is a pre-existing SUGGESTION', () => {
  const v = run({ outputs: { [onion.id]: out(finding({ line: 10 })) } });
  assert.equal(v.verdict, 'pass');
  assert.equal(v.findings[0].severity, 'SUGGESTION');
  assert.match(v.findings[0].notes[0], /pre-existing/);
});

test('a finding whose evidence is not in the diff is dropped', () => {
  const v = run({ outputs: { [onion.id]: out(finding({ evidence: 'db.delete(t.everything)' })) } });
  assert.equal(v.findings.length, 0);
  assert.equal(v.dropped.length, 1);
  assert.equal(v.verdict, 'pass');
});

test('a missing or malformed findings file makes the review incomplete', () => {
  assert.deepEqual(run({ outputs: {} }).reasons, ['incomplete']);
  assert.deepEqual(run({ outputs: { [onion.id]: 'not json' } }).reasons, ['incomplete']);
  const noRule = run({ outputs: { [onion.id]: out(finding({ rule_id: undefined })) } });
  assert.match(noRule.failed_tasks[0].reason, /rule_id/);
  const foreign = run({ outputs: { [onion.id]: out(finding({ file: 'server/src/other.ts' })) } });
  assert.match(foreign.failed_tasks[0].reason, /not one of this task's files/);
});

test('arch-check: a new violation from a changed file is CRITICAL; missing run is incomplete', () => {
  const arch = { ran: true, violations: [{ rule: 'db-only-in-repository', from: 'server/src/modules/pulls/routes.ts', to: 'server/src/db/client.ts' }] };
  const v = run({ outputs: { [onion.id]: out() }, arch, archCheck: true });
  assert.equal(v.verdict, 'blocked');
  assert.equal(v.findings[0].rule_id, 'dep-cruiser/db-only-in-repository');

  const elsewhere = { ran: true, violations: [{ rule: 'no-circular', from: 'server/src/a.ts', to: 'server/src/b.ts' }] };
  assert.equal(run({ outputs: { [onion.id]: out() }, arch: elsewhere, archCheck: true }).findings[0].severity, 'WARNING');

  assert.deepEqual(run({ outputs: { [onion.id]: out() }, archCheck: true }).reasons, ['incomplete']);
});

test('duplicates from two batches collapse into one finding', () => {
  const second = { ...onion, id: 'onion-architecture-2' };
  const v = run({
    tasks: [onion, second],
    outputs: { [onion.id]: out(finding({ severity: 'WARNING' })), [second.id]: out(finding()) },
    patches: { [onion.id]: PATCH, [second.id]: PATCH },
  });
  assert.equal(v.findings.length, 1);
  assert.equal(v.findings[0].severity, 'CRITICAL');
});

test('a waiver matching the CRITICAL turns the verdict into pass', () => {
  const waivers = [{ rule_id: 'db-only-in-repository', file: 'server/src/modules/pulls/routes.ts', line: 41, reason: 'fp', waived_at: 'now' }];
  const v = run({ outputs: { [onion.id]: out(finding()) }, waivers });
  assert.equal(v.verdict, 'pass');
  assert.equal(v.counts.waived, 1);
  assert.equal(v.counts.CRITICAL, 0);
  assert.equal(v.findings[0].waived.reason, 'fp');
});

test('evidence matching ignores diff markers and whitespace', () => {
  const corpus = patchCorpus(PATCH);
  assert.ok(evidenceInPatch('+    const rows = await db.select().from(t.pullRequests);', corpus));
  assert.ok(evidenceInPatch("app.get('/pulls', async () => {\n  const rows = await db.select().from(t.pullRequests);", corpus));
  assert.ok(!evidenceInPatch('', corpus));
});

import { and, asc, eq } from 'drizzle-orm';
import type {
  EvalCaseMeta,
  EvalConfigSnapshot,
  EvalExpectation,
  EvalFoundFinding,
} from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';

/** Appended to the agent's seeded prompt for the older fixture run (the Compare demo). */
const OLDER_PROMPT_SUFFIX = '\n\nFlag every database query inside a loop as a performance problem.';

const MINUTE_MS = 60_000;

const PR_META = {
  pr_number: 482,
  repo: 'acme/payments-api',
  pr_title: 'Add rate limiting to public API endpoints',
  pr_body:
    'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
  pr_author: 'marisa.koch',
  head_sha: 'a1b2c3d4e5f6',
} satisfies Omit<EvalCaseMeta, 'pr_id'>;

const STRIPE_EXPECTATION = {
  kind: 'must_find',
  file: 'src/config.ts',
  start_line: 12,
  end_line: 12,
  title: 'Hardcoded Stripe secret key in commit',
  severity: 'CRITICAL',
  category: 'security',
} satisfies EvalExpectation;

const N_PLUS_ONE_EXPECTATION = {
  kind: 'must_not_flag',
  file: 'src/api/users.ts',
  start_line: 45,
  end_line: 52,
  title: 'N+1 query in user list endpoint',
  severity: 'WARNING',
  category: 'perf',
} satisfies EvalExpectation;

const STRIPE_CASE = 'must-find-stripe-key';
const N_PLUS_ONE_CASE = 'no-n-plus-one-user-list';

const STRIPE_FOUND = {
  file: 'src/config.ts',
  start_line: 12,
  end_line: 12,
  title: 'Hardcoded Stripe secret key in commit',
  severity: 'CRITICAL',
  category: 'security',
  matches: true,
} satisfies EvalFoundFinding;

const LOOP_QUERY_FOUND = {
  file: 'src/api/users.ts',
  start_line: 46,
  end_line: 47,
  title: 'Database query inside a loop',
  severity: 'WARNING',
  category: 'perf',
  matches: true,
} satisfies EvalFoundFinding;

interface SeededResult {
  caseName: string;
  secondsAfterStart: number;
  pass: boolean;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  actualOutput: { findings: EvalFoundFinding[]; dropped: number };
  durationMs: number;
  costUsd: number;
}

interface SeededRun {
  startedAt: string;
  promptSuffix: string;
  recall: number;
  precision: number;
  citationAccuracy: number;
  casesPassed: number;
  costUsd: number;
  results: SeededResult[];
}

const SEEDED_RUNS: SeededRun[] = [
  {
    startedAt: '2026-10-30T10:00:00.000Z',
    promptSuffix: OLDER_PROMPT_SUFFIX,
    recall: 1,
    precision: 0.5,
    citationAccuracy: 0.6667,
    casesPassed: 1,
    costUsd: 0.004,
    results: [
      {
        caseName: STRIPE_CASE,
        secondsAfterStart: 20,
        pass: true,
        recall: 1,
        precision: 1,
        citationAccuracy: 0.5,
        actualOutput: { findings: [STRIPE_FOUND], dropped: 1 },
        durationMs: 4200,
        costUsd: 0.0025,
      },
      {
        caseName: N_PLUS_ONE_CASE,
        secondsAfterStart: 40,
        pass: false,
        recall: null,
        precision: 0,
        citationAccuracy: 1,
        actualOutput: { findings: [LOOP_QUERY_FOUND], dropped: 0 },
        durationMs: 3600,
        costUsd: 0.0015,
      },
    ],
  },
  {
    startedAt: '2026-10-31T10:00:00.000Z',
    promptSuffix: '',
    recall: 1,
    precision: 1,
    citationAccuracy: 1,
    casesPassed: 2,
    costUsd: 0.003,
    results: [
      {
        caseName: STRIPE_CASE,
        secondsAfterStart: 20,
        pass: true,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        actualOutput: { findings: [STRIPE_FOUND], dropped: 0 },
        durationMs: 3300,
        costUsd: 0.0018,
      },
      {
        caseName: N_PLUS_ONE_CASE,
        secondsAfterStart: 40,
        pass: true,
        recall: null,
        precision: null,
        citationAccuracy: null,
        actualOutput: { findings: [], dropped: 0 },
        durationMs: 2900,
        costUsd: 0.0012,
      },
    ],
  },
];

/** `diff --git` / `---` / `+++` and the seeded patch — the stored shape of a case fragment. */
function fragment(file: string, patch: string): string {
  return [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, patch].join('\n');
}

/**
 * L06 eval fixture for the seeded "Security Reviewer": two cases from PR #482 and two finished
 * runs (the Compare demo). Idempotent and never overwriting: a case is inserted only when the
 * agent has none of that name, the runs only when the agent has no run at all.
 */
export async function seedEvalFixture(
  db: Db,
  input: { workspaceId: string; prId: string; patches: Record<string, string> },
): Promise<void> {
  const { workspaceId, prId, patches } = input;

  const [agent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  if (!agent) return;

  const meta = { pr_id: prId, ...PR_META } satisfies EvalCaseMeta;
  const seededCases = [
    { name: STRIPE_CASE, expected: STRIPE_EXPECTATION },
    { name: N_PLUS_ONE_CASE, expected: N_PLUS_ONE_EXPECTATION },
  ];

  const caseIds = new Map<string, string>();
  for (const c of seededCases) {
    const [existing] = await db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agent.id),
          eq(t.evalCases.name, c.name),
        ),
      );
    if (existing) {
      caseIds.set(c.name, existing.id);
      continue;
    }
    const patch = patches[c.expected.file];
    if (patch === undefined) continue;
    const [created] = await db
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agent.id,
        name: c.name,
        inputDiff: fragment(c.expected.file, patch),
        inputFiles: [c.expected.file],
        inputMeta: meta,
        expectedOutput: c.expected,
        sourceFindingId: null,
      })
      .returning({ id: t.evalCases.id });
    caseIds.set(c.name, created!.id);
  }

  const [anyRun] = await db
    .select({ id: t.evalSuiteRuns.id })
    .from(t.evalSuiteRuns)
    .where(eq(t.evalSuiteRuns.agentId, agent.id))
    .limit(1);
  if (anyRun) return;

  const skills = await db
    .select({ name: t.skills.name, version: t.skills.version })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
    .where(and(eq(t.agentSkills.agentId, agent.id), eq(t.skills.enabled, true)))
    .orderBy(asc(t.agentSkills.order));

  await db.transaction(async (tx) => {
    for (const run of SEEDED_RUNS) {
      const startedAt = new Date(run.startedAt);
      const config = {
        agent_version: agent.version,
        system_prompt: agent.systemPrompt + run.promptSuffix,
        provider: agent.provider,
        model: agent.model,
        strategy: agent.strategy,
        skills,
      } satisfies EvalConfigSnapshot;
      const [suiteRun] = await tx
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId,
          agentId: agent.id,
          agentVersion: config.agent_version,
          systemPrompt: config.system_prompt,
          provider: config.provider,
          model: config.model,
          strategy: config.strategy,
          skills: config.skills,
          status: 'done',
          recall: run.recall,
          precision: run.precision,
          citationAccuracy: run.citationAccuracy,
          casesTotal: run.results.length,
          casesDone: run.results.length,
          casesPassed: run.casesPassed,
          casesErrored: 0,
          costUsd: run.costUsd,
          startedAt,
          finishedAt: new Date(startedAt.getTime() + MINUTE_MS),
          error: null,
        })
        .returning({ id: t.evalSuiteRuns.id });

      for (const r of run.results) {
        const caseId = caseIds.get(r.caseName);
        if (!caseId) continue;
        await tx.insert(t.evalRuns).values({
          caseId,
          suiteRunId: suiteRun!.id,
          ranAt: new Date(startedAt.getTime() + r.secondsAfterStart * 1000),
          actualOutput: r.actualOutput,
          pass: r.pass,
          recall: r.recall,
          precision: r.precision,
          citationAccuracy: r.citationAccuracy,
          durationMs: r.durationMs,
          costUsd: r.costUsd,
          error: null,
        });
      }
    }
  });
}

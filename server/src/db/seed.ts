import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import { parseSkillMarkdown } from '../modules/skills/import/parse.js';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/** L02 reviewer skills: `docs/skills/<folder>/<skill>/SKILL.md`, linked to `agent` in this order. */
const SKILLS_DIR = new URL('../../../docs/skills/', import.meta.url);
const SEED_SKILLS = [
  { agent: 'Test Quality Reviewer', folder: 'test-quality', skills: ['branch-coverage', 'edge-cases'] },
  {
    agent: 'API Contract Reviewer',
    folder: 'api-contract',
    skills: ['breaking-change', 'response-schema', 'semver-discipline', 'deprecation-policy'],
  },
];

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * L02 adds the Test Quality and API Contract Reviewer agents, their six skills
 * from docs/skills/ (linked in order), and three pending convention candidates
 * for the demo repo (fixtures for the e2e flow). Other lesson tables (memory,
 * eval, …) start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a completed run backing the sample review, so the PR list FINDINGS column,
    // its hover popover, and the Agent-runs Timeline all have something to show
    // before the first real review (agent_runs, not just reviews/findings).
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        prId: pr!.id,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        status: 'done',
        durationMs: 4200,
        tokensIn: 9119,
        tokensOut: 1240,
        findingsCount: 2,
        findingsBySeverity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
        grounding: '2/2 passed',
        score: 61,
        blockers: 1,
      })
      .returning();

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        runId: run!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- PR #482's derived intent (L03) ----
  // Its own idempotent insert OUTSIDE the `if (!pr)` block above: that block never runs again on
  // an already-seeded dev database, so a row added inside it would never reach one. The card
  // renders from this row with no model call; a review run recomputes it (null `source_hash`).
  // The strings are the fixtures flow `10-pr-intent` asserts on (`e2e/specs/seed-fixtures.md`).
  await db
    .insert(t.prIntent)
    .values({
      prId: pr!.id,
      intent: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      inScope: [
        'Token-bucket rate limiter middleware',
        'Return 429 with Retry-After header',
        'Apply the limiter to the public webhook routes',
      ],
      outOfScope: [
        'Per-plan or per-user limits',
        'Changes to authentication',
        'An admin dashboard for limits',
      ],
      riskAreas: [
        { kind: 'security', label: 'Auth surface touched' },
        { kind: 'api', label: 'Public webhook behaviour changes' },
        { kind: 'performance', label: 'Runs on every public request' },
      ],
      confidence: 'medium',
      sources: [
        { kind: 'title', ref: null, status: 'used', reason: null },
        { kind: 'description', ref: null, status: 'used', reason: null },
        { kind: 'changed_files', ref: null, status: 'used', reason: null },
      ],
      missingContext: false,
      injectionSuspected: false,
      sourceHash: null,
      model: 'seed',
    })
    .onConflictDoNothing();

  // ---- built-in agents (the three starter presets + L02's Test Quality and API Contract Reviewers) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Checks that tests exercise the change: branches, corner cases, mocking, flakiness.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Finds changes to routes and response shapes that break API consumers.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- L02 Skills: the reviewer skills from docs/skills, linked to their agents ----
  // A skill is inserted only when no skill of that name exists, and an agent is
  // linked only while it has no skills, so a re-seed never undoes the user's edits.
  for (const group of SEED_SKILLS) {
    const [agent] = await db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, group.agent)));
    if (!agent) continue;
    const skillIds: string[] = [];
    for (const file of group.skills) {
      const text = readFileSync(new URL(`${group.folder}/${file}/SKILL.md`, SKILLS_DIR), 'utf8');
      const parsed = parseSkillMarkdown(text, file);
      let [skill] = await db
        .select({ id: t.skills.id })
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, parsed.name)));
      if (!skill) {
        [skill] = await db
          .insert(t.skills)
          .values({
            workspaceId,
            name: parsed.name,
            description: parsed.description,
            type: parsed.type,
            source: 'imported_file',
            body: parsed.body,
          })
          .returning({ id: t.skills.id });
        await db.insert(t.skillVersions).values({ skillId: skill!.id, version: 1, body: parsed.body, note: null });
      }
      skillIds.push(skill!.id);
    }
    const [anyLink] = await db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agent.id))
      .limit(1);
    if (!anyLink) {
      await db.insert(t.agentSkills).values(skillIds.map((skillId, order) => ({ agentId: agent.id, skillId, order })));
    }
  }

  // ---- L02 Conventions: three pending candidates for the demo repo ----
  // Fixture data for the e2e flow, which may not call a model. Inserted only
  // while the repo has none, so a re-seed never undoes the user's decisions.
  const [anyConvention] = await db
    .select({ id: t.conventions.id })
    .from(t.conventions)
    .where(eq(t.conventions.repoId, repoId))
    .limit(1);
  if (!anyConvention) {
    const candidate = (
      category: (typeof t.conventions.$inferInsert)['category'],
      rule: string,
      evidencePath: string,
      line: number,
      evidenceSnippet: string,
      confidence: number,
    ) => ({
      workspaceId,
      repoId,
      category,
      rule,
      evidencePath,
      evidenceLineStart: line,
      evidenceLineEnd: line,
      evidenceSnippet,
      confidence,
    });
    await db.insert(t.conventions).values([
      candidate(
        'error-handling',
        'Reject over-limit requests with a 429 and a Retry-After header.',
        'src/middleware/ratelimit.ts',
        18,
        "reply.header('Retry-After', retryAfter).code(429).send({ error: 'rate_limited' });",
        0.91,
      ),
      candidate(
        'structure',
        'Read configuration through src/config.ts, never process.env in handlers.',
        'src/config.ts',
        12,
        'export const config = loadConfig(process.env);',
        0.78,
      ),
      candidate(
        'naming',
        'Name public route modules after the resource they serve.',
        'src/api/public/webhooks.ts',
        3,
        "export async function webhooksRoutes(app: FastifyInstance) {",
        0.55,
      ),
    ]);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}

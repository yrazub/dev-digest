import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { EvalSkillRef } from '@devdigest/shared';
import { agents } from './agents';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    // No FK: the owner is a skill or an agent. The agent delete removes its cases (R-SRV-35).
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    // One case per finding (R-SRV-11).
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq')
      .on(t.sourceFindingId)
      .where(sql`${t.sourceFindingId} is not null`),
  }),
);

/** One row per eval run of an agent: the configuration snapshot, the status and the aggregates. */
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    provider: text('provider', { enum: ['openai', 'anthropic', 'openrouter'] }).notNull(),
    model: text('model').notNull(),
    strategy: text('strategy', { enum: ['single-pass', 'map-reduce', 'auto'] }).notNull(),
    skills: jsonb('skills').$type<EvalSkillRef[]>().notNull(),
    status: text('status', { enum: ['running', 'done', 'failed'] }).notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    casesTotal: integer('cases_total').notNull(),
    casesDone: integer('cases_done').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    agentStartedIdx: index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt.desc()),
    // At most one running run per agent, even under concurrent requests (R-SRV-27).
    oneRunningUq: uniqueIndex('eval_suite_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    suiteRunId: uuid('suite_run_id')
      .notNull()
      .references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
  },
  (t) => ({
    // Every cascade delete and per-suite read goes through this FK.
    suiteRunIdx: index('eval_runs_suite_run_idx').on(t.suiteRunId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});

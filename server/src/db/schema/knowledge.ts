import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, integer, vector, index, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    // Mirrors `ConventionCategory` in @devdigest/shared.
    category: text('category', {
      enum: ['naming', 'structure', 'imports', 'error-handling', 'typing', 'testing', 'formatting', 'api', 'other'],
    }).notNull(),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path').notNull(),
    evidenceLineStart: integer('evidence_line_start').notNull(),
    evidenceLineEnd: integer('evidence_line_end').notNull(),
    evidenceSnippet: text('evidence_snippet').notNull(),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
  },
  (t) => ({
    repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status),
    evidenceRange: check(
      'conventions_evidence_range',
      sql`${t.evidenceLineStart} > 0 AND ${t.evidenceLineEnd} >= ${t.evidenceLineStart}`,
    ),
  }),
);

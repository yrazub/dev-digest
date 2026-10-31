import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const pullRequests = pgTable('pull_requests', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  state: text('state').notNull(),
  mergedAt: timestamp('merged_at'),
});

export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(),
  pullId: text('pull_id').notNull(),
  severityCounts: jsonb('severity_counts').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  pullId: text('pull_id').notNull(),
  status: text('status').notNull(),
  summary: jsonb('summary'),
  finishedAt: timestamp('finished_at'),
});

export const findings = pgTable('findings', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  file: text('file').notNull(),
  line: integer('line').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
});

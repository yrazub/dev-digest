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

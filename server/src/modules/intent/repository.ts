import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { FeatureModelChoice, IntentConfidence, IntentRiskArea, IntentSource, Provider } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  IntentPullContext,
  IntentReadOptions,
  IntentStore,
  IntentValues,
  StoredIntent,
} from './ports.js';

/**
 * L03 — intent data-access. Owns `pr_intent`; reads `pull_requests`, `repos` and
 * `pr_files` for the classifier's input and the `feature_models` key of `settings`
 * for the model choice. Workspace-scoped through the PR. It does not read `pr_commits`:
 * commit messages are not classifier input.
 *
 * The contract field `summary` is stored in the `intent` column (the column keeps its name).
 *
 * `in_scope`, `out_of_scope`, `risk_areas`, `sources` and `confidence` hold contract shapes
 * the database does not enforce, so the mapper parses them on read. A row that fails is not
 * returned: `getIntent` reports the failed column names and resolves `undefined`. Nothing is
 * parsed on write — the values already passed `IntentClassification` and the clamp.
 */

type IntentRow = typeof t.prIntent.$inferSelect;

const StringList = z.array(z.string());
const RiskAreaList = z.array(IntentRiskArea);
const SourceList = z.array(IntentSource);

/** The stored row, or the snake_case names of the contract-shaped columns that failed their parse. */
function mapRow(row: IntentRow): { stored: StoredIntent } | { columns: string[] } {
  const inScope = StringList.safeParse(row.inScope);
  const outOfScope = StringList.safeParse(row.outOfScope);
  const riskAreas = RiskAreaList.safeParse(row.riskAreas);
  const sources = SourceList.safeParse(row.sources);
  const confidence = IntentConfidence.safeParse(row.confidence);
  if (!inScope.success || !outOfScope.success || !riskAreas.success || !sources.success || !confidence.success) {
    const columns = [
      ...(inScope.success ? [] : ['in_scope']),
      ...(outOfScope.success ? [] : ['out_of_scope']),
      ...(riskAreas.success ? [] : ['risk_areas']),
      ...(sources.success ? [] : ['sources']),
      ...(confidence.success ? [] : ['confidence']),
    ];
    return { columns };
  }
  return {
    stored: {
      prId: row.prId,
      summary: row.intent,
      inScope: inScope.data,
      outOfScope: outOfScope.data,
      riskAreas: riskAreas.data,
      confidence: confidence.data,
      sources: sources.data,
      missingContext: row.missingContext,
      injectionSuspected: row.injectionSuspected,
      sourceHash: row.sourceHash,
      provider: Provider.safeParse(row.provider).data ?? null,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      computedAt: row.computedAt,
    },
  };
}

function valuesToColumns(values: IntentValues) {
  return {
    intent: values.summary,
    inScope: values.inScope,
    outOfScope: values.outOfScope,
    riskAreas: values.riskAreas,
    confidence: values.confidence,
    sources: values.sources,
    missingContext: values.missingContext,
    injectionSuspected: values.injectionSuspected,
    sourceHash: values.sourceHash,
    provider: values.provider,
    model: values.model,
    tokensIn: values.tokensIn,
    tokensOut: values.tokensOut,
    costUsd: values.costUsd,
    computedAt: new Date(),
  };
}

export class IntentRepository implements IntentStore {
  constructor(private readonly db: Db) {}

  async getPullContext(
    workspaceId: string,
    prId: string,
    opts: { includeFiles?: boolean } = {},
  ): Promise<IntentPullContext | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        branch: t.pullRequests.branch,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;

    const files = opts.includeFiles
      ? await this.db
          .select({
            path: t.prFiles.path,
            additions: t.prFiles.additions,
            deletions: t.prFiles.deletions,
            patch: t.prFiles.patch,
          })
          .from(t.prFiles)
          .where(eq(t.prFiles.prId, prId))
          .orderBy(asc(t.prFiles.path))
      : [];

    return {
      pull: {
        id: row.id,
        number: row.number,
        title: row.title,
        body: row.body,
        branch: row.branch,
        base: row.base,
        headSha: row.headSha,
      },
      repo: { owner: row.owner, name: row.name },
      files,
    };
  }

  async getIntent(prId: string, opts: IntentReadOptions = {}): Promise<StoredIntent | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return undefined;
    const mapped = mapRow(row);
    if ('columns' in mapped) {
      opts.onUnreadable?.({ prId, columns: mapped.columns });
      return undefined;
    }
    return mapped.stored;
  }

  async upsertIntent(prId: string, values: IntentValues): Promise<StoredIntent> {
    const columns = valuesToColumns(values);
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...columns })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: columns })
      .returning({ computedAt: t.prIntent.computedAt });
    return { prId, ...values, computedAt: row!.computedAt };
  }

  async featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')))
      // A workspace can hold one row per user for this key; without an order "the last row"
      // would depend on the plan Postgres picks.
      .orderBy(asc(t.settings.id));
    const value = z.record(z.string(), z.unknown()).safeParse(rows.at(-1)?.value);
    const parsed = FeatureModelChoice.safeParse(value.data?.review_intent);
    return parsed.success ? parsed.data : undefined;
  }
}

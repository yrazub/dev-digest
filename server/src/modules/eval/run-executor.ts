import type { EvalCaseRecord, EvalConfigSnapshot, LLMProvider, UnifiedDiff } from '@devdigest/shared';
import { renderSkillBlocks, taskLine } from '../_shared/review-prompt.js';
import { RUN_CONCURRENCY } from './constants.js';
import { aggregateRun, scoreCase } from './domain.js';
import type { EvalExecutorStore, EvalLog, EvalResultRow, ReviewEngine } from './ports.js';

/** Everything a run needs, read once when it starts (R-SRV-16). */
export interface EvalRunJob {
  runId: string;
  agentId: string;
  snapshot: EvalConfigSnapshot;
  skills: { name: string; version: number; body: string }[];
  cases: EvalCaseRecord[];
  llm: LLMProvider;
}

/**
 * The background half of an eval run: reviews each case through the engine, three at a time, with
 * the stored snapshot; scores and stores each result; aggregates from the stored rows and ends the
 * run. It touches no review, finding, agent-run row or run bus (R-SRV-26).
 */
export class EvalRunExecutor {
  constructor(
    private readonly deps: {
      store: EvalExecutorStore;
      review: ReviewEngine;
      parseDiff: (raw: string) => UnifiedDiff;
      concurrency?: number;
    },
  ) {}

  /** Never rejects: any failure ends the run `failed`, so no run stays `running` while the process lives. */
  async run(job: EvalRunJob, log: EvalLog): Promise<void> {
    const startedAt = Date.now();
    log.info({ runId: job.runId, agentId: job.agentId, cases: job.cases.length }, 'eval run started');

    let end: End = { status: 'failed', summary: EMPTY_SUMMARY };
    try {
      end = (await this.execute(job)) ?? { status: 'gone', summary: EMPTY_SUMMARY };
    } catch (err) {
      try {
        await this.deps.store.finishRun(job.runId, { failed: messageOf(err) });
      } catch {
        /* the run row cannot be updated; nothing left to do */
      }
    }
    log.info(
      { runId: job.runId, status: end.status, ...end.summary, durationMs: Date.now() - startedAt },
      'eval run finished',
    );
  }

  /** Review every case, then end the run. `undefined` when the run row vanished. */
  private async execute(job: EvalRunJob): Promise<End | undefined> {
    const { store } = this.deps;
    let stopped = false;
    let next = 0;

    const worker = async (): Promise<void> => {
      while (!stopped) {
        const c = job.cases[next++];
        if (!c) return;
        try {
          const stored = await store.storeResult(job.runId, await this.reviewCase(job, c));
          if (stored === 'run_gone') stopped = true;
        } catch (err) {
          stopped = true;
          throw err;
        }
      }
    };
    const width = Math.min(this.deps.concurrency ?? RUN_CONCURRENCY, job.cases.length);
    await Promise.all(Array.from({ length: width }, worker));
    if (stopped) return undefined;

    const rows = await store.resultsOf(job.runId);
    const aggregate = aggregateRun(rows);
    const summary: Summary = {
      passed: aggregate.cases_passed,
      errored: aggregate.cases_errored,
      recall: aggregate.recall,
      precision: aggregate.precision,
      citation: aggregate.citation_accuracy,
      costUsd: aggregate.cost_usd,
    };
    const firstError = rows.find((r) => r.error !== null)?.error;
    if (rows.length > 0 && aggregate.cases_errored === rows.length && firstError != null) {
      await store.finishRun(job.runId, {
        failed: `All ${rows.length} cases failed: ${firstError}`,
        cases_errored: rows.length,
      });
      return { status: 'failed', summary };
    }
    await store.finishRun(job.runId, aggregate);
    return { status: 'done', summary };
  }

  /** One engine call for one case; a throw becomes that case's errored row (R-SRV-31). */
  private async reviewCase(job: EvalRunJob, c: EvalCaseRecord): Promise<EvalResultRow> {
    const began = Date.now();
    try {
      const meta = c.input_meta;
      const outcome = await this.deps.review({
        systemPrompt: job.snapshot.system_prompt,
        model: job.snapshot.model,
        strategy: job.snapshot.strategy,
        skills: renderSkillBlocks(job.skills),
        diff: this.deps.parseDiff(c.input_diff),
        prDescription: meta.pr_body ?? undefined,
        task: taskLine({ number: meta.pr_number, title: meta.pr_title, author: meta.pr_author }),
        llm: job.llm,
      });
      const score = scoreCase(c.expected_output, outcome.review.findings, outcome.dropped.length);
      return {
        caseId: c.id,
        pass: score.pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        actualOutput: score.actual_output,
        durationMs: Date.now() - began,
        costUsd: outcome.costUsd,
        error: null,
      };
    } catch (err) {
      return {
        caseId: c.id,
        pass: null,
        recall: null,
        precision: null,
        citationAccuracy: null,
        actualOutput: null,
        durationMs: Date.now() - began,
        costUsd: null,
        error: messageOf(err),
      };
    }
  }
}

/** How a run ended; `gone` when its row was deleted mid-run (the agent was deleted). */
interface End {
  status: 'done' | 'failed' | 'gone';
  summary: Summary;
}

interface Summary {
  passed: number;
  errored: number;
  recall: number | null;
  precision: number | null;
  citation: number | null;
  costUsd: number | null;
}

const EMPTY_SUMMARY: Summary = { passed: 0, errored: 0, recall: null, precision: null, citation: null, costUsd: null };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

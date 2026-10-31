import type { Finding, LLMProvider } from '@devdigest/shared';
import { runReview } from '@devdigest/reviewer-core';
import type { RunRepository } from './repository.js';

export class RunService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly runs: RunRepository,
  ) {}

  async execute(runId: string, diff: string, model: string): Promise<Finding[]> {
    const findings = await runReview({ diff, model }, this.llm);
    await this.runs.saveFindings(runId, findings);
    await this.runs.markDone(runId, { count: findings.length });
    return findings;
  }
}

import type { LLMProvider } from '@devdigest/shared';
import { runReview } from '@devdigest/reviewer-core';

const DEFAULT_MODEL = 'model-small';

export class ReviewsService {
  constructor(private readonly llm: LLMProvider) {}

  async reviewDiff(diff: string) {
    return runReview({ diff, model: DEFAULT_MODEL }, this.llm);
  }
}

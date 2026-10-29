import type { Finding, LLMProvider } from '@devdigest/shared';

export interface ReviewInput {
  diff: string;
  model: string;
}

export async function runReview(input: ReviewInput, llm: LLMProvider) {
  const prompt = `Review this diff and answer with a JSON array of findings:\n${input.diff}`;
  const raw = await llm.complete(input.model, prompt);
  return JSON.parse(raw) as Finding[];
}

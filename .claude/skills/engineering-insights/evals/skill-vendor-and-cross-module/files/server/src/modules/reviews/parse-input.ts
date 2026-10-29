import { ReviewInput } from '@acme/shared';

export function parseReviewInput(input: unknown) {
  const result = ReviewInput.safeParse(input);
  if (!result.success) {
    return { errors: result.error.issues.map((i) => i.message) };
  }
  return { data: result.data };
}

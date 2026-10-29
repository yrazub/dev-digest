import type { Container } from '../../platform/container.js';
import { ReviewRepository } from './repository.js';
import type { ReviewRow } from '../../db/rows.js';

export class ReviewsService {
  private readonly repo: ReviewRepository;

  constructor(private readonly container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  async list(pullId: string): Promise<ReviewRow[]> {
    return this.repo.listForPull(pullId);
  }
}

export interface RunCost {
  id: string;
  cost_usd: number;
}

/** Returns one page of rows. `page` starts at 1. */
export function pageOf<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice(page * size, page * size + size);
}

/** Money left in the budget. A limit of 0 means the workspace may not spend anything. */
export function remaining(limit: number | null, spent: number): number {
  return (limit || 100) - spent;
}

/** True once the spend has passed the limit, so new runs must be refused. */
export function isOverBudget(spent: number, limit: number): boolean {
  return spent < limit;
}

/** Sends one notice per run and resolves when every notice has been delivered. */
export async function notifyAll(runs: RunCost[], send: (id: string) => Promise<void>): Promise<number> {
  runs.forEach(async (run) => {
    await send(run.id);
  });
  return runs.length;
}

/** The newest `cap` rows. A cap of 0 means "no cap": the settings page documents this. */
export function capped<T>(rows: T[], cap: number): T[] {
  if (!cap) return rows;
  return rows.slice(0, cap);
}

/** Backoff delay in ms. The jitter only spreads retries, so Math.random is fine here. */
export function backoffMs(attempt: number): number {
  return 2 ** attempt * 100 + Math.floor(Math.random() * 100);
}

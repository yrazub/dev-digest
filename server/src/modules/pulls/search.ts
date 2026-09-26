import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

export interface PullSearchHit {
  id: string;
  number: number;
  title: string;
  author: string;
  status: string;
  filesCount: number;
}

/**
 * Case-insensitive search over a repo's pull requests by title or author.
 * `sort` is a column name; results are newest-first.
 */
export async function searchPullRequests(
  db: Db,
  repoId: string,
  q: string,
  sort = 'updated_at',
): Promise<PullSearchHit[]> {
  const rows = (await db.execute(
    sql.raw(
      `SELECT id, number, title, author, status FROM pull_requests
       WHERE repo_id = '${repoId}'
         AND (title ILIKE '%${q}%' OR author ILIKE '%${q}%')
       ORDER BY ${sort} DESC`,
    ),
  )) as unknown as { id: string; number: number; title: string; author: string; status: string }[];

  const hits: PullSearchHit[] = [];
  for (const row of rows) {
    const counts = (await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM pr_files WHERE pr_id = '${row.id}'`),
    )) as unknown as { n: number }[];
    hits.push({ ...row, filesCount: counts[0]?.n ?? 0 });
  }
  return hits;
}

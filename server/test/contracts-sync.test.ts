import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `@devdigest/shared` is authored in `server/src/vendor/shared`; the client keeps a copy.
 * R-SRV-22: the two brief contract files stay byte-identical, so the client types against
 * the same shapes the server validates with. Only these two files are synced.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SHARED = path.resolve(HERE, '../src/vendor/shared/contracts');
const CLIENT_SHARED = path.resolve(HERE, '../../client/src/vendor/shared/contracts');

describe('client copy of the brief contracts', () => {
  it.each(['brief.ts', 'review-api.ts'])('%s is byte-identical to the server file', async (file) => {
    const [server, client] = await Promise.all([
      readFile(path.join(SERVER_SHARED, file)),
      readFile(path.join(CLIENT_SHARED, file)),
    ]);
    expect(server.length).toBeGreaterThan(0);
    expect(client.equals(server)).toBe(true);
  });
});

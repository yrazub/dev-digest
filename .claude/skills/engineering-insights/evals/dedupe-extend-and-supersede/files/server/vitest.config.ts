import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export default defineConfig({
  test: {
    // *.it.test.ts needs a real Postgres (testcontainers)
    exclude: dockerAvailable() ? [] : ['**/*.it.test.ts'],
  },
});

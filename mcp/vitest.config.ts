import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // An array, so `zod` is matched as the exact specifier. Both entries keep the shared
    // contracts and this package on one Zod instance (see tsconfig paths, src/single-zod.ts).
    alias: [
      {
        find: '@devdigest/shared',
        replacement: path.resolve(__dirname, '../server/src/vendor/shared'),
      },
      { find: /^zod$/, replacement: path.resolve(__dirname, 'node_modules/zod/index.js') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
  },
});

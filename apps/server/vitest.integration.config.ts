import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000, // container startup
    // Integration tests share a container; run them serially.
    fileParallelism: false,
  },
});

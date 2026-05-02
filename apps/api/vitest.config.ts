import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // serializa para no pisar la BD
  },
});

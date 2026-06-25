import { defineConfig } from 'vitest/config';

/**
 * Integration test config. Run dengan `pnpm test:int`.
 *
 * Prasyarat:
 *   - Postgres running (`pnpm docker:up`)
 *   - DATABASE_URL + APP_DATABASE_URL ke DB test terpisah
 *     (default: lentera_test — bikin via psql kalau belum ada)
 *   - Migrasi & seed sudah diterapkan ke DB test
 *
 * Run serial (`pool: 'forks'`, `singleThread: true`) supaya tes tidak saling
 * mengkontaminasi state DB.
 */
export default defineConfig({
  test: {
    include: ['apps/api/test/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    forks: { singleFork: true },
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['apps/api/test/setup.ts'],
  },
});

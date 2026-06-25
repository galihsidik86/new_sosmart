import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — dipakai untuk run semua test di monorepo.
 *
 * Layer test:
 *   1. UNIT (default `pnpm test`):
 *      - Pure functions tanpa DB (money helpers, TER table, validators).
 *      - File: `**\/__tests__\/*.test.ts`
 *      - Cepat, tidak butuh Postgres.
 *
 *   2. INTEGRATION (`pnpm test:int`):
 *      - Hit Postgres asli + RLS. Test GL invariants, period guard, RLS isolation,
 *        FIFO HPP, dll.
 *      - File: `apps/api/test/**\/*.spec.ts`
 *      - Butuh `docker compose up` + `TEST_DATABASE_URL` env.
 */
export default defineConfig({
  test: {
    include: [
      'packages/**/__tests__/*.test.ts',
      'apps/**/__tests__/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    pool: 'threads',
    testTimeout: 10_000,
  },
});

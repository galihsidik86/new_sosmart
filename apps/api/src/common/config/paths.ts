import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Root direktori `apps/api` — dihitung dari lokasi modul ini (bukan
 * `process.cwd()`). `process.cwd()` tidak konsisten antar cara start proses
 * (`pnpm --filter @lentera/api dev` vs `pnpm dev` di root vs `node dist/main.js`
 * langsung) — di beberapa kombinasi tsc-watch/pnpm di Windows, cwd resolve ke
 * root monorepo, bukan `apps/api`, sehingga file (mis. `uploads/`) salah tempat.
 * File ini di `src/common/config/paths.ts` → compiled ke `dist/common/config/paths.js`
 * → naik 3 level dari situ balik ke `apps/api`.
 */
export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

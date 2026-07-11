/**
 * Resolusi id referensi (akun/cabang/customer/vendor) **by kode** saat runtime.
 *
 * Seed memakai UUID acak tiap kali di-seed ulang, jadi meng-hardcode UUID di
 * spec bikin test rapuh — sekali re-seed, semua id berubah. Helper ini melakukan
 * lookup via list-endpoint API (yang mengembalikan array `{ id, kode }`) lalu
 * memetakan kode → id, sehingga spec cukup menyebut kode COA/cabang/mitra yang
 * stabil (mis. '6-104', 'SMG', 'PLG-001', 'VEN-003').
 */
import type { APIRequestContext } from '@playwright/test';

type AuthHeaders = Record<string, string>;

async function mapByKode(
  ctx: APIRequestContext,
  path: string,
  auth: AuthHeaders,
): Promise<Map<string, string>> {
  const res = await ctx.get(path, { headers: auth });
  if (!res.ok()) {
    throw new Error(`Lookup ${path} gagal: ${res.status()} ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{ id: string; kode: string }>;
  return new Map(rows.map((r) => [r.kode, r.id]));
}

export interface Refs {
  account: (kode: string) => string;
  cabang: (kode: string) => string;
  customer: (kode: string) => string;
  vendor: (kode: string) => string;
}

/**
 * Ambil semua map referensi sekali jalan. Panggil di `test.beforeAll` (untuk
 * file multi-test) atau langsung di dalam test (untuk file satu test), setelah
 * punya `auth` headers hasil login.
 */
export async function loadRefs(
  ctx: APIRequestContext,
  auth: AuthHeaders,
): Promise<Refs> {
  const [accounts, cabang, customers, vendors] = await Promise.all([
    mapByKode(ctx, '/api/v1/accounts', auth),
    mapByKode(ctx, '/api/v1/cabang', auth),
    mapByKode(ctx, '/api/v1/customers', auth),
    mapByKode(ctx, '/api/v1/vendors', auth),
  ]);
  const pick =
    (m: Map<string, string>, label: string) =>
    (kode: string): string => {
      const id = m.get(kode);
      if (!id) {
        throw new Error(
          `${label} dengan kode "${kode}" tidak ada di seed — cek packages/db/prisma/seed.ts`,
        );
      }
      return id;
    };
  return {
    account: pick(accounts, 'Akun'),
    cabang: pick(cabang, 'Cabang'),
    customer: pick(customers, 'Pelanggan'),
    vendor: pick(vendors, 'Vendor'),
  };
}

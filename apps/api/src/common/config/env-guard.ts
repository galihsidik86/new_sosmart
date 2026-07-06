import { Logger } from '@nestjs/common';

/**
 * Validasi environment kritikal SEBELUM aplikasi menerima request.
 *
 * MASALAH yang dicegah: kode lama pakai fallback hardcoded
 * `?? 'dev-access'` untuk JWT secret. Kalau di produksi env var lupa
 * di-set, seluruh token ditandatangani dengan secret yang diketahui
 * publik (ada di source) — siapa pun bisa memalsukan token admin.
 * Guard ini menolak boot kalau secret hilang / lemah di NODE_ENV=production.
 */

const MIN_SECRET_LEN = 32;

export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const isProd = env.NODE_ENV === 'production';
  const problems: string[] = [];

  const secrets: Array<[string, string | undefined]> = [
    ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ];

  for (const [name, val] of secrets) {
    if (!val) {
      problems.push(`${name} belum di-set`);
    } else if (isProd && val.length < MIN_SECRET_LEN) {
      problems.push(`${name} terlalu pendek (< ${MIN_SECRET_LEN} karakter)`);
    } else if (isProd && /ganti-di-produksi|dev-access|dev-refresh|change_me/i.test(val)) {
      problems.push(`${name} masih memakai nilai contoh — WAJIB diganti di produksi`);
    }
  }

  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET tidak boleh sama');
  }

  if (isProd && !env.APP_DATABASE_URL) {
    // Runtime WAJIB pakai koneksi non-superuser supaya RLS aktif; fallback ke
    // DATABASE_URL (superuser) diam-diam mematikan seluruh isolasi tenant.
    problems.push('APP_DATABASE_URL belum di-set — RLS tidak akan aktif (bahaya multi-tenant)');
  }

  if (problems.length === 0) return;

  const msg = 'Konfigurasi environment tidak aman:\n  - ' + problems.join('\n  - ');
  if (isProd) {
    Logger.error(msg, 'EnvGuard');
    // Jangan pernah boot produksi dengan kredensial tidak aman.
    process.exit(1);
  }
  Logger.warn(msg + '\n(dev mode — dilanjutkan, tapi JANGAN dipakai di produksi)', 'EnvGuard');
}

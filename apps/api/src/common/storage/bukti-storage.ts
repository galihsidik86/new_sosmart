import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { API_ROOT } from '../config/paths.js';

/**
 * Direktori PRIVAT untuk bukti transaksi — SENGAJA di luar `uploads/` (yang
 * disajikan publik oleh fastifyStatic). File hanya bisa diakses lewat endpoint
 * API ber-otentikasi (`GET /uploads/bukti/:filename`), di-scope per-tenant.
 */
const BUKTI_ROOT = path.join(API_ROOT, 'storage', 'bukti');

/** Nama file aman? (uuid.ext) — tolak separator/`..` (anti path traversal). */
function isSafeName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes('..');
}

/**
 * Simpan buffer bukti ke direktori privat per-tenant, return URL LEWAT PROXY
 * web (`/proxy/uploads/bukti/<uuid><ext>`) — bukan static publik. Nama file
 * di-randomize (UUID).
 */
export async function saveBukti(tenantId: string, buffer: Buffer, ext: string): Promise<string> {
  const dir = path.join(BUKTI_ROOT, tenantId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `/proxy/uploads/bukti/${filename}`;
}

/**
 * Baca file bukti milik tenant. Return null kalau nama tidak aman atau file
 * tidak ada — pemanggil memutuskan 404. Isolasi tenant: file selalu dicari di
 * direktori tenant aktif, `filename` dari URL tak pernah menentukan tenant.
 */
export async function readBukti(tenantId: string, filename: string): Promise<Buffer | null> {
  if (!isSafeName(filename)) return null;
  try {
    return await readFile(path.join(BUKTI_ROOT, tenantId, filename));
  } catch {
    return null;
  }
}

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_ROOT } from '../config/paths.js';

const LOGO_DIR = path.join(API_ROOT, 'uploads', 'logos');

/** Simpan buffer logo ke disk, return path publik (`/uploads/logos/<file>`). */
export async function saveLogo(tenantId: string, buffer: Buffer, ext: string): Promise<string> {
  await mkdir(LOGO_DIR, { recursive: true });
  const filename = `${tenantId}-${Date.now()}${ext}`;
  await writeFile(path.join(LOGO_DIR, filename), buffer);
  return `/uploads/logos/${filename}`;
}

/**
 * Hapus file logo lama, best-effort — dipanggil SETELAH DB commit sukses
 * ganti `logoUrl`, supaya kalau update gagal, file lama masih valid.
 */
export async function deleteLogoFile(logoUrl: string | null | undefined): Promise<void> {
  if (!logoUrl) return;
  const filename = path.basename(logoUrl);
  // Guard: hanya hapus file yang benar-benar ada di LOGO_DIR (basename strip
  // path traversal apa pun di value logoUrl).
  try {
    await unlink(path.join(LOGO_DIR, filename));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

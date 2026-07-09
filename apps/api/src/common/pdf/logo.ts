import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { API_ROOT } from '../config/paths.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Baca file logo (dari `logoUrl` mis. "/uploads/logos/x.png") jadi data URI
 * base64 untuk disematkan ke PDF (pdfmake). Return null kalau tidak ada /
 * gagal baca — pemanggil harus tahan tanpa logo.
 */
export async function readLogoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl || !logoUrl.startsWith('/uploads/')) return null;
  try {
    const rel = logoUrl.replace(/^\/+/, ''); // uploads/logos/x.png
    const abs = path.join(API_ROOT, rel);
    // Jaga-jaga path traversal: pastikan tetap di dalam API_ROOT/uploads.
    const uploadsDir = path.join(API_ROOT, 'uploads');
    if (!abs.startsWith(uploadsDir)) return null;
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME[ext];
    if (!mime) return null;
    const buf = await readFile(abs);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

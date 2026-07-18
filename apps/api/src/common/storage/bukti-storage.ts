import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { API_ROOT } from '../config/paths.js';

const BUKTI_ROOT = path.join(API_ROOT, 'uploads', 'bukti');

/**
 * Simpan buffer bukti ke disk (per-tenant), return path publik
 * (`/uploads/bukti/<tenantId>/<uuid><ext>`). Nama file di-randomize (UUID)
 * supaya tak bisa ditebak & tak bentrok.
 */
export async function saveBukti(tenantId: string, buffer: Buffer, ext: string): Promise<string> {
  const dir = path.join(BUKTI_ROOT, tenantId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/bukti/${tenantId}/${filename}`;
}

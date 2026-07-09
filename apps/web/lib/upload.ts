/**
 * Server-only helper untuk forward multipart upload (file Excel) ke API
 * dengan auth + tenant headers terlampir. Server Actions pakai ini.
 */
import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export async function uploadXlsx(path: string, file: File): Promise<ImportResult> {
  const res = await postMultipart(path, file);
  return res.json() as Promise<ImportResult>;
}

export interface LogoUploadResult {
  logoUrl: string | null;
}

export async function uploadLogo(file: File): Promise<LogoUploadResult> {
  const res = await postMultipart('/tenants/current/logo', file);
  return res.json() as Promise<LogoUploadResult>;
}

async function postMultipart(path: string, file: File): Promise<Response> {
  const c = await cookies();
  const access = c.get('lentera_access')?.value;
  if (!access) throw new Error('Session expired. Silakan login ulang.');
  const tenantRaw = c.get('lentera_tenant')?.value;
  const tenantId = tenantRaw ? (JSON.parse(tenantRaw).tenantId as string) : undefined;

  const fd = new FormData();
  fd.append('file', file);

  const headers: Record<string, string> = {
    authorization: `Bearer ${access}`,
  };
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers,
    body: fd,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload gagal (${res.status}): ${text.slice(0, 200)}`);
  }
  return res;
}

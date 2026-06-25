/**
 * Klien API minimal — dipakai server-side (Server Actions & RSC).
 * Browser TIDAK pernah pegang access token; kita simpan di cookie httpOnly.
 */
import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type FetchOpts = RequestInit & { tenantId?: string; cabangId?: string };

export async function apiFetch<T>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const c = await cookies();
  const access = c.get('lentera_access')?.value;
  const headers = new Headers(opts.headers);
  headers.set('content-type', 'application/json');
  if (access) headers.set('authorization', `Bearer ${access}`);
  if (opts.tenantId) headers.set('x-tenant-id', opts.tenantId);
  if (opts.cabangId) headers.set('x-cabang-id', opts.cabangId);

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...opts,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; nama: string };
  memberships: Array<{
    tenantId: string;
    tenantNama: string;
    role: string;
    cabangIds: string[];
  }>;
}> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Email atau password salah');
  }
  return res.json();
}

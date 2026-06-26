/**
 * Klien API minimal — dipakai server-side (Server Actions & RSC).
 * Browser TIDAK pernah pegang access token; kita simpan di cookie httpOnly.
 *
 * Refresh flow:
 *   - Kalau access token expired → API balas 401.
 *   - Coba refresh sekali pakai refresh token; rotate, lalu retry request asli.
 *   - Kalau retry juga 401 atau refresh gagal → throw (caller redirect /login).
 *   - Penulisan cookie hanya jalan di Server Action / Route Handler;
 *     dari RSC `cookies().set` throw — kita catch supaya request tetap sukses.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type FetchOpts = RequestInit & { tenantId?: string; cabangId?: string };

async function tryRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

async function persistRotatedTokens(accessToken: string, refreshToken: string): Promise<void> {
  try {
    const c = await cookies();
    const common = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
    c.set('lentera_access', accessToken, { ...common, maxAge: 60 * 15 });
    c.set('lentera_refresh', refreshToken, { ...common, maxAge: 60 * 60 * 24 * 7 });
  } catch {
    // RSC context — cookies read-only. Ignore: next Server Action akan refresh ulang.
  }
}

async function doFetch(path: string, access: string | undefined, opts: FetchOpts): Promise<Response> {
  const headers = new Headers(opts.headers);
  // Set content-type HANYA kalau ada body — Fastify reject application/json + empty body (400).
  if (opts.body != null) headers.set('content-type', 'application/json');
  if (access) headers.set('authorization', `Bearer ${access}`);
  if (opts.tenantId) headers.set('x-tenant-id', opts.tenantId);
  if (opts.cabangId) headers.set('x-cabang-id', opts.cabangId);
  return fetch(`${API_URL}/api/v1${path}`, { ...opts, headers, cache: 'no-store' });
}

export async function apiFetch<T>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const c = await cookies();
  let access = c.get('lentera_access')?.value;
  const refresh = c.get('lentera_refresh')?.value;

  let res = await doFetch(path, access, opts);

  if (res.status === 401 && refresh) {
    const rotated = await tryRefresh(refresh);
    if (rotated) {
      access = rotated.accessToken;
      await persistRotatedTokens(rotated.accessToken, rotated.refreshToken);
      res = await doFetch(path, access, opts);
    }
  }

  // 401 setelah refresh attempt → session expired. Redirect ke /logout
  // (Route Handler) supaya cookie stale bisa di-delete sebelum landing /login.
  // `cookies().delete()` ilegal di RSC, jadi tidak bisa clear di sini.
  if (res.status === 401) {
    redirect('/logout?reason=session_expired');
  }

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

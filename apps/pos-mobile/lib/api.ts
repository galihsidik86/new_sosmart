/**
 * Klien API minimal untuk POS. Auto-refresh token saat 401, lempar
 * ApiError kalau gagal supaya UI bisa tampilkan pesan ramah.
 *
 * URL API dinamis — disimpan di SecureStore supaya user bisa ganti dari
 * Setelan tanpa rebuild APK. Default fallback: env var, atau host
 * Android emulator (10.0.2.2).
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { getTokens, setTokens, getTenant } from './session';

const KEY_API_URL = 'lentera_pos_api_url';
const DEFAULT_URL =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://10.0.2.2:4000';

let cachedUrl: string | null = null;

/** Trim trailing slash + whitespace, jangan paksa http kalau user pakai https. */
function normalize(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

export async function getApiUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;
  const saved = await SecureStore.getItemAsync(KEY_API_URL);
  const url = saved ? normalize(saved) : DEFAULT_URL;
  cachedUrl = url;
  return url;
}

export async function setApiUrl(url: string): Promise<void> {
  const v = normalize(url);
  await SecureStore.setItemAsync(KEY_API_URL, v);
  cachedUrl = v;
}

export async function resetApiUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_API_URL);
  cachedUrl = DEFAULT_URL;
}

export function getApiUrlDefault(): string {
  return DEFAULT_URL;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  tenantId?: string;
  cabangId?: string;
  /** Skip token refresh + 401 retry. Dipakai login. */
  noAuth?: boolean;
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  try {
    const base = await getApiUrl();
    const res = await fetch(`${base}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function doFetch(path: string, access: string | null, opts: FetchOpts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (access) headers.authorization = `Bearer ${access}`;
  if (opts.tenantId) headers['x-tenant-id'] = opts.tenantId;
  if (opts.cabangId) headers['x-cabang-id'] = opts.cabangId;
  const base = await getApiUrl();
  return fetch(`${base}/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  let { accessToken, refreshToken } = await getTokens();

  // Auto-pasang tenant kalau caller lupa
  if (!opts.tenantId && !opts.noAuth) {
    const t = await getTenant();
    if (t) {
      opts.tenantId = t.tenantId;
      opts.cabangId = opts.cabangId ?? t.cabangId;
    }
  }

  let res = await doFetch(path, opts.noAuth ? null : accessToken, opts);

  if (res.status === 401 && refreshToken && !opts.noAuth) {
    if (await tryRefresh(refreshToken)) {
      accessToken = (await getTokens()).accessToken;
      res = await doFetch(path, accessToken, opts);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    const msg =
      (typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : text) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; nama: string };
  memberships: Array<{
    tenantId: string;
    tenantNama: string;
    role: string;
    cabangIds: string[];
  }>;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const base = await getApiUrl();
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new ApiError(res.status, 'Email atau password salah', txt);
  }
  return (await res.json()) as LoginResponse;
}

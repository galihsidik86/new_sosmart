/**
 * Sesi POS: simpan access/refresh token + identitas user + tenant pilihan.
 * Pakai expo-secure-store di Android (Keystore). AsyncStorage fallback web/dev.
 */
import * as SecureStore from 'expo-secure-store';

const KEY_ACCESS = 'lentera_pos_access';
const KEY_REFRESH = 'lentera_pos_refresh';
const KEY_USER = 'lentera_pos_user';
const KEY_TENANT = 'lentera_pos_tenant';

export interface SessionUser {
  id: string;
  email: string;
  nama: string;
}

export interface SessionTenant {
  tenantId: string;
  tenantNama: string;
  role: string;
  cabangId: string;
  cabangKode: string;
  cabangNama: string;
}

async function get(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}
async function set(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}
async function del(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

export async function getTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  return {
    accessToken: await get(KEY_ACCESS),
    refreshToken: await get(KEY_REFRESH),
  };
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await set(KEY_ACCESS, access);
  await set(KEY_REFRESH, refresh);
}

export async function getUser(): Promise<SessionUser | null> {
  const raw = await get(KEY_USER);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}
export async function setUser(u: SessionUser): Promise<void> {
  await set(KEY_USER, JSON.stringify(u));
}

export async function getTenant(): Promise<SessionTenant | null> {
  const raw = await get(KEY_TENANT);
  return raw ? (JSON.parse(raw) as SessionTenant) : null;
}
export async function setTenant(t: SessionTenant): Promise<void> {
  await set(KEY_TENANT, JSON.stringify(t));
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    del(KEY_ACCESS),
    del(KEY_REFRESH),
    del(KEY_USER),
    del(KEY_TENANT),
  ]);
}

import { cookies } from 'next/headers';

const ACCESS = 'lentera_access';
const REFRESH = 'lentera_refresh';
const TENANT = 'lentera_tenant';
const USER = 'lentera_user';

export interface ActiveSession {
  user: { id: string; email: string; nama: string };
  tenantId?: string;
  tenantNama?: string;
  role?: string;
}

export async function setSession(opts: {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; nama: string };
  tenantId?: string;
  tenantNama?: string;
  role?: string;
}) {
  const c = await cookies();
  const common = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
  c.set(ACCESS, opts.accessToken, { ...common, maxAge: 60 * 15 });
  c.set(REFRESH, opts.refreshToken, { ...common, maxAge: 60 * 60 * 24 * 7 });
  c.set(USER, JSON.stringify(opts.user), { ...common, httpOnly: false, maxAge: 60 * 60 * 24 * 7 });
  if (opts.tenantId) {
    c.set(
      TENANT,
      JSON.stringify({
        tenantId: opts.tenantId,
        tenantNama: opts.tenantNama,
        role: opts.role,
      }),
      { ...common, httpOnly: false, maxAge: 60 * 60 * 24 * 30 },
    );
  }
}

export async function getSession(): Promise<ActiveSession | null> {
  const c = await cookies();
  const userRaw = c.get(USER)?.value;
  if (!userRaw) return null;
  const user = JSON.parse(userRaw);
  const tenantRaw = c.get(TENANT)?.value;
  if (tenantRaw) {
    const t = JSON.parse(tenantRaw);
    return { user, ...t };
  }
  return { user };
}

export async function getActiveTenantId(): Promise<string | null> {
  const c = await cookies();
  const t = c.get(TENANT)?.value;
  return t ? (JSON.parse(t).tenantId as string) : null;
}

export async function clearSession() {
  const c = await cookies();
  [ACCESS, REFRESH, USER, TENANT].forEach((k) => c.delete(k));
}

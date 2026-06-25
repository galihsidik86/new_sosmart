import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getSession, setSession } from '@/lib/session';
import { cookies } from 'next/headers';

interface TenantMembership {
  tenantId: string;
  tenant: { id: string; nama: string; npwp: string | null; isPkp: boolean };
  role: string;
  cabang: Array<{ id: string; kode: string; nama: string; isPusat: boolean }> | null;
}

async function pickAction(formData: FormData) {
  'use server';
  const tenantId = String(formData.get('tenantId'));
  const tenantNama = String(formData.get('tenantNama'));
  const role = String(formData.get('role'));

  const c = await cookies();
  const access = c.get('lentera_access')?.value;
  const refresh = c.get('lentera_refresh')?.value;
  const userRaw = c.get('lentera_user')?.value;
  if (!access || !refresh || !userRaw) redirect('/login');

  await setSession({
    accessToken: access,
    refreshToken: refresh,
    user: JSON.parse(userRaw),
    tenantId,
    tenantNama,
    role,
  });
  redirect('/dashboard');
}

export default async function PilihTenant() {
  const s = await getSession();
  if (!s) redirect('/login');

  const memberships = await apiFetch<TenantMembership[]>('/tenants/me');

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream-100 p-6">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-1">
          Pilih perusahaan
        </h1>
        <p className="text-sm text-tanah-500 mb-6">
          Anda anggota di {memberships.length} perusahaan.
        </p>

        <div className="space-y-3">
          {memberships.map((m) => (
            <form
              action={pickAction}
              key={m.tenantId}
              className="bg-white border border-cream-200 rounded-xl p-5 shadow-sm flex items-center justify-between"
            >
              <input type="hidden" name="tenantId" value={m.tenantId} />
              <input type="hidden" name="tenantNama" value={m.tenant.nama} />
              <input type="hidden" name="role" value={m.role} />
              <div>
                <div className="font-semibold text-tanah-700">{m.tenant.nama}</div>
                <div className="text-xs text-tanah-500 mt-1 flex gap-3">
                  {m.tenant.npwp && <span>NPWP {m.tenant.npwp}</span>}
                  {m.tenant.isPkp && <span className="text-padi-700">· PKP</span>}
                  <span>· role {m.role}</span>
                  <span>
                    · {m.cabang ? `${m.cabang.length} cabang` : 'semua cabang'}
                  </span>
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 rounded-lg text-sm font-semibold"
              >
                Masuk
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}

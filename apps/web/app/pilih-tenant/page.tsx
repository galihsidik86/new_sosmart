import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getSession, setSession } from '@/lib/session';
import { cookies } from 'next/headers';
import { Button, Icon } from '@/components/ui';

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

const initialsOf = (s: string) =>
  s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default async function PilihTenant() {
  const s = await getSession();
  if (!s) redirect('/login');

  const memberships = await apiFetch<TenantMembership[]>('/tenants/me');

  return (
    <main className="min-h-screen flex bg-cream-100">
      {/* Panel brand */}
      <aside className="hidden lg:flex lg:w-[40%] flex-col justify-between p-12 bg-gradient-to-br from-sogan-600 via-sogan-800 to-sogan-900 text-cream-50 batik-overlay overflow-hidden relative">
        <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-emas-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 w-72 h-72 rounded-full bg-sogan-400/25 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emas-300 to-emas-500 grid place-items-center font-display text-2xl font-semibold text-sogan-900 shadow-lg">
            L
          </div>
          <div>
            <div className="font-display text-xl font-semibold">Lentera</div>
            <div className="text-[10px] tracking-[0.14em] uppercase text-emas-300 font-bold">
              Akuntansi &amp; Pajak
            </div>
          </div>
        </div>

        <div className="relative">
          <h2 className="font-display text-4xl font-semibold leading-tight max-w-md">
            Halo {s.user.nama.split(' ')[0]}, pilih perusahaan untuk mulai.
          </h2>
          <p className="mt-4 text-cream-100/80 text-sm max-w-sm">
            Satu akun bisa mengelola banyak badan usaha. Pilih workspace di sebelah untuk masuk.
          </p>
        </div>

        <div className="relative text-[11px] text-cream-100/70">
          © 2026 Lentera · Sistem akuntansi &amp; pajak multi-tenant.
        </div>
      </aside>

      {/* Panel pilihan */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-1">
            Pilih perusahaan
          </h1>
          <p className="text-sm text-tanah-500 mb-6">
            Anda anggota di <span className="font-semibold text-sogan-500">{memberships.length}</span> perusahaan.
          </p>

          <div className="space-y-3">
            {memberships.map((m) => (
              <form
                action={pickAction}
                key={m.tenantId}
                className="group bg-white border border-cream-200 rounded-xl p-4 shadow-sm hover:border-sogan-300 hover:shadow-md transition flex items-center gap-4"
              >
                <input type="hidden" name="tenantId" value={m.tenantId} />
                <input type="hidden" name="tenantNama" value={m.tenant.nama} />
                <input type="hidden" name="role" value={m.role} />
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sogan-400 to-sogan-600 grid place-items-center text-cream-50 font-bold flex-shrink-0">
                  {initialsOf(m.tenant.nama)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-tanah-700 truncate">{m.tenant.nama}</div>
                  <div className="text-xs text-tanah-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    {m.tenant.npwp && <span className="font-mono">NPWP {m.tenant.npwp}</span>}
                    {m.tenant.isPkp && <span className="text-padi-700 font-semibold">· PKP</span>}
                    <span>· {m.role}</span>
                    <span>· {m.cabang ? `${m.cabang.length} cabang` : 'semua cabang'}</span>
                  </div>
                </div>
                <Button type="submit" size="sm" rightIcon={<Icon name="chevron-down" size={14} className="-rotate-90" />}>
                  Masuk
                </Button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

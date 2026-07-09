import { redirect } from 'next/navigation';
import { apiLogin } from '@/lib/api';
import { setSession, getSession } from '@/lib/session';

async function loginAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const r = await apiLogin(email, password);

  // Kalau user cuma punya 1 tenant, auto-pilih supaya hemat klik.
  const single = r.memberships.length === 1 ? r.memberships[0] : undefined;
  await setSession({
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    user: r.user,
    ...(single
      ? { tenantId: single.tenantId, tenantNama: single.tenantNama, role: single.role }
      : {}),
  });
  redirect(single ? '/dashboard' : '/pilih-tenant');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ session_expired?: string }>;
}) {
  const sp = await searchParams;
  // Cookie clearing untuk session_expired sudah dilakukan di /logout Route Handler.
  // Di sini cukup cek session aktif — kalau ada, user memang sudah login.
  const s = await getSession();
  if (s?.tenantId) redirect('/dashboard');

  // Branding perusahaan (opsional) — dibaca dari file publik yang ditulis saat
  // profil/logo di-update. Halaman login pra-auth jadi tak butuh konteks tenant.
  let branding: { nama: string; logoUrl: string | null } | null = null;
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/uploads/branding.json`, { cache: 'no-store' });
    if (res.ok) branding = await res.json();
  } catch { /* pakai brand Lentera */ }

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream-100 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-cream-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="Logo perusahaan" className="w-12 h-12 rounded-xl object-contain bg-white border border-cream-200" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-sogan-500 grid place-items-center text-cream-50 font-bold text-lg">L</div>
          )}
          <div>
            <div className="font-display text-2xl font-semibold text-tanah-700">{branding?.nama ?? 'Lentera'}</div>
            <div className="text-[10px] tracking-[0.14em] uppercase text-sogan-500 font-bold">
              {branding?.nama ? 'Lentera · Akuntansi & Pajak' : 'Akuntansi · Pajak'}
            </div>
          </div>
        </div>
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-1">Masuk ke akun</h1>
        <p className="text-sm text-tanah-500 mb-6">Sistem akuntansi & pajak Indonesia.</p>

        {sp.session_expired && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Sesi sudah berakhir. Silakan masuk ulang.
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-tanah-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              defaultValue="owner@lentera.id"
              className="w-full px-3 py-2.5 bg-cream-50 border border-cream-300 rounded-lg text-tanah-700 focus:outline-none focus:border-sogan-500 focus:shadow-focus"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-tanah-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              defaultValue="lentera123"
              className="w-full px-3 py-2.5 bg-cream-50 border border-cream-300 rounded-lg text-tanah-700 focus:outline-none focus:border-sogan-500 focus:shadow-focus"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-sogan-500 hover:bg-sogan-600 text-cream-50 rounded-lg font-semibold transition"
          >
            Masuk
          </button>
        </form>

        <p className="text-xs text-tanah-300 mt-6 text-center">
          Demo: <code className="font-mono">owner@lentera.id</code> /{' '}
          <code className="font-mono">lentera123</code>
        </p>
      </div>
    </main>
  );
}

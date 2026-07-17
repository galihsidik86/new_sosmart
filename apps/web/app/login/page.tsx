import { redirect } from 'next/navigation';
import { apiLogin } from '@/lib/api';
import { setSession, getSession } from '@/lib/session';
import { Button, Input, FormField, Icon } from '@/components/ui';

async function loginAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  // Tangkap error kredensial supaya tampil sebagai pesan ramah, bukan
  // "Application error" (server-side exception). redirect() dipanggil di luar
  // try agar NEXT_REDIRECT tidak ikut tertangkap.
  let dest = '/pilih-tenant';
  try {
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
    dest = single ? '/dashboard' : '/pilih-tenant';
  } catch {
    redirect('/login?error=kredensial');
  }
  redirect(dest);
}

const FITUR = [
  'Laporan Keuangan sesuai dengan SAK',
  'PPN & PPh sesuai regulasi terbaru',
  'Multi-cabang, multi-proyek & jejak audit',
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ session_expired?: string; error?: string }>;
}) {
  const sp = await searchParams;
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

  const nama = branding?.nama ?? 'Lentera';

  const LogoTile = ({ size }: { size: 'sm' | 'lg' }) =>
    branding?.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.logoUrl}
        alt="Logo perusahaan"
        className={`${size === 'lg' ? 'w-14 h-14' : 'w-11 h-11'} rounded-xl object-contain bg-white border border-cream-200`}
      />
    ) : (
      <div
        className={`${size === 'lg' ? 'w-14 h-14 text-xl' : 'w-11 h-11 text-lg'} rounded-xl bg-sogan-500 grid place-items-center text-cream-50 font-bold`}
      >
        L
      </div>
    );

  return (
    <main className="min-h-screen flex bg-cream-100">
      {/* Panel brand (batik) — desktop */}
      <aside className="hidden lg:flex lg:w-[44%] flex-col justify-between p-12 bg-gradient-to-br from-sogan-600 via-sogan-800 to-sogan-900 text-cream-50 batik-overlay overflow-hidden relative">
        {/* aksen cahaya emas */}
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
            Akuntansi &amp; pajak Indonesia, dalam satu sistem yang rapi.
          </h2>
          <ul className="mt-8 space-y-3">
            {FITUR.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-emas-500/20 border border-emas-300/30 grid place-items-center text-emas-300">
                  <Icon name="check" size={14} />
                </span>
                <span className="text-cream-100 text-sm">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[11px] text-cream-100/70">
          © 2026 Lentera · Sistem akuntansi &amp; pajak multi-tenant.
        </div>
      </aside>

      {/* Panel form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <LogoTile size="lg" />
            <div>
              <div className="font-display text-2xl font-semibold text-tanah-700 leading-tight">{nama}</div>
              <div className="text-[10px] tracking-[0.14em] uppercase text-sogan-500 font-bold">
                {branding?.nama ? 'via Lentera' : 'Akuntansi · Pajak'}
              </div>
            </div>
          </div>

          <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-1">Masuk ke akun</h1>
          <p className="text-sm text-tanah-500 mb-6">Sistem akuntansi &amp; pajak Indonesia.</p>

          {sp.session_expired && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-emas-100 border border-emas-300 text-sm text-emas-700">
              Sesi sudah berakhir. Silakan masuk ulang.
            </div>
          )}
          {sp.error === 'kredensial' && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-bata-100 border border-bata-300 text-sm text-bata-700">
              Email atau password salah. Silakan periksa kembali.
            </div>
          )}

          <form action={loginAction} className="space-y-4">
            <FormField label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required placeholder="nama@perusahaan.co.id" />
            </FormField>
            <FormField label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" required placeholder="••••••••" />
            </FormField>
            <Button type="submit" className="w-full" size="md">
              Masuk
            </Button>
          </form>

          <p className="text-xs text-tanah-500 mt-6 text-center">
            Lupa password? Hubungi admin / pemilik akun perusahaan Anda untuk mengatur ulang.
          </p>
          <p className="text-xs mt-3 text-center">
            <a
              href="/panduan.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sogan-500 font-semibold hover:underline"
            >
              📘 Panduan Penggunaan
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

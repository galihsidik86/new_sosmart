import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { LogoUploader } from '@/components/LogoUploader';
import { apiFetch } from '@/lib/api';
import { uploadLogo, type LogoUploadResult } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canAdmin } from '@/lib/roles';

interface TenantProfile {
  id: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  pkpNo: string | null;
  alamat: string | null;
  email: string | null;
  telp: string | null;
  logoUrl: string | null;
}

const PATH = '/pengaturan/profil-perusahaan';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * `apiFetch` melempar `Error("API {status}: {jsonBody}")` — sama pola
 * dengan `pengaturan/periode/page.tsx` supaya error API (mis. NPWP tidak
 * valid) tampil rapi, bukan Next.js dev error overlay.
 */
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Terjadi kesalahan tak terduga.';
  const m = err.message.match(/^API \d+: (.+)$/s);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (typeof body?.message === 'string') return body.message;
    } catch {
      // bukan JSON — pakai raw text
    }
    return m[1];
  }
  return err.message;
}

async function runAction(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    redirect(`${PATH}?error=${encodeURIComponent(extractErrorMessage(e))}`);
  }
  revalidatePath(PATH);
  redirect(PATH);
}

async function updateProfileAction(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/tenants/current', {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || undefined,
      isPkp: formData.get('isPkp') === 'on',
      pkpNo: formData.get('pkpNo') || undefined,
      alamat: formData.get('alamat') || undefined,
      email: formData.get('email') || undefined,
      telp: formData.get('telp') || undefined,
    }),
  }));
}

async function removeLogoAction() {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  await runAction(() => apiFetch('/tenants/current/logo', { method: 'DELETE', tenantId }));
}

async function uploadLogoAction(formData: FormData): Promise<LogoUploadResult> {
  'use server';
  const file = formData.get('file') as File;
  const result = await uploadLogo(file);
  revalidatePath(PATH);
  return result;
}

export default async function ProfilPerusahaanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const t = await apiFetch<TenantProfile>('/tenants/current', { tenantId });
  const editable = canAdmin(s.role);

  return (
    <>
      <Topbar breadcrumb="Profil Perusahaan" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-wedel-900">
            Profil Perusahaan
          </h1>
          <p className="text-sm text-tanah-500 mt-1">
            Identitas badan usaha yang tampil di header faktur, laporan, dan dokumen cetak lainnya.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 mb-6">
            <strong>Gagal: </strong>{error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-tanah-500 mb-3">
            Logo Perusahaan
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-cream-300 bg-cream-50 grid place-items-center overflow-hidden flex-shrink-0">
              {t.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_URL}${t.logoUrl}`} alt="Logo perusahaan" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-tanah-400 text-center px-2">Belum ada logo</span>
              )}
            </div>
            {editable && (
              <div className="flex items-center gap-3">
                <LogoUploader uploadAction={uploadLogoAction} label={t.logoUrl ? 'Ganti Logo' : 'Unggah Logo'} />
                {t.logoUrl && (
                  <form action={removeLogoAction}>
                    <button className="px-3 py-2 bg-cream-100 hover:bg-cream-200 border border-cream-300 rounded-lg text-sm font-semibold text-tanah-700">
                      Hapus Logo
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
          <p className="text-[11px] text-tanah-400 mt-3">PNG, JPEG, atau WEBP. Maksimal 2 MB.</p>
        </div>

        <form action={updateProfileAction} className="bg-white rounded-xl border border-cream-200 shadow-sm p-6 space-y-4">
          <fieldset disabled={!editable} className="space-y-4 disabled:opacity-70">
            <FF label="Nama Badan Usaha" name="nama" required defaultValue={t.nama} placeholder="PT Sinar Niaga Sentosa" />
            <div className="grid grid-cols-2 gap-4">
              <FF label="NPWP Pusat" name="npwp" defaultValue={t.npwp ?? ''} placeholder="012345678901000" />
              <FF label="No. Pengukuhan PKP" name="pkpNo" defaultValue={t.pkpNo ?? ''} placeholder="PEM-00001/WPJ.01/2025" />
            </div>
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isPkp" defaultChecked={t.isPkp} />
              Perusahaan berstatus PKP (Pengusaha Kena Pajak)
            </label>
            <FF label="Alamat" name="alamat" defaultValue={t.alamat ?? ''} placeholder="Jl. Industri No. 10, Jakarta" />
            <div className="grid grid-cols-2 gap-4">
              <FF label="Email" name="email" type="email" defaultValue={t.email ?? ''} placeholder="info@perusahaan.id" />
              <FF label="Telepon" name="telp" defaultValue={t.telp ?? ''} placeholder="021-5551234" />
            </div>
            {editable && (
              <div className="pt-2">
                <button className="px-4 py-2 bg-sogan-500 hover:bg-sogan-600 text-cream-50 font-semibold rounded-lg text-sm">
                  Simpan Perubahan
                </button>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </>
  );
}

function FF(props: {
  label: string; name: string; required?: boolean;
  type?: string; placeholder?: string; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1">
        {props.label}
        {props.required && <span className="text-bata-500 ml-0.5">*</span>}
      </label>
      <input
        name={props.name} type={props.type ?? 'text'} required={props.required}
        placeholder={props.placeholder} defaultValue={props.defaultValue}
        className="w-full px-2.5 py-2 bg-cream-50 border border-cream-300 rounded-md text-sm focus:outline-none focus:border-sogan-500"
      />
    </div>
  );
}

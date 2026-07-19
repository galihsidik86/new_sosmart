import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { LogoUploader } from '@/components/LogoUploader';
import { apiFetch } from '@/lib/api';
import { uploadLogo, type LogoUploadResult } from '@/lib/upload';
import { getActiveTenantId, getSession } from '@/lib/session';
import { canAdmin } from '@/lib/roles';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, Select, StatusBanner,
} from '@/components/ui';
import { BackLink } from '@/components/BackLink';
import { CancelButton } from '@/components/CancelButton';

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
  jenisUsaha: 'DAGANG' | 'JASA';
}

const PATH = '/pengaturan/profil-perusahaan';

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
      jenisUsaha: formData.get('jenisUsaha') === 'JASA' ? 'JASA' : 'DAGANG',
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
      <PageContainer size="form">
        <BackLink href="/dashboard" label="← Kembali ke Dashboard" />
        <PageHeader
          title="Profil Perusahaan"
          subtitle="Identitas badan usaha yang tampil di header faktur, laporan, dan dokumen cetak lainnya."
        />

        {error && (
          <StatusBanner tone="danger" className="mb-6">
            <span><strong>Gagal: </strong>{error}</span>
          </StatusBanner>
        )}

        <Card padding="lg" className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-tanah-500 mb-3">
            Logo Perusahaan
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-cream-300 bg-cream-50 grid place-items-center overflow-hidden flex-shrink-0">
              {t.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logoUrl} alt="Logo perusahaan" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-tanah-500 text-center px-2">Belum ada logo</span>
              )}
            </div>
            {editable && (
              <div className="flex items-center gap-3">
                <LogoUploader uploadAction={uploadLogoAction} label={t.logoUrl ? 'Ganti Logo' : 'Unggah Logo'} />
                {t.logoUrl && (
                  <form action={removeLogoAction}>
                    <Button type="submit" variant="secondary">Hapus Logo</Button>
                  </form>
                )}
              </div>
            )}
          </div>
          <p className="text-[11px] text-tanah-500 mt-3">PNG, JPEG, atau WEBP. Maksimal 2 MB.</p>
        </Card>

        <Card padding="lg">
          <form action={updateProfileAction} className="space-y-4">
            <fieldset disabled={!editable} className="space-y-4 disabled:opacity-70">
              <FormField label="Nama Badan Usaha" required>
                <Input name="nama" required defaultValue={t.nama} placeholder="PT Sinar Niaga Sentosa" />
              </FormField>
              <FormField label="Jenis Usaha">
                <Select name="jenisUsaha" defaultValue={t.jenisUsaha}>
                  <option value="DAGANG">Dagang (jual-beli barang, ada persediaan)</option>
                  <option value="JASA">Jasa (tanpa persediaan)</option>
                </Select>
                <p className="text-[11px] text-tanah-500 mt-1">
                  Usaha <b>Jasa</b>: item master otomatis berjenis jasa &amp; menu Persediaan disembunyikan.
                </p>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="NPWP Pusat">
                  <Input name="npwp" defaultValue={t.npwp ?? ''} placeholder="012345678901000" />
                </FormField>
                <FormField label="No. Pengukuhan PKP">
                  <Input name="pkpNo" defaultValue={t.pkpNo ?? ''} placeholder="PEM-00001/WPJ.01/2025" />
                </FormField>
              </div>
              <label className="flex items-center gap-2 text-sm text-tanah-700">
                <input type="checkbox" name="isPkp" defaultChecked={t.isPkp} />
                Perusahaan berstatus PKP (Pengusaha Kena Pajak)
              </label>
              <FormField label="Alamat">
                <Input name="alamat" defaultValue={t.alamat ?? ''} placeholder="Jl. Industri No. 10, Jakarta" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Email">
                  <Input name="email" type="email" defaultValue={t.email ?? ''} placeholder="info@perusahaan.id" />
                </FormField>
                <FormField label="Telepon">
                  <Input name="telp" defaultValue={t.telp ?? ''} placeholder="021-5551234" />
                </FormField>
              </div>
              {editable && (
                <div className="pt-2 flex gap-2">
                  <Button type="submit">Simpan Perubahan</Button>
                  <CancelButton href="/dashboard" className="" />
                </div>
              )}
            </fieldset>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}

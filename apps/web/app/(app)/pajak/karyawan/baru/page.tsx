import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { KaryawanForm } from '@/components/KaryawanForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Cabang { id: string; kode: string; nama: string }

async function createKaryawan(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  try {
    await apiFetch('/karyawan', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        cabangId: (formData.get('cabangId') as string) || undefined,
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        nik: (formData.get('nik') as string)?.replace(/\D/g, ''),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        jabatan: formData.get('jabatan') || undefined,
        ptkpStatus: formData.get('ptkpStatus'),
        tanggalMasuk: formData.get('tanggalMasuk'),
        gajiPokok: String(formData.get('gajiPokok') ?? '0'),
        tunjanganTetap: String(formData.get('tunjanganTetap') ?? '0'),
        iuranBpjsKaryawan: String(formData.get('iuranBpjsKaryawan') ?? '0'),
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/pajak/karyawan');
  redirect('/pajak/karyawan');
}

export default async function KaryawanBaruPage() {
  await getSession();
  const tenantId = (await getActiveTenantId())!;
  const cabang = await apiFetch<Cabang[]>('/cabang', { tenantId });

  return (
    <PageContainer size="form">
      <div className="mb-2">
        <Link href="/pajak/karyawan" className="text-sm text-sogan-500 hover:underline">← Kembali ke daftar</Link>
      </div>
      <PageHeader title="Tambah Karyawan" subtitle="PTKP menentukan kategori TER PMK 168/2023." />
      <Card padding="lg">
        <KaryawanForm mode="create" action={createKaryawan} cabang={cabang} />
        <CancelButton href="/pajak/karyawan" />
      </Card>
    </PageContainer>
  );
}

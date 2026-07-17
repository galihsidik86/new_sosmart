import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { KaryawanForm } from '@/components/KaryawanForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';
import { PageContainer, PageHeader, Card } from '@/components/ui';

type Ptkp = 'TK_0' | 'TK_1' | 'TK_2' | 'TK_3' | 'K_0' | 'K_1' | 'K_2' | 'K_3' | 'HB_0' | 'HB_1' | 'HB_2' | 'HB_3';

interface Karyawan {
  id: string;
  kode: string;
  nama: string;
  nik: string;
  npwp: string | null;
  jabatan: string | null;
  ptkpStatus: Ptkp;
  cabangId: string | null;
  tanggalMasuk: string;
  gajiPokok: string;
  tunjanganTetap: string;
  iuranBpjsKaryawan: string;
}
interface Cabang { id: string; kode: string; nama: string }

async function updateKaryawan(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  try {
    await apiFetch(`/karyawan/${id}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify({
        cabangId: (formData.get('cabangId') as string) || null,
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        nik: (formData.get('nik') as string)?.replace(/\D/g, ''),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        jabatan: formData.get('jabatan') || null,
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

export default async function EditKaryawanPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const [k, cabang] = await Promise.all([
    apiFetch<Karyawan>(`/karyawan/${id}`, { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
  ]);

  return (
    <>
      <PageContainer size="form">
        <div className="mb-2">
          <Link href="/pajak/karyawan" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        </div>
        <PageHeader title="Edit Karyawan" subtitle={`${k.kode} · ${k.nama}`} />

        <Card padding="lg">
          <KaryawanForm
            mode="edit"
            action={updateKaryawan}
            cabang={cabang}
            submitLabel="Simpan perubahan"
            defaults={{
              id: k.id,
              kode: k.kode,
              nama: k.nama,
              nik: k.nik,
              npwp: k.npwp,
              jabatan: k.jabatan,
              ptkpStatus: k.ptkpStatus,
              cabangId: k.cabangId,
              tanggalMasuk: k.tanggalMasuk.slice(0, 10),
              gajiPokok: k.gajiPokok,
              tunjanganTetap: k.tunjanganTetap,
              iuranBpjsKaryawan: k.iuranBpjsKaryawan,
            }}
          />
          <div className="mt-3">
            <Link href="/pajak/karyawan" className="text-sm text-sogan-500 hover:underline">Batal</Link>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}

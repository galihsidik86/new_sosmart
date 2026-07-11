import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, Select, buttonClass,
} from '@/components/ui';

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

const PTKP_LABEL: Record<Ptkp, string> = {
  TK_0: 'TK/0', TK_1: 'TK/1', TK_2: 'TK/2', TK_3: 'TK/3',
  K_0: 'K/0', K_1: 'K/1', K_2: 'K/2', K_3: 'K/3',
  HB_0: 'HB/0', HB_1: 'HB/1', HB_2: 'HB/2', HB_3: 'HB/3',
};

async function updateKaryawan(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
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
          <form action={updateKaryawan} className="space-y-4">
            <input type="hidden" name="id" value={k.id} />
            <FormField label="Kode" required><Input name="kode" required defaultValue={k.kode} /></FormField>
            <FormField label="Nama" required><Input name="nama" required defaultValue={k.nama} /></FormField>
            <FormField label="NIK (16 digit)" required><Input name="nik" required defaultValue={k.nik} /></FormField>
            <FormField label="NPWP (15-16 digit)"><Input name="npwp" defaultValue={k.npwp ?? ''} /></FormField>
            <FormField label="PTKP">
              <Select name="ptkpStatus" required defaultValue={k.ptkpStatus} className="font-mono">
                {(Object.keys(PTKP_LABEL) as Ptkp[]).map((p) => (
                  <option key={p} value={p}>{PTKP_LABEL[p]}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Cabang">
              <Select name="cabangId" defaultValue={k.cabangId ?? ''}>
                <option value="">—</option>
                {cabang.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}
              </Select>
            </FormField>
            <FormField label="Jabatan"><Input name="jabatan" defaultValue={k.jabatan ?? ''} /></FormField>
            <FormField label="Tanggal masuk"><Input name="tanggalMasuk" type="date" required defaultValue={k.tanggalMasuk.slice(0, 10)} /></FormField>
            <FormField label="Gaji pokok"><Input name="gajiPokok" type="number" required defaultValue={k.gajiPokok} /></FormField>
            <FormField label="Tunjangan tetap"><Input name="tunjanganTetap" type="number" defaultValue={k.tunjanganTetap} /></FormField>
            <FormField label="Iuran BPJS karyawan"><Input name="iuranBpjsKaryawan" type="number" defaultValue={k.iuranBpjsKaryawan} /></FormField>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Simpan perubahan</Button>
              <Link href="/pajak/karyawan" className={buttonClass('secondary')}>Batal</Link>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}

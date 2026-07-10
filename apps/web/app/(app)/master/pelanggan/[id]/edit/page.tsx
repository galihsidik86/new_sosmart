import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, Select, buttonClass,
} from '@/components/ui';

type Tipe = 'DISTRIBUTOR' | 'RITEL' | 'KORPORAT' | 'KOPERASI' | 'PEMERINTAH' | 'LAINNYA';

interface Customer {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  tipe: Tipe;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  kreditLimit: string;
}

const TIPE_LABEL: Record<Tipe, string> = {
  DISTRIBUTOR: 'Distributor',
  RITEL: 'Ritel',
  KORPORAT: 'Korporat',
  KOPERASI: 'Koperasi',
  PEMERINTAH: 'Pemerintah',
  LAINNYA: 'Lainnya',
};

async function updateCustomer(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/customers/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      isPkp: formData.get('isPkp') === 'on',
      tipe: formData.get('tipe') ?? 'RITEL',
      kota: formData.get('kota') || null,
      telp: formData.get('telp') || null,
      terminHari: Number(formData.get('terminHari') ?? 14),
      kreditLimit: String(formData.get('kreditLimit') ?? '0'),
    }),
  });
  revalidatePath('/master/pelanggan');
  redirect('/master/pelanggan');
}

export default async function EditPelangganPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const c = await apiFetch<Customer>(`/customers/${id}`, { tenantId });

  return (
    <>
      <Topbar breadcrumb={`Data Pelanggan › Edit ${c.kode}`} tenantNama={s.tenantNama!} />
      <PageContainer size="form">
        <Link href="/master/pelanggan" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader title="Edit Pelanggan" subtitle={`${c.kode} · ${c.nama}`} className="mt-2" />

        <Card padding="lg">
          <form action={updateCustomer} className="space-y-4">
            <input type="hidden" name="id" value={c.id} />
            <FormField label="Kode" required><Input name="kode" required defaultValue={c.kode} /></FormField>
            <FormField label="Nama" required><Input name="nama" required defaultValue={c.nama} /></FormField>
            <FormField label="NPWP"><Input name="npwp" defaultValue={c.npwp ?? ''} /></FormField>
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isPkp" defaultChecked={c.isPkp} />
              Pelanggan ini PKP
            </label>
            <FormField label="Tipe">
              <Select name="tipe" defaultValue={c.tipe}>
                {(Object.keys(TIPE_LABEL) as Tipe[]).map((t) => (
                  <option key={t} value={t}>{TIPE_LABEL[t]}</option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kota"><Input name="kota" defaultValue={c.kota ?? ''} /></FormField>
              <FormField label="Telp"><Input name="telp" defaultValue={c.telp ?? ''} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Termin (hari)"><Input name="terminHari" type="number" defaultValue={String(c.terminHari)} /></FormField>
              <FormField label="Limit kredit"><Input name="kreditLimit" type="number" defaultValue={c.kreditLimit} /></FormField>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Simpan perubahan</Button>
              <Link href="/master/pelanggan" className={buttonClass('secondary')}>
                Batal
              </Link>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}

import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, buttonClass,
} from '@/components/ui';

interface Vendor {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  kategori: string | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
}

async function updateVendor(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  await apiFetch(`/vendors/${id}`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify({
      kode: formData.get('kode'),
      nama: formData.get('nama'),
      npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
      isPkp: formData.get('isPkp') === 'on',
      kategori: formData.get('kategori') || null,
      kota: formData.get('kota') || null,
      telp: formData.get('telp') || null,
      terminHari: Number(formData.get('terminHari') ?? 30),
    }),
  });
  revalidatePath('/master/vendor');
  redirect('/master/vendor');
}

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const v = await apiFetch<Vendor>(`/vendors/${id}`, { tenantId });

  return (
    <>
      <PageContainer size="form">
        <Link href="/master/vendor" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader title="Edit Vendor" subtitle={`${v.kode} · ${v.nama}`} className="mt-2" />

        <Card padding="lg">
          <form action={updateVendor} className="space-y-4">
            <input type="hidden" name="id" value={v.id} />
            <FormField label="Kode" required><Input name="kode" required defaultValue={v.kode} /></FormField>
            <FormField label="Nama" required><Input name="nama" required defaultValue={v.nama} /></FormField>
            <FormField label="NPWP"><Input name="npwp" defaultValue={v.npwp ?? ''} /></FormField>
            <label className="flex items-center gap-2 text-sm text-tanah-700">
              <input type="checkbox" name="isPkp" defaultChecked={v.isPkp} />
              Vendor ini PKP (PPN masukan dapat dikreditkan)
            </label>
            <FormField label="Kategori"><Input name="kategori" defaultValue={v.kategori ?? ''} /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kota"><Input name="kota" defaultValue={v.kota ?? ''} /></FormField>
              <FormField label="Telp"><Input name="telp" defaultValue={v.telp ?? ''} /></FormField>
            </div>
            <FormField label="Termin (hari)"><Input name="terminHari" type="number" defaultValue={String(v.terminHari)} /></FormField>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Simpan perubahan</Button>
              <Link href="/master/vendor" className={buttonClass('secondary')}>
                Batal
              </Link>
            </div>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}

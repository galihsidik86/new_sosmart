import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import {
  PageContainer, PageHeader, Card, Button, FormField, Input, Select, buttonClass,
} from '@/components/ui';

interface JenisPelanggan { id: string; nama: string }

interface Customer {
  id: string;
  kode: string;
  nama: string;
  npwp: string | null;
  isPkp: boolean;
  jenisPelangganId: string | null;
  kota: string | null;
  telp: string | null;
  terminHari: number;
  kreditLimit: string;
  partnerTenantId: string | null;
}

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
      jenisPelangganId: formData.get('jenisPelangganId') || null,
      kota: formData.get('kota') || null,
      telp: formData.get('telp') || null,
      terminHari: Number(formData.get('terminHari') ?? 14),
      kreditLimit: String(formData.get('kreditLimit') ?? '0'),
      partnerTenantId: (formData.get('partnerTenantId') as string) || null,
    }),
  });
  revalidatePath('/master/pelanggan');
  redirect('/master/pelanggan');
}

export default async function EditPelangganPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const [c, partners, jenisList] = await Promise.all([
    apiFetch<Customer>(`/customers/${id}`, { tenantId }),
    apiFetch<Array<{ tenantId: string; nama: string }>>('/consolidation/candidates', { tenantId }).catch(() => []),
    apiFetch<JenisPelanggan[]>('/jenis-pelanggan', { tenantId }),
  ]);

  return (
    <>
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
            <FormField label="Jenis Pelanggan">
              <Select name="jenisPelangganId" defaultValue={c.jenisPelangganId ?? ''}>
                <option value="">— pilih —</option>
                {jenisList.map((j) => (
                  <option key={j.id} value={j.id}>{j.nama}</option>
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
            {partners.length > 0 && (
              <FormField label="Entitas intra-grup (intercompany)" hint="Kalau pelanggan ini adalah anak/anggota grup, tunjuk tenant-nya → piutang ke sini dieliminasi saat konsolidasi.">
                <Select name="partnerTenantId" defaultValue={c.partnerTenantId ?? ''}>
                  <option value="">— bukan intra-grup —</option>
                  {partners.map((p) => <option key={p.tenantId} value={p.tenantId}>{p.nama}</option>)}
                </Select>
              </FormField>
            )}
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

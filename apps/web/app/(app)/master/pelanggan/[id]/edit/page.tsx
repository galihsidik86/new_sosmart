import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CustomerForm } from '@/components/CustomerForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

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

async function updateCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  try {
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
  } catch (e) {
    return apiErrorToState(e);
  }
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
          <CustomerForm
            mode="edit"
            action={updateCustomer}
            jenisList={jenisList}
            partners={partners}
            defaults={c}
            submitLabel="Simpan perubahan"
          />
        </Card>
      </PageContainer>
    </>
  );
}

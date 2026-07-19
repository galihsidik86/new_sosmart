import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { VendorForm } from '@/components/VendorForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

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
  akunUtangId: string | null;
  partnerTenantId: string | null;
}

async function updateVendor(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const id = String(formData.get('id'));
  try {
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
        akunUtangId: (formData.get('akunUtangId') as string) || null,
        partnerTenantId: (formData.get('partnerTenantId') as string) || null,
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/vendor');
  redirect('/master/vendor');
}

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const { id } = await params;
  const [v, partners, accounts] = await Promise.all([
    apiFetch<Vendor>(`/vendors/${id}`, { tenantId }),
    apiFetch<Array<{ tenantId: string; nama: string }>>('/consolidation/candidates', { tenantId }).catch(() => []),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
  ]);

  return (
    <>
      <PageContainer size="form">
        <Link href="/master/vendor" className="text-sm text-sogan-500 hover:underline">← Kembali</Link>
        <PageHeader title="Edit Vendor" subtitle={`${v.kode} · ${v.nama}`} className="mt-2" />
        <Card padding="lg">
          <VendorForm
            mode="edit"
            action={updateVendor}
            accounts={accounts}
            partners={partners}
            defaults={v}
            submitLabel="Simpan perubahan"
          />
          <CancelButton href="/master/vendor" />
        </Card>
      </PageContainer>
    </>
  );
}

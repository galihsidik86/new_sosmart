import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { VendorForm } from '@/components/VendorForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

async function createVendor(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, message: 'Tenant tidak aktif' };
  try {
    await apiFetch('/vendors', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        isPkp: formData.get('isPkp') === 'on',
        kategori: formData.get('kategori') || undefined,
        kota: formData.get('kota') || undefined,
        telp: formData.get('telp') || undefined,
        terminHari: Number(formData.get('terminHari') ?? 30),
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/vendor');
  redirect('/master/vendor');
}

export default async function VendorBaruPage() {
  await getSession();
  await getActiveTenantId();
  return (
    <PageContainer size="form">
      <div className="mb-2">
        <Link href="/master/vendor" className="text-sm text-sogan-500 hover:underline">← Kembali ke daftar</Link>
      </div>
      <PageHeader title="Tambah Vendor" subtitle="Isi data pemasok baru." />
      <Card padding="lg">
        <VendorForm mode="create" action={createVendor} />
        <CancelButton href="/master/vendor" />
      </Card>
    </PageContainer>
  );
}

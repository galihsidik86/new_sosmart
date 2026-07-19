import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { CustomerForm } from '@/components/CustomerForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface JenisPelanggan { id: string; nama: string }
interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, message: 'Tenant tidak aktif' };
  try {
    await apiFetch('/customers', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        npwp: (formData.get('npwp') as string)?.replace(/\D/g, '') || null,
        isPkp: formData.get('isPkp') === 'on',
        jenisPelangganId: formData.get('jenisPelangganId') || null,
        kota: formData.get('kota') || undefined,
        telp: formData.get('telp') || undefined,
        terminHari: Number(formData.get('terminHari') ?? 14),
        kreditLimit: String(formData.get('kreditLimit') ?? '0'),
        akunPiutangId: (formData.get('akunPiutangId') as string) || null,
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/pelanggan');
  redirect('/master/pelanggan');
}

export default async function PelangganBaruPage() {
  await getSession();
  const tenantId = (await getActiveTenantId())!;
  const [jenisList, accounts] = await Promise.all([
    apiFetch<JenisPelanggan[]>('/jenis-pelanggan', { tenantId }),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
  ]);

  return (
    <PageContainer size="form">
      <div className="mb-2">
        <Link href="/master/pelanggan" className="text-sm text-sogan-500 hover:underline">← Kembali ke daftar</Link>
      </div>
      <PageHeader title="Tambah Pelanggan" subtitle="Pelanggan PKP berhak menerima faktur pajak." />
      <Card padding="lg">
        <CustomerForm mode="create" action={createCustomer} jenisList={jenisList} accounts={accounts} />
        <CancelButton href="/master/pelanggan" />
      </Card>
    </PageContainer>
  );
}

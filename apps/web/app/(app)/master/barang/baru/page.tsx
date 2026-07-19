import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { CancelButton } from '@/components/CancelButton';
import { ItemForm } from '@/components/ItemForm';
import { apiErrorToState, type FormState } from '@/lib/form-state';

interface Pph23Tarif { id: string; kode: string; nama: string; tarif: string }
interface Account { id: string; kode: string; nama: string; kind: string; isPostable: boolean }

async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) return { ok: false, message: 'Tenant tidak aktif' };
  const isJasa = formData.get('isJasa') === 'on';
  const pph23TarifId = String(formData.get('pph23TarifId') ?? '');
  try {
    await apiFetch('/items', {
      method: 'POST',
      tenantId,
      body: JSON.stringify({
        kode: formData.get('kode'),
        nama: formData.get('nama'),
        kategori: formData.get('kategori') || undefined,
        satuan: formData.get('satuan') || 'Pcs',
        hargaJualDefault: String(formData.get('hargaJualDefault') ?? '0'),
        klasifikasiPpn: formData.get('klasifikasiPpn') ?? 'BKP',
        isJasa,
        akunPendapatanId: (formData.get('akunPendapatanId') as string) || null,
        akunPersediaanId: (formData.get('akunPersediaanId') as string) || null,
        akunHppId: (formData.get('akunHppId') as string) || null,
        akunBebanId: (formData.get('akunBebanId') as string) || null,
        pph23TarifId: isJasa && pph23TarifId ? pph23TarifId : null,
      }),
    });
  } catch (e) {
    return { ...apiErrorToState(e, formData), attempt: (_prev.attempt ?? 0) + 1 };
  }
  revalidatePath('/master/barang');
  redirect('/master/barang');
}

export default async function BarangBaruPage() {
  await getSession();
  const tenantId = (await getActiveTenantId())!;
  const [tarifList, accounts, prof] = await Promise.all([
    apiFetch<Pph23Tarif[]>('/pph23-tarif', { tenantId }).catch(() => [] as Pph23Tarif[]),
    apiFetch<Account[]>('/accounts?view=flat', { tenantId }),
    apiFetch<{ jenisUsaha?: 'DAGANG' | 'JASA' }>('/tenants/current', { tenantId }).catch(() => ({})),
  ]);
  const forceJasa = prof.jenisUsaha === 'JASA';

  return (
    <PageContainer size="form">
      <div className="mb-2">
        <Link href="/master/barang" className="text-sm text-sogan-500 hover:underline">← Kembali ke daftar</Link>
      </div>
      <PageHeader title="Tambah Barang / Jasa" subtitle="Isi data item baru." />
      <Card padding="lg">
        <ItemForm mode="create" action={createItem} tarifList={tarifList} accounts={accounts} forceJasa={forceJasa} />
        <CancelButton href="/master/barang" />
      </Card>
    </PageContainer>
  );
}

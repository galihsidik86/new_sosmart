import { redirect } from 'next/navigation';
import { OpnameForm } from '@/components/OpnameForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';
import { PageContainer, PageHeader } from '@/components/ui';
import { BackLink } from '@/components/BackLink';

interface Item { id: string; kode: string; nama: string; satuan: string; isAktif: boolean }
interface Cabang { id: string; kode: string; nama: string }
interface SaldoRow {
  item: { id: string; kode: string; nama: string; satuan: string };
  cabang: { id: string; kode: string };
  qty: string;
  nilai: string;
}

async function submitAdj(formData: FormData) {
  'use server';
  const tenantId = await getActiveTenantId();
  if (!tenantId) redirect('/login');
  const payload = JSON.parse(String(formData.get('payload')));
  await apiFetch('/stok-adjustments', {
    method: 'POST', tenantId,
    body: JSON.stringify(payload),
  });
}

export default async function OpnameBaruPage() {
  const s = (await getSession())!;
  const tenantId = (await getActiveTenantId())!;
  const [items, cabang, allSaldo] = await Promise.all([
    apiFetch<Item[]>('/items', { tenantId }),
    apiFetch<Cabang[]>('/cabang', { tenantId }),
    apiFetch<SaldoRow[]>('/inventory/saldo', { tenantId }),
  ]);
  // Group saldo per cabangId.
  const saldoMap: Record<string, SaldoRow[]> = {};
  for (const r of allSaldo) {
    (saldoMap[r.cabang.id] ??= []).push(r);
  }
  return (
    <>
      <PageContainer size="form">
        <BackLink href="/persediaan/penyesuaian" label="← Kembali ke daftar opname" />
        <PageHeader title="Opname Stok Baru" />
        <OpnameForm
          items={items}
          cabang={cabang}
          saldoMap={saldoMap}
          submit={submitAdj}
        />
      </PageContainer>
    </>
  );
}

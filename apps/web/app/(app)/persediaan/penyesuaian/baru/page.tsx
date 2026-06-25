import { redirect } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { OpnameForm } from '@/components/OpnameForm';
import { apiFetch } from '@/lib/api';
import { getActiveTenantId, getSession } from '@/lib/session';

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
      <Topbar breadcrumb="Penyesuaian Stok / Baru" tenantNama={s.tenantNama!} />
      <div className="px-8 py-6 max-w-7xl mx-auto w-full">
        <h1 className="font-display text-3xl font-semibold text-wedel-900 mb-6">
          Opname Stok Baru
        </h1>
        <OpnameForm
          items={items}
          cabang={cabang}
          saldoMap={saldoMap}
          submit={submitAdj}
        />
      </div>
    </>
  );
}
